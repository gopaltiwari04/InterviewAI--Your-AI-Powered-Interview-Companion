/**
 * Code-execution worker. Consumes judge jobs from BullMQ, runs them in
 * hardened Docker sandboxes and stores the verdict as the job's return value.
 *
 * This process only needs REDIS_URL: it never receives database credentials
 * or AI keys, which keeps the blast radius small if a sandbox is escaped.
 * It must run on a host with a Docker daemon (a VM, not serverless).
 */
import "dotenv/config";
import { createServer } from "node:http";
import os from "node:os";
import { Job, UnrecoverableError, Worker } from "bullmq";
import { Redis } from "ioredis";
import {
  EXECUTION_QUEUE,
  EXECUTOR_HEARTBEAT_KEY,
  JUDGE_VERSION,
  SUBMISSION_CHANNEL_PREFIX,
  executionJobSchema,
  type ExecutionJob,
  type ExecutionResult,
} from "@repo/core/judge";
import { createLogger, errorMessage } from "@repo/core/observability";
import { describeRedis, getRedisUrl, redisFingerprint, redisOptionsFromUrl } from "@repo/core/redis";
import { loadConfig } from "./config.js";
import { JudgeInfrastructureError, judge } from "./judge.js";
import { LANGUAGES } from "./languages.js";
import { dockerAvailable, ensureImage, removeStaleSandboxes, type SandboxConfig } from "./sandbox.js";

const config = loadConfig();
const instance = `${os.hostname()}-${process.pid}`;
const log = createLogger("code-executor", { instance });

const redisUrl = getRedisUrl();
const connection = redisOptionsFromUrl(redisUrl);
log.info("starting", { redis: describeRedis(redisUrl), redisFingerprint: redisFingerprint(redisUrl), queue: EXECUTION_QUEUE, concurrency: config.EXECUTOR_CONCURRENCY });

const sandboxConfig: SandboxConfig = {
  dockerBin: config.DOCKER_BIN,
  runtime: config.SANDBOX_RUNTIME,
  cpus: config.SANDBOX_CPUS,
  pidsLimit: config.SANDBOX_PIDS_LIMIT,
  lifetimeSeconds: config.SANDBOX_LIFETIME_SECONDS,
};

const redis = new Redis(connection);
redis.on("error", (err) => log.warn("redis error", { error: err.message }));

const stats = { processed: 0, failed: 0, active: 0, lastJobAt: null as string | null, dockerOk: false };

async function publish(job: ExecutionJob, status: "COMPLETED" | "FAILED") {
  if (!job.roomId) return;
  // Notification only: clients fetch the (sanitised) result through the authenticated web API.
  await redis
    .publish(`${SUBMISSION_CHANNEL_PREFIX}${job.roomId}`, JSON.stringify({ submissionId: job.submissionId, status }))
    .catch((err) => log.warn("publish failed", { error: errorMessage(err) }));
}

async function processJob(job: Job<ExecutionJob, ExecutionResult>): Promise<ExecutionResult> {
  const parsed = executionJobSchema.safeParse(job.data);
  if (!parsed.success) {
    log.error("rejected malformed job", { jobId: job.id, issues: parsed.error.issues.slice(0, 5).map((i) => i.message) });
    throw new UnrecoverableError("Malformed execution job");
  }
  const data = parsed.data;
  const jobLog = log.child({ jobId: job.id, submissionId: data.submissionId, roomId: data.roomId, kind: data.kind, language: data.language });
  stats.active++;
  stats.lastJobAt = new Date().toISOString();
  const queuedMs = Date.now() - job.timestamp;
  jobLog.info("job started", { tests: data.tests.length, queueWaitMs: queuedMs, attempt: job.attemptsMade + 1 });

  try {
    const result = await judge(data, sandboxConfig);
    jobLog.info("job finished", { verdict: result.verdict, passed: result.passed, total: result.total, executionTimeMs: result.executionTimeMs });
    stats.processed++;
    // Hidden tests and source code are no longer needed in Redis once the verdict exists.
    await job
      .updateData({ ...data, files: {}, tests: data.tests.map((t) => ({ id: t.id, visible: t.visible, input: "", expected: null })) })
      .catch((err) => jobLog.warn("could not scrub job data", { error: errorMessage(err) }));
    await publish(data, "COMPLETED");
    return result;
  } catch (err) {
    stats.failed++;
    if (err instanceof JudgeInfrastructureError) {
      jobLog.error("sandbox infrastructure failure", { error: errorMessage(err) });
    } else {
      jobLog.error("job crashed", { error: errorMessage(err) });
    }
    throw err;
  } finally {
    stats.active--;
  }
}

