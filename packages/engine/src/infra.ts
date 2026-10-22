/**
 * Lazily created infrastructure clients. In serverless functions the module
 * instance is reused between invocations, so connections are reused too.
 */
import { createLogger } from "@repo/core/observability";
import { describeRedis, redisFingerprint, redisOptionsFromUrl } from "@repo/core/redis";
import { db } from "@repo/database";
import { Redis } from "ioredis";
import { getEnv } from "./env";

export { db };
export const logger = createLogger("engine");

type GlobalWithRedis = typeof globalThis & { __iaRedis?: Redis | null };
const g = globalThis as GlobalWithRedis;

export function isRedisConfigured(): boolean {
  return Boolean(getEnv().REDIS_URL);
}

/** Shared ioredis client, or null when REDIS_URL is not configured. */
export function getRedis(): Redis | null {
  if (g.__iaRedis !== undefined) return g.__iaRedis;
  const url = getEnv().REDIS_URL;
  if (!url) {
    g.__iaRedis = null;
    return null;
  }
  const client = new Redis({
    ...redisOptionsFromUrl(url),
    // Request handlers should fail fast rather than queue commands forever.
    maxRetriesPerRequest: 2,
    enableOfflineQueue: true,
    lazyConnect: false,
  });
  client.on("error", (err) => logger.warn("redis error", { error: err.message }));
  logger.info("redis client created", { redis: describeRedis(url), redisFingerprint: redisFingerprint(url) });
  g.__iaRedis = client;
  return client;
}

/** Connection options for BullMQ producers (separate connection per queue, created by BullMQ). */
export function bullConnection() {
  const url = getEnv().REDIS_URL;
  if (!url) return null;
  return redisOptionsFromUrl(url);
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
