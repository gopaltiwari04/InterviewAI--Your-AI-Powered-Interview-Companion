import { route, readJson } from "@/lib/server/api";
import { listChat, sendChatMessage } from "@/lib/server/engine";

export const maxDuration = 45;

export const GET = route<{ id: string }>("chat.list", async ({ actor, params }) => listChat(params.id, actor));
export const POST = route<{ id: string }>("chat.send", async ({ req, actor, params }) => sendChatMessage(params.id, actor, await readJson(req, 96 * 1024)));
