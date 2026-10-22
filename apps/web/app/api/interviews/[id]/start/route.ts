import { route, readJson } from "@/lib/server/api";
import { startInterview } from "@/lib/server/engine";

// Selecting the first question may generate and validate an AI problem.
export const maxDuration = 60;

export const POST = route<{ id: string }>("interviews.start", async ({ req, actor, params }) => startInterview(params.id, actor, await readJson(req)));
