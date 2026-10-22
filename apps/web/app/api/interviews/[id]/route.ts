import { route } from "@/lib/server/api";
import { getInterview, listChat, listSubmissions } from "@/lib/server/engine";

/** Full interview state for (re)connecting clients: questions, chat and recent submissions. */
export const GET = route<{ id: string }>("interviews.get", async ({ actor, params }) => {
  const interview = await getInterview(params.id, actor);
  const [chat, submissions] = await Promise.all([listChat(params.id, actor), listSubmissions(params.id, actor)]);
  return { interview, chat, submissions };
});
