import { route, readJson } from "@/lib/server/api";
import { generateFollowUp } from "@/lib/server/engine";

export const maxDuration = 45;

export const POST = route<{ id: string }>("chat.follow-up", async ({ req, actor, params }) => ({
  message: await generateFollowUp(params.id, actor, await readJson(req)),
}));
