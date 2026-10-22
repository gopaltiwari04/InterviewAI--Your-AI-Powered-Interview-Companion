import { route } from "@/lib/server/api";
import { createInvite } from "@/lib/server/engine";

export const POST = route<{ id: string }>("interviews.invite", async ({ actor, params }) => createInvite(params.id, actor));
