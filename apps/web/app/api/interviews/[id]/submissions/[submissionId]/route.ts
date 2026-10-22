import { route } from "@/lib/server/api";
import { getSubmission } from "@/lib/server/engine";

export const GET = route<{ id: string; submissionId: string }>("submissions.get", async ({ actor, params }) => getSubmission(params.id, params.submissionId, actor));
