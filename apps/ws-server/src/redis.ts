import type { RedisOptions } from 'ioredis';

/**
 * Turns REDIS_URL into explicit ioredis/BullMQ connection options.
 *
 * - `rediss://` (Upstash and most managed Redis) enables TLS.
 * - The username (Upstash uses "default") and password are kept.
 * - `maxRetriesPerRequest: null` is required by BullMQ for blocking commands.
 */
export function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (url) return url;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('REDIS_URL is not set. Add it to the service environment variables.');
  }
  return 'redis://localhost:6379';
}

export function redisOptionsFromUrl(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);
  const db = url.pathname && url.pathname !== '/' ? Number(url.pathname.slice(1)) : undefined;

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number.isInteger(db) ? db : undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

/** Masked host and TLS flag only, safe to log. Never log the full URL. */
export function describeRedis(redisUrl: string): string {
  const url = new URL(redisUrl);
  const host = url.hostname.split('.').length > 2 ? `***.${url.hostname.split('.').slice(-2).join('.')}` : url.hostname;
  return `${host}:${url.port || 6379} (tls=${url.protocol === 'rediss:'})`;
}
