import { EXECUTION_QUEUE, EXECUTOR_HEARTBEAT_KEY, JUDGE_VERSION, summarizeVerdict, type ExecutionJob, type ExecutionResult } from "@repo/core/judge";
import { redisOptionsFromUrl } from "@repo/core/redis";
import { db } from "@repo/database";
import { Worker } from "bullmq";
import { Redis } from "ioredis";

export function assertTestDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/test/i.test(new URL(url).pathname)) throw new Error(`Refusing to run integration tests against ${new URL(url).pathname}: the database name must contain "test".`);
}

export async function resetDatabase() {
  assertTestDatabase();
  await db.$executeRawUnsafe(
    'TRUNCATE "ProctoringEvent", "Submission", "InterviewEvent", "InterviewQuestion", "InterviewReport", "InterviewParticipant", "InterviewRoom", "GeneratedProblem", "ResumeProfile", "Account", "Session", "User" RESTART IDENTITY CASCADE',
  );
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.flushdb();
  await redis.quit();
}

export async function createUser(name: string) {
  return db.user.create({ data: { name, email: `${name.toLowerCase()}-${Date.now()}-${Math.random()}@test.local` } });
}

/**
 * Stand-in for apps/code-executor so the engine's queue plumbing can be tested
 * without Docker: code containing "CORRECT" passes every test, anything else
 * fails the hidden ones. The real judge has its own Docker test suite.
 */
export async function startFakeExecutor() {
  const connection = redisOptionsFromUrl(process.env.REDIS_URL!);
  const redis = new Redis(connection);
  await redis.set(EXECUTOR_HEARTBEAT_KEY, JSON.stringify({ at: new Date().toISOString(), fake: true }), "EX", 600);
  const seen: ExecutionJob[] = [];
  const worker = new Worker<ExecutionJob, ExecutionResult>(
    EXECUTION_QUEUE,
    async (job) => {
      seen.push(job.data);
      const source = Object.values(job.data.files).join("\n");
      const correct = source.includes("CORRECT");
      const tests = job.data.tests.map((t) => ({
        id: t.id,
        visible: t.visible,
        verdict: t.expected === null ? ("EXECUTED" as const) : correct || t.visible ? ("ACCEPTED" as const) : ("WRONG_ANSWER" as const),
        timeMs: 5,
        ...(t.visible ? { stdout: t.expected ?? "custom output\n" } : {}),
      }));
      return {
        submissionId: job.data.submissionId,
        verdict: summarizeVerdict(tests),
        passed: tests.filter((t) => t.verdict === "ACCEPTED").length,
        total: tests.length,
        compileOutput: null,
        tests,
        executionTimeMs: 10,
        judgeVersion: JUDGE_VERSION,
      };
    },
    { connection },
  );
  return {
    seen,
    async stop() {
      await worker.close();
      await redis.del(EXECUTOR_HEARTBEAT_KEY);
      await redis.quit();
    },
  };
}

export async function waitFor<T>(fn: () => Promise<T>, done: (v: T) => boolean, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 200));
  }
}
