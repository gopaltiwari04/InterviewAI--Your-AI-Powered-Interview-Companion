/**
 * Evaluation worker.
 *
 *  - Consumes the "interview-evaluation" BullMQ queue. Each job evaluates one
 *    interview; runEvaluation() claims the report atomically, so duplicate or
 *    retried jobs never produce duplicate results.
 *  - Transient AI failures are retried by BullMQ (3 attempts, exponential
 *    backoff); the final attempt stores a partial, judge-based report.
 *  - Every minute it completes interviews whose deadline passed and picks up
 *    evaluations that were left PENDING (e.g. Redis was down when enqueued).
 *
 * It never executes candidate code (that is apps/code-executor's job).
 */
import "dotenv/config";
import { createServer } from "node:http";
import os from "node:os";
import { EVALUATION_QUEUE, EVALUATION_WORKER_HEARTBEAT_KEY, type EvaluationJobData } from "@repo/core/evaluation";
import { createLogger, errorMessage } from "@repo/core/observability";
import { describeRedis, getRedisUrl, redisFingerprint, redisOptionsFromUrl } from "@repo/core/redis";
import { RetryableEvaluationError, db, expireOverdueInterviews, getEnv, runEvaluation } from "@repo/engine";
import { Job, Worker } from "bullmq";
import { Redis } from "ioredis";

const log = createLogger("worker", { instance: `${os.hostname()}-${process.pid}` });
const env = getEnv(); // fail fast on invalid configuration
const redisUrl = getRedisUrl();
const connection = redisOptionsFromUrl(redisUrl);
log.info("starting", { redis: describeRedis(redisUrl), redisFingerprint: redisFingerprint(redisUrl), aiProvider: env.AI_PROVIDER, aiConfigured: Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY) || env.AI_PROVIDER === "mock" });

const redis = new Redis(connection);
redis.on("error", (err) => log.warn("redis error", { error: err.message }));
const stats = { processed: 0, retried: 0, failed: 0, active: 0, sweeps: 0, lastSweepAt: null as string | null };

async function processJob(job: Job<EvaluationJobData>) {
  const attempts = job.opts.attempts ?? 1;
  const finalAttempt = job.attemptsMade + 1 >= attempts;
  const jobLog = log.child({ jobId: job.id, roomId: job.data.roomId, attempt: job.attemptsMade + 1, attempts });
  stats.active++;
  const started = Date.now();
  try {
    const outcome = await runEvaluation(job.data.roomId, { finalAttempt });
    stats.processed++;
    jobLog.info("evaluation job done", { outcome, durationMs: Date.now() - started, queueWaitMs: started - job.timestamp });
    return outcome;
  } catch (err) {
    if (err instanceof RetryableEvaluationError) {
      stats.retried++;
      jobLog.warn("transient AI failure, will retry", { error: err.message });
    } else {
      stats.failed++;
      jobLog.error("evaluation job failed", { error: errorMessage(err) });
    }
    throw err;
  } finally {
    stats.active--;
  }
}

const worker = new Worker<EvaluationJobData>(EVALUATION_QUEUE, processJob, {
  connection,
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
  drainDelay: 30,
  // AI calls can take a while; BullMQ renews the lock automatically while the job runs.
  lockDuration: 120_000,
  maxStalledCount: 2,
});
worker.on("failed", (job, err) => log.warn("job attempt failed", { jobId: job?.id, attemptsMade: job?.attemptsMade, error: errorMessage(err) }));
worker.on("error", (err) => log.error("worker error", { error: errorMessage(err) }));

async function sweep() {
  try {
    const expired = await expireOverdueInterviews();
    // Evaluations stuck in PENDING (their job was never enqueued or was lost) are run here.
    const stale = await db.interviewReport.findMany({
      where: { status: "PENDING", updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
      select: { roomId: true },
      take: 10,
    });
    for (const r of stale) await runEvaluation(r.roomId, { finalAttempt: true }).catch((e) => log.warn("sweep evaluation failed", { roomId: r.roomId, error: errorMessage(e) }));
    stats.sweeps++;
    stats.lastSweepAt = new Date().toISOString();
    if (expired || stale.length) log.info("sweep", { expired, recoveredEvaluations: stale.length });
  } catch (err) {
    log.warn("sweep failed", { error: errorMessage(err) });
  }
}

const heartbeat = () =>
  redis
    .set(EVALUATION_WORKER_HEARTBEAT_KEY, JSON.stringify({ at: new Date().toISOString(), pid: process.pid }), "EX", 90)
    .catch((err) => log.warn("heartbeat failed", { error: err.message }));
void heartbeat();
const timers = [setInterval(() => void heartbeat(), 30_000), setInterval(() => void sweep(), 60_000)];
void sweep();

const port = Number(process.env.WORKER_HEALTH_PORT ?? process.env.PORT ?? 8091);
const health = createServer((req, res) => {
  const ready = redis.status === "ready";
  res.writeHead(req.url === "/ready" && !ready ? 503 : 200, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify({ status: ready ? "ok" : "degraded", redis: redis.status, ...stats, uptimeSeconds: Math.round(process.uptime()) }));
});
health.listen(port, "0.0.0.0", () => log.info("health server listening", { port }));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutting down", { signal, active: stats.active });
  timers.forEach(clearInterval);
  const force = setTimeout(() => process.exit(1), 90_000);
  force.unref();
  await worker.close().catch(() => undefined);
  await redis.del(EVALUATION_WORKER_HEARTBEAT_KEY).catch(() => undefined);
  await redis.quit().catch(() => undefined);
  await db.$disconnect().catch(() => undefined);
  health.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
