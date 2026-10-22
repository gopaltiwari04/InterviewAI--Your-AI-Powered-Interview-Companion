import { route, readJson } from "@/lib/server/api";
import { createInterview, interviewHistory } from "@/lib/server/engine";

export const POST = route("interviews.create", async ({ req, actor }) => createInterview(actor, await readJson(req)));

export const GET = route("interviews.list", async ({ req, actor }) => {
  const page = Number(req.nextUrl.searchParams.get("page") ?? "1") || 1;
  return interviewHistory(actor, page, 10);
});
