import { route, readJson } from "@/lib/server/api";
import { createSubmission, listSubmissions } from "@/lib/server/engine";

export const POST = route<{ id: string }>("submissions.create", async ({ req, actor, params }) => createSubmission(params.id, actor, await readJson(req, 96 * 1024)));

export const GET = route<{ id: string }>("submissions.list", async ({ req, actor, params }) =>
  listSubmissions(params.id, actor, req.nextUrl.searchParams.get("questionId") ?? undefined),
);
