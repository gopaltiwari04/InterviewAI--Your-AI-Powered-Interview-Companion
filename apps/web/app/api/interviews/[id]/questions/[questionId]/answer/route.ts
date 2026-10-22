import { route, readJson } from "@/lib/server/api";
import { submitAnswer } from "@/lib/server/engine";

export const POST = route<{ id: string; questionId: string }>("questions.answer", async ({ req, actor, params }) =>
  submitAnswer(params.id, params.questionId, actor, await readJson(req, 32 * 1024)),
);
