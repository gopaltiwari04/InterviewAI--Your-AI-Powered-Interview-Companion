/**
 * Redis connection settings shared by the web app, the realtime server and
 * both workers. Every service must point REDIS_URL at the SAME Redis instance:
 * the queue, pub/sub notifications and the Socket.IO adapter all live there.
 *
 * - `rediss://` (Upstash and most managed Redis) enables TLS.
 * - The username (Upstash uses "default") and password are preserved.
 * - `maxRetriesPerRequest: null` is required by BullMQ workers.
 */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
  connectTimeout: number;
  retryStrategy: (times: number) => number;
}

export function getRedisUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.REDIS_URL;
  if (url) return url.replace("localhost", "127.0.0.1");
  if (env.NODE_ENV === "production") {
    throw new Error("REDIS_URL is not set. Add it to the service environment variables.");
  }
  return "redis://127.0.0.1:6379";
}

export function redisOptionsFromUrl(redisUrl: string): RedisConnectionOptions {
  const url = new URL(redisUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must start with redis:// or rediss://");
  }
  const db = url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : undefined;
  const host = url.hostname === "localhost" ? "127.0.0.1" : url.hostname;
  return {
    host,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number.isInteger(db) ? db : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 10_000,
    // Reconnect with capped exponential backoff so a Redis blip does not crash the service.
    retryStrategy: (times: number) => Math.min(30_000, 200 * 2 ** Math.min(times, 8)),
  };
}


/** Masked host and TLS flag only, safe to log. Never log the full URL. */
export function describeRedis(redisUrl: string): string {
  const url = new URL(redisUrl);
  const parts = url.hostname.split(".");
  const host = parts.length > 2 ? `***.${parts.slice(-2).join(".")}` : url.hostname;
  return `${host}:${url.port || 6379} (tls=${url.protocol === "rediss:"}, auth=${url.password ? "yes" : "no"})`;
}

/**
 * Stable fingerprint of the Redis endpoint (host:port:db), safe to log.
 * Services print it at startup so a mismatch between services is obvious.
 */
export function redisFingerprint(redisUrl: string): string {
  const url = new URL(redisUrl);
  const text = `${url.hostname}:${url.port || 6379}${url.pathname}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
