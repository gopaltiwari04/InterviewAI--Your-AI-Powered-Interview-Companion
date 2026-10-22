import { route, readJson } from "@/lib/server/api";
import { deleteResume, reviewResume } from "@/lib/server/engine";

export const PATCH = route<{ resumeId: string }>("resumes.review", async ({ req, actor, params }) => reviewResume(actor, params.resumeId, await readJson(req)));

export const DELETE = route<{ resumeId: string }>("resumes.delete", async ({ actor, params }) => {
  await deleteResume(actor, params.resumeId);
  return { deleted: true };
});
