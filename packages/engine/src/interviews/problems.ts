/**
 * Resolves the coding problem behind a question: a curated bank problem or a
 * validated AI-generated one. Public views and judge tests are kept apart.
 */
import type { Comparator, JudgeTestCase, PublicProblem, Signature } from "@repo/core/problems";
import type { GeneratedProblem, InterviewQuestion } from "@repo/database";
import { getJudgeTests, getProblemDefinition, getPublicProblem } from "@repo/problem-bank";
import { db } from "../infra";

export interface ResolvedProblem {
  publicView: PublicProblem;
  signature: Signature;
  comparator: Comparator;
  timeLimitMs: number;
  followUps: string[];
  complexity: { time: string; space: string } | null;
  tests(kind: "RUN" | "SUBMIT"): JudgeTestCase[];
}

interface GeneratedDefinition {
  publicView: PublicProblem;
  comparator: Comparator;
  followUps: string[];
}

export function parseGenerated(problem: GeneratedProblem): ResolvedProblem {
  const def = problem.definition as unknown as GeneratedDefinition;
  const tests = problem.tests as unknown as JudgeTestCase[];
  return {
    publicView: def.publicView,
    signature: def.publicView.signature,
    comparator: def.comparator,
    timeLimitMs: def.publicView.timeLimitMs,
    followUps: def.followUps ?? [],
    complexity: null,
    tests: (kind) => tests.filter((t) => kind === "SUBMIT" || t.visible).map((t) => ({ ...t })),
  };
}

export function resolveBankProblem(slug: string): ResolvedProblem | null {
  const def = getProblemDefinition(slug);
  const publicView = getPublicProblem(slug);
  if (!def || !publicView) return null;
  return {
    publicView,
    signature: def.signature,
    comparator: def.comparator,
    timeLimitMs: def.timeLimitMs ?? 2000,
    followUps: def.followUps,
    complexity: def.complexity,
    tests: (kind) => getJudgeTests(slug, kind),
  };
}

export async function resolveProblem(question: Pick<InterviewQuestion, "problemSlug" | "generatedProblemId">): Promise<ResolvedProblem | null> {
  if (question.problemSlug) return resolveBankProblem(question.problemSlug);
  if (question.generatedProblemId) {
    const generated = await db.generatedProblem.findUnique({ where: { id: question.generatedProblemId } });
    return generated && generated.status === "VALIDATED" ? parseGenerated(generated) : null;
  }
  return null;
}
