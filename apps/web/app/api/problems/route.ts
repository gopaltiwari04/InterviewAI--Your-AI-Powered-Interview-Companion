import { DIFFICULTIES, TOPICS, type Difficulty, type Topic } from "@repo/core/problems";
import { route } from "@/lib/server/api";
import { listProblems } from "@/lib/server/problems";

/** Problem catalogue: titles, difficulty and topics only, no statements or tests. */
export const GET = route("problems.list", async ({ req }) => {
  const d = req.nextUrl.searchParams.get("difficulty");
  const t = req.nextUrl.searchParams.getAll("topic");
  return listProblems({
    difficulty: (DIFFICULTIES as readonly string[]).includes(d ?? "") ? (d as Difficulty) : undefined,
    topics: t.filter((x): x is Topic => (TOPICS as readonly string[]).includes(x)),
  });
});
