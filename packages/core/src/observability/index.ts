/**
 * Minimal structured JSON logger shared by every service.
 *
 * - One JSON object per line, so Render / Vercel / Docker log drains can parse it.
 * - Keys that look like secrets are redacted, long strings are truncated, and
 *   URLs have their credentials stripped, so a careless log call cannot leak
 *   an API key, a Redis password or a candidate's full code.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential|private|session/i;
const MAX_STRING = 2000;

function sanitizeString(value: string): string {
  // Strip credentials from URLs such as rediss://default:pw@host or postgres://u:p@h.
  const stripped = value.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]*:[^\s/@]*@/gi, "$1***:***@");
  return stripped.length > MAX_STRING ? `${stripped.slice(0, MAX_STRING)}…(${stripped.length} chars)` : stripped;
}

export function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) {
    return { name: value.name, message: sanitizeString(value.message), ...(depth < 2 && value.cause ? { cause: sanitize(value.cause, depth + 1) } : {}) };
  }
  if (depth >= 4) return "[depth limit]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? "[redacted]" : sanitize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

function envLevel(): LogLevel {
  const raw = (typeof process !== "undefined" ? process.env.LOG_LEVEL : undefined)?.toLowerCase();
  return raw && raw in LEVELS ? (raw as LogLevel) : "info";
}

export function createLogger(service: string, base: LogFields = {}): Logger {
  const min = LEVELS[envLevel()];
  const write = (level: LogLevel, msg: string, fields?: LogFields) => {
    if (LEVELS[level] < min) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service,
      msg,
      ...(sanitize({ ...base, ...fields }) as LogFields),
    });
    if (level === "error" || level === "warn") console.error(line);
    else console.log(line);
  };
  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (fields) => createLogger(service, { ...base, ...fields }),
  };
}

/** Error message safe to show a user or log without a stack trace. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return sanitizeString(error.message);
  return sanitizeString(String(error));
}

/** Rolling latency/error counters for /metrics-style health output. */
export class LatencyTracker {
  private samples: number[] = [];
  private errors = 0;
  private total = 0;

  constructor(private readonly capacity = 500) {}

  record(ms: number, ok: boolean): void {
    this.total++;
    if (!ok) this.errors++;
    this.samples.push(ms);
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  snapshot(): { count: number; errorRate: number; p50: number | null; p95: number | null } {
    const sorted = [...this.samples].sort((a, b) => a - b);
    const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]! : null);
    return { count: this.total, errorRate: this.total ? this.errors / this.total : 0, p50: pct(50), p95: pct(95) };
  }
}
