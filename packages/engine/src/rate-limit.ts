import { rateLimited } from "./errors";
import { getRedis, logger } from "./infra";

export interface RateLimitRule {
  /** Logical bucket name, e.g. "chat" or "submission". */
  name: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  createInterview: { name: "create-interview", limit: 10, windowSeconds: 3600 },
  submission: { name: "submission", limit: 30, windowSeconds: 60 },
  chat: { name: "chat", limit: 20, windowSeconds: 60 },
  aiGeneration: { name: "ai-generation", limit: 10, windowSeconds: 3600 },
  proctoring: { name: "proctoring", limit: 120, windowSeconds: 60 },
  resumeUpload: { name: "resume-upload", limit: 5, windowSeconds: 3600 },
  draft: { name: "draft", limit: 60, windowSeconds: 60 },
  realtimeToken: { name: "realtime-token", limit: 30, windowSeconds: 60 },
  evaluationRetry: { name: "evaluation-retry", limit: 5, windowSeconds: 3600 },
} satisfies Record<string, RateLimitRule>;

// Fallback when Redis is unavailable: per-instance memory. Weaker (each
// serverless instance has its own counters) but still blunts abuse.
const memory = new Map<string, { count: number; resetAt: number }>();

function memoryHit(key: string, rule: RateLimitRule, now: number): { count: number; resetAt: number } {
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + rule.windowSeconds * 1000 };
    memory.set(key, fresh);
    if (memory.size > 10_000) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    }
    return fresh;
  }
  entry.count++;
  return entry;
}

/**
 * Fixed-window counter keyed by rule and subject (usually the user ID).
 * Throws a 429 AppError when the limit is exceeded.
 */
export async function enforceRateLimit(rule: RateLimitRule, subject: string): Promise<void> {
  const now = Date.now();
  const window = Math.floor(now / (rule.windowSeconds * 1000));
  const key = `rl:${rule.name}:${subject}:${window}`;
  const redis = getRedis();
  let count: number;
  let resetAt = (window + 1) * rule.windowSeconds * 1000;
  if (redis && redis.status === "ready") {
    try {
      const results = await redis.multi().incr(key).expire(key, rule.windowSeconds + 5).exec();
      count = Number(results?.[0]?.[1] ?? 0);
    } catch (err) {
      logger.warn("rate limiter falling back to memory", { error: (err as Error).message });
      ({ count, resetAt } = memoryHit(key, rule, now));
    }
  } else {
    ({ count, resetAt } = memoryHit(key, rule, now));
  }
  if (count > rule.limit) throw rateLimited(Math.max(1, Math.ceil((resetAt - now) / 1000)));
}
