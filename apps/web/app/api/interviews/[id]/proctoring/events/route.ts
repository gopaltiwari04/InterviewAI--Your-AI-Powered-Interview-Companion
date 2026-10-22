import { route, readJson } from "@/lib/server/api";
import { ingestProctoringEvents } from "@/lib/server/engine";

/** Accepts event batches, including navigator.sendBeacon flushes when the tab is closing. */
export const POST = route<{ id: string }>("proctoring.events", async ({ req, actor, params }) => ingestProctoringEvents(params.id, actor, await readJson(req, 64 * 1024)));
