/**
 * Readiness checks. Reports only up/down state and latencies, never
 * connection strings, hostnames with credentials or stack traces.
 */
import { getEnv } from "./env";
import { db, getRedis, withTimeout } from "./infra";
import { evaluationWorkerStatus, executorStatus, queueMetrics, type QueueMetrics } from "./queues";

export interface DependencyStatus {
  status: "up" | "down" | "not_configured";
  latencyMs?: number;
  detail?: string;
}

export interface Readiness {
  ready: boolean;
  checks: {
    database: DependencyStatus;
    redis: DependencyStatus;
    codeExecutor: DependencyStatus;
    evaluationWorker: DependencyStatus;
    ai: DependencyStatus;
  };
  queues?: QueueMetrics[];
}

async function timed(fn: () => Promise<unknown>): Promise<DependencyStatus> {
  const started = Date.now();
  try {
    await withTimeout(fn(), 3000, "check");
    return { status: "up", latencyMs: Date.now() - started };
  } catch (err) {
    return { status: "down", latencyMs: Date.now() - started, detail: (err as Error).message.includes("timed out") ? "timeout" : "unreachable" };
  }
}

export async function readiness(includeQueues = false): Promise<Readiness> {
  const env = getEnv();
  const redis = getRedis();
  const [database, redisStatus, executor, evaluator] = await Promise.all([
    timed(() => db.$queryRaw`SELECT 1`),
    redis ? timed(() => redis.ping()) : Promise.resolve<DependencyStatus>({ status: "not_configured" }),
    redis ? executorStatus() : Promise.resolve({ online: false, details: null }),
    redis ? evaluationWorkerStatus() : Promise.resolve({ online: false, details: null }),
  ]);
  const checks: Readiness["checks"] = {
    database,
    redis: redisStatus,
    codeExecutor: redis ? { status: executor.online ? "up" : "down" } : { status: "not_configured" },
    evaluationWorker: redis ? { status: evaluator.online ? "up" : "down", detail: evaluator.online ? undefined : "evaluations run inline in the web app" } : { status: "not_configured" },
    ai: { status: env.AI_PROVIDER === "mock" || env.GOOGLE_GENERATIVE_AI_API_KEY ? "up" : "not_configured", detail: env.AI_PROVIDER === "mock" ? "mock provider" : undefined },
  };
  let queues: QueueMetrics[] | undefined;
  if (includeQueues && redisStatus.status === "up") queues = await withTimeout(queueMetrics(), 3000, "queue metrics").catch(() => undefined);
  // The web app can serve pages without Redis or workers; only the database is essential.
  return { ready: database.status === "up", checks, queues };
}
