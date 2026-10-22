import { route, readJson } from "@/lib/server/api";
import { saveDraft } from "@/lib/server/engine";

export const PUT = route<{ id: string; questionId: string }>("questions.draft", async ({ req, actor, params }) =>
  saveDraft(params.id, params.questionId, actor, await readJson(req, 80 * 1024)),
);
