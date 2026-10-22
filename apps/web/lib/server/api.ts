import "server-only";
import { randomUUID } from "node:crypto";
import { LatencyTracker, createLogger, errorMessage } from "@repo/core/observability";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { AppError, type Actor } from "./engine";

const log = createLogger("web");
const g = globalThis as typeof globalThis & { __iaLatency?: Map<string, LatencyTracker> };
g.__iaLatency ??= new Map();

/** Per-route latency and error-rate counters (per server instance), exposed by /api/ready?metrics=1. */
export function routeMetrics() {
  return Object.fromEntries([...g.__iaLatency!.entries()].map(([route, t]) => [route, t.snapshot()]));
}

function track(route: string, ms: number, ok: boolean) {
  let t = g.__iaLatency!.get(route);
  if (!t) g.__iaLatency!.set(route, (t = new LatencyTracker()));
  t.record(ms, ok);
}

export class HttpError extends AppError {}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defence for cookie-authenticated mutations: the browser always sends
 * an Origin header on cross-site POSTs, so requiring it to match our host
 * blocks forged requests (SameSite=Lax cookies are the second layer).
 */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin" || req.headers.get("sec-fetch-site") === null;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export interface RouteContext<P> {
  req: NextRequest;
  actor: Actor;
  params: P;
  requestId: string;
}

type Handler<P> = (ctx: RouteContext<P>) => Promise<unknown>;

/**
 * Wraps an authenticated route handler: session check, same-origin check for
 * mutations, request ID, structured access log, latency metrics and mapping
 * of AppErrors to JSON. Unknown errors become a generic 500 without a stack.
 */
export function route<P extends Record<string, string> = Record<string, never>>(name: string, handler: Handler<P>) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    const requestId = req.headers.get("x-request-id")?.slice(0, 64) || randomUUID();
    const started = performance.now();
    let status = 200;
    let userId: string | undefined;
    try {
      if (MUTATING.has(req.method) && !sameOrigin(req)) throw new AppError(403, "BAD_ORIGIN", "Cross-site requests are not allowed.");
      const session = await auth();
      if (!session?.user?.id) throw new AppError(401, "UNAUTHORIZED", "Please sign in to continue.");
      userId = session.user.id;
      const params = (await context.params) ?? ({} as P);
      const body = await handler({ req, actor: { userId, name: session.user.name }, params, requestId });
      if (body instanceof Response) {
        status = body.status;
        return body;
      }
      return NextResponse.json(body ?? { ok: true }, { headers: { "x-request-id": requestId, "cache-control": "no-store" } });
    } catch (err) {
      if (err instanceof AppError) {
        status = err.status;
        const headers: Record<string, string> = { "x-request-id": requestId, "cache-control": "no-store" };
        const retry = (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
        if (retry) headers["retry-after"] = String(retry);
        return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details ?? null } }, { status: err.status, headers });
      }
      status = 500;
      log.error("unhandled route error", { route: name, requestId, userId, error: errorMessage(err) });
      return NextResponse.json(
        { error: { code: "INTERNAL", message: "Something went wrong. Please try again.", details: { requestId } } },
        { status: 500, headers: { "x-request-id": requestId } },
      );
    } finally {
      const ms = Math.round(performance.now() - started);
      track(name, ms, status < 500);
      log.info("request", { route: name, method: req.method, status, durationMs: ms, requestId, userId });
    }
  };
}

/** Reads a JSON body with a size cap. */
export async function readJson(req: NextRequest, maxBytes = 256 * 1024): Promise<unknown> {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new AppError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) throw new AppError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, "BAD_JSON", "Request body must be valid JSON.");
  }
}
