import { after } from "next/server";
import { route } from "@/lib/server/api";
import { completeInterview, logger, runEvaluation } from "@/lib/server/engine";

export const maxDuration = 60;

export const POST = route<{ id: string }>("interviews.complete", async ({ actor, params }) => {
  const result = await completeInterview(params.id, actor);
  // No evaluation worker online: evaluate after responding, within this function's time budget.
  if (result.evaluation === "inline") after(() => runEvaluation(params.id).catch((e) => logger.error("inline evaluation failed", { roomId: params.id, error: (e as Error).message })));
  return result;
});
