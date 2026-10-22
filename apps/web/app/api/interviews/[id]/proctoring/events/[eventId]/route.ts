import { route, readJson } from "@/lib/server/api";
import { reviewProctoringEvent } from "@/lib/server/engine";

/** Interviewers mark a signal as acknowledged or dismissed after reviewing it. */
export const PATCH = route<{ id: string; eventId: string }>("proctoring.review", async ({ req, actor, params }) => {
  const body = (await readJson(req)) as { status?: unknown };
  await reviewProctoringEvent(params.id, params.eventId, actor, body.status);
  return { ok: true };
});
