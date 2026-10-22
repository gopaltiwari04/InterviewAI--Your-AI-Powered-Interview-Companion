import { EVALUATION_QUEUE, EVALUATION_WORKER_HEARTBEAT_KEY, type EvaluationJobData } from "@repo/core/evaluation";
import { EXECUTION_QUEUE, EXECUTOR_HEARTBEAT_KEY, type ExecutionJob, type ExecutionResult } from "@repo/core/judge";
import { Job, Queue } from "bullmq";
import { unavailable } from "./errors";
import { bullConnection, getRedis, logger } from "./infra";

type QueueCache = typeof globalThis & { __iaQueues?: Map<string, Queue> };
const g = globalThis as QueueCache;

function queue<T, R = unknown>(name: string): Queue<T, R> {
  g.__iaQueues ??= new Map();
  const existing = g.__iaQueues.get(name);
  if (existing) return existing as unknown as Queue<T, R>;
  const connection = bullConnection();
  if (!connection) throw unavailable("Background jobs need REDIS_URL to be configured.");
  const q = new Queue<T, R>(name, { connection: { ...connection, maxRetriesPerRequest: 2 } });
  q.on("error", (err) => logger.warn("queue error", { queue: name, error: err.message }));
  g.__iaQueues.set(name, q as unknown as Queue);
  return q;
}

export const executionQueue = () => queue<ExecutionJob, ExecutionResult>(EXECUTION_QUEUE);
export const evaluationQueue = () => queue<EvaluationJobData>(EVALUATION_QUEUE);

export interface WorkerStatus {
  online: boolean;
  details: Record<string, unknown> | null;
}

async function heartbeat(key: string): Promise<WorkerStatus> {
  const redis = getRedis();
  if (!redis) return { online: false, details: null };
  try {
    const raw = await redis.get(key);
    if (!raw) return { online: false, details: null };
    try {
      return { online: true, details: JSON.parse(raw) as Record<string, unknown> };
    } catch {
      return { online: true, details: null };
    }
  } catch (err) {
    logger.warn("heartbeat lookup failed", { key, error: (err as Error).message });
    return { online: false, details: null };
  }
}

export const executorStatus = () => heartbeat(EXECUTOR_HEARTBEAT_KEY);
export const evaluationWorkerStatus = () => heartbeat(EVALUATION_WORKER_HEARTBEAT_KEY);

/**
 * Adds a judge job. The submission ID is the BullMQ job ID, so enqueueing the
 * same submission twice is a no-op (idempotent producer).
 */
export async function enqueueExecution(job: ExecutionJob): Promise<void> {
  await executionQueue().add(job.kind, job, {
    jobId: job.submissionId,
    attempts: 2,
    backoff: { type: "exponential", delay: 2000 },
    // Results are read back by the web app; keep them for a day, then let Redis reclaim the memory.
    removeOnComplete: { age: 24 * 3600, count: 5000 },
    removeOnFail: { age: 24 * 3600, count: 5000 },
  });
}

export type JobLookup =
  | { state: "completed"; result: ExecutionResult }
  | { state: "failed"; reason: string }
  | { state: "pending"; detail: string }
  | { state: "missing" };

export async function lookupExecution(submissionId: string): Promise<JobLookup> {
  const job = await Job.fromId<ExecutionJob, ExecutionResult>(executionQueue(), submissionId);
  if (!job) return { state: "missing" };
  const state = await job.getState();
  if (state === "completed") return { state: "completed", result: job.returnvalue };
  if (state === "failed") return { state: "failed", reason: job.failedReason || "execution failed" };
  return { state: "pending", detail: state };
}

export async function enqueueEvaluation(roomId: string, attempt: number): Promise<void> {
  await evaluationQueue().add(
    "evaluate",
    { roomId, requestedAt: new Date().toISOString() },
    {
      // One job per evaluation attempt: duplicate clicks do not create duplicate work.
      jobId: `eval-${roomId}-${attempt}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 7 * 24 * 3600, count: 2000 },
      removeOnFail: { age: 7 * 24 * 3600, count: 2000 },
    },
  );
}

export interface QueueMetrics {
  name: string;
  counts: Record<string, number>;
}

export async function queueMetrics(): Promise<QueueMetrics[]> {
  const out: QueueMetrics[] = [];
  for (const q of [executionQueue(), evaluationQueue()]) {
    const counts = await q.getJobCounts("waiting", "active", "delayed", "failed", "completed");
    out.push({ name: q.name, counts });
  }
  return out;
}
