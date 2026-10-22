import { auth } from "@/auth";
import { routeMetrics } from "@/lib/server/api";
import { readiness } from "@/lib/server/engine";

export const dynamic = "force-dynamic";

/**
 * Readiness: database, Redis, code judge, evaluation worker and AI status.
 * Returns up/down state only, never hostnames, credentials or stack traces.
 * Queue depth and per-route latency are only included for signed-in users.
 */
export async function GET(req: Request) {
  const detailed = new URL(req.url).searchParams.get("metrics") === "1" && Boolean((await auth())?.user?.id);
  const result = await readiness(detailed);
  return Response.json(
    { ...result, ...(detailed ? { routes: routeMetrics() } : {}) },
    { status: result.ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
