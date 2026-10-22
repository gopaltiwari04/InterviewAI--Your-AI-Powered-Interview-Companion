import { after } from "next/server";
import { route } from "@/lib/server/api";
import { logger, retryEvaluation, runEvaluation } from "@/lib/server/engine";

export const maxDuration = 60;

export const POST = route<{ id: string }>("evaluation.retry", async ({ actor, params }) => {
  const mode = await retryEvaluation(params.id, actor);
  if (mode === "inline") after(() => runEvaluation(params.id).catch((e) => logger.error("inline evaluation failed", { roomId: params.id, error: (e as Error).message })));
  return { mode };
});
