// Liveness: the process is up. No dependencies are touched and nothing sensitive is returned.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", service: "web", time: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
