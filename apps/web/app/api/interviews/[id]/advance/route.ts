import { after } from "next/server";
import { route, readJson } from "@/lib/server/api";
import { advanceQuestion, logger, runEvaluation } from "@/lib/server/engine";

export const maxDuration = 60;

/** Moves to the next question, or finishes the interview after the last one. */
export const POST = route<{ id: string }>("interviews.advance", async ({ req, actor, params }) => {
  const result = await advanceQuestion(params.id, actor, await readJson(req));
  if (result.evaluation === "inline") after(() => runEvaluation(params.id).catch((e) => logger.error("inline evaluation failed", { roomId: params.id, error: (e as Error).message })));
  return result;
});
