import { route } from "@/lib/server/api";
import { cancelInterview } from "@/lib/server/engine";

export const POST = route<{ id: string }>("interviews.cancel", async ({ actor, params }) => cancelInterview(params.id, actor));
