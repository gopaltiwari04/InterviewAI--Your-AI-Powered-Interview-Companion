import { route, readJson } from "@/lib/server/api";
import { acceptInvite } from "@/lib/server/engine";

export const POST = route("invites.accept", async ({ req, actor }) => {
  const body = (await readJson(req)) as { token?: unknown };
  return acceptInvite(body.token, actor);
});