const worker = new Worker<ExecutionJob, ExecutionResult>(EXECUTION_QUEUE, processJob, {
  connection,
  concurrency: config.EXECUTOR_CONCURRENCY,
  // Long-poll for 30s while idle: jobs are still picked up immediately, but an
  // idle worker sends far fewer commands (Upstash bills per command).
  drainDelay: 30,
  maxStalledCount: 1,
});

worker.on("failed", (job, err) => {
  if (!job) return;
  const attempts = job.opts.attempts ?? 1;
  if (job.attemptsMade >= attempts) {
    log.error("job failed permanently", { jobId: job.id, error: errorMessage(err) });
    void publish(job.data, "FAILED");
  }
});
worker.on("error", (err) => log.error("worker error", { error: errorMessage(err) }));

const sendHeartbeat = () =>
  redis
    .set(
      EXECUTOR_HEARTBEAT_KEY,
      JSON.stringify({ at: new Date().toISOString(), instance, judgeVersion: JUDGE_VERSION, concurrency: config.EXECUTOR_CONCURRENCY, docker: stats.dockerOk }),
      "EX",
      90,
    )
    .catch((err) => log.warn("heartbeat failed", { error: errorMessage(err) }));

let heartbeat: NodeJS.Timeout | undefined;

async function startup() {
  stats.dockerOk = await dockerAvailable(config.DOCKER_BIN);
  if (!stats.dockerOk) {
    log.error("Docker is not available on this host; every job will fail until it is installed and running");
  } else {
    const removed = await removeStaleSandboxes(sandboxConfig, config.SANDBOX_LIFETIME_SECONDS * 1000);
    if (removed > 0) log.warn("removed stale sandbox containers", { removed });
    if (config.SANDBOX_PREPULL === "true") {
      const images = [...new Set(Object.values(LANGUAGES).map((l) => l.image))];
      for (const image of images) {
        const ok = await ensureImage(config.DOCKER_BIN, image);
        log.info(ok ? "sandbox image ready" : "sandbox image unavailable", { image });
      }
    }
  }
  // Only advertise the worker once Docker has been checked.
  await sendHeartbeat();
  heartbeat = setInterval(() => {
    void dockerAvailable(config.DOCKER_BIN).then((ok) => {
      stats.dockerOk = ok;
      return sendHeartbeat();
    });
  }, 30_000);
}

const health = createServer((req, res) => {
  const body = {
    status: stats.dockerOk && redis.status === "ready" ? "ok" : "degraded",
    docker: stats.dockerOk,
    redis: redis.status,
    activeJobs: stats.active,
    processed: stats.processed,
    failed: stats.failed,
    lastJobAt: stats.lastJobAt,
    judgeVersion: JUDGE_VERSION,
    uptimeSeconds: Math.round(process.uptime()),
  };
  const ready = req.url === "/ready" ? body.status === "ok" : true;
  res.writeHead(ready ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
});
if (config.EXECUTOR_HEALTH_PORT > 0) {
  health.listen(config.EXECUTOR_HEALTH_PORT, config.EXECUTOR_HEALTH_HOST, () => log.info("health server listening", { port: config.EXECUTOR_HEALTH_PORT }));
}

void startup().catch((err) => log.error("startup failed", { error: errorMessage(err) }));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutting down", { signal, activeJobs: stats.active });
  if (heartbeat) clearInterval(heartbeat);
  const force = setTimeout(() => {
    log.warn("forcing exit with jobs still active; they will be retried as stalled jobs");
    process.exit(1);
  }, 60_000);
  force.unref();
  await worker.close().catch(() => undefined);
  await redis.del(EXECUTOR_HEARTBEAT_KEY).catch(() => undefined);
  await redis.quit().catch(() => undefined);
  health.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
