/**
 * Rubrics, model-output schemas and deterministic scoring for interview
 * evaluations.
 *
 * Principles:
 *  - The language model only scores dimensions that need judgement. Coding
 *    correctness is computed from the judge's verdicts, never from the model.
 *  - Final and per-question scores are computed here, in code, from
 *    validated dimension scores, so the model cannot inflate a total.
 *  - Evidence quotes must appear in the candidate's own words; quotes that do
 *    not are removed before anything is stored.
 */
import { z } from "zod";
import type { QuestionKind } from "../interview/index";

export const RUBRIC_VERSION = "rubric-2026.10-v1";

export interface RubricDimension {
  key: string;
  label: string;
  weight: number;
  /** "judge" dimensions are filled from execution results, not by the model. */
  source: "judge" | "ai";
  /** Counts toward the technical (true) or communication (false) sub-score. */
  technical: boolean;
  guidance: string;
}

export const RUBRICS: Record<QuestionKind, RubricDimension[]> = {
  CODING: [
    { key: "correctness", label: "Correctness", weight: 3, source: "judge", technical: true, guidance: "Share of hidden tests passed by the best submission." },
    { key: "problem_solving", label: "Problem-solving approach", weight: 2, source: "ai", technical: true, guidance: "Did the candidate break the problem down, consider alternatives and reason towards a solution?" },
    { key: "algorithm_choice", label: "Algorithm & data structures", weight: 2, source: "ai", technical: true, guidance: "Is the chosen algorithm and data structure appropriate for the constraints?" },
    { key: "complexity_analysis", label: "Time & space complexity", weight: 2, source: "ai", technical: true, guidance: "Did the candidate state the complexity correctly for the code they wrote?" },
    { key: "edge_cases", label: "Edge-case handling", weight: 1, source: "ai", technical: true, guidance: "Does the code and explanation handle empty input, duplicates, limits and other edge cases?" },
    { key: "code_quality", label: "Code quality", weight: 1, source: "ai", technical: true, guidance: "Readability, naming, structure and idiomatic use of the language." },
    { key: "communication", label: "Communication", weight: 1, source: "ai", technical: false, guidance: "Clarity of the written explanation and answers to follow-up questions." },
  ],
  TECHNICAL: [
    { key: "accuracy", label: "Technical accuracy", weight: 3, source: "ai", technical: true, guidance: "Are the statements correct? Penalise factual errors." },
    { key: "depth", label: "Depth of understanding", weight: 2, source: "ai", technical: true, guidance: "Does the answer explain why, trade-offs and internals rather than only definitions?" },
    { key: "practical_application", label: "Practical application", weight: 1, source: "ai", technical: true, guidance: "Concrete examples, real-world usage or pitfalls." },
    { key: "communication", label: "Clarity", weight: 1, source: "ai", technical: false, guidance: "Is the answer well structured and easy to follow?" },
  ],
  BEHAVIORAL: [
    { key: "situation", label: "Situation & task", weight: 1, source: "ai", technical: false, guidance: "Is the context and the candidate's responsibility clear?" },
    { key: "actions", label: "Actions & ownership", weight: 2, source: "ai", technical: false, guidance: "Does the answer describe what the candidate personally did and why?" },
    { key: "results", label: "Results & impact", weight: 2, source: "ai", technical: false, guidance: "Are outcomes described, ideally with measurable impact?" },
    { key: "reflection", label: "Reflection & learning", weight: 1, source: "ai", technical: false, guidance: "Does the candidate reflect on what they learned or would change?" },
    { key: "communication", label: "Communication", weight: 1, source: "ai", technical: false, guidance: "Concise, structured storytelling." },
  ],
};

export const SCORE_MAX = 10;

/** What the model must return for one question. Validated with zod; anything else is rejected. */
export const aiQuestionEvaluationSchema = z.object({
  questionId: z.string(),
  dimensions: z
    .array(
      z.object({
        key: z.string(),
        score: z.number().min(0).max(SCORE_MAX),
        rationale: z.string().min(1).max(1200),
        evidence: z.array(z.string().max(400)).max(4).default([]),
      }),
    )
    .min(1)
    .max(10),
  summary: z.string().min(1).max(1500),
  strengths: z.array(z.string().max(300)).max(5).default([]),
  improvements: z.array(z.string().max(300)).max(5).default([]),
});
export type AiQuestionEvaluation = z.infer<typeof aiQuestionEvaluationSchema>;

export const aiOverallSchema = z.object({
  summary: z.string().min(1).max(2500),
  strengths: z.array(z.string().max(300)).max(6).default([]),
  improvements: z.array(z.string().max(300)).max(6).default([]),
});
export type AiOverall = z.infer<typeof aiOverallSchema>;

export interface DimensionResult {
  key: string;
  label: string;
  weight: number;
  source: "judge" | "ai";
  technical: boolean;
  /** 0..10, or null when it could not be assessed (e.g. AI unavailable). */
  score: number | null;
  rationale: string;
  evidence: string[];
  removedEvidence: number;
}

export interface QuestionResult {
  questionId: string;
  kind: QuestionKind;
  title: string;
  /** 0..100 weighted score over the dimensions that could be assessed. */
  score: number | null;
  dimensions: DimensionResult[];
  summary: string;
  strengths: string[];
  improvements: string[];
  judge?: { passed: number; total: number; verdict: string | null; language: string | null } | null;
}

export interface JudgeEvidence {
  passed: number;
  total: number;
  verdict: string | null;
  language: string | null;
}

/** Correctness on a 0..10 scale, straight from the judge. */
export function correctnessFromJudge(judge: JudgeEvidence | null): { score: number; rationale: string } {
  if (!judge || judge.total === 0) return { score: 0, rationale: "No solution was submitted for hidden-test evaluation." };
  if (judge.verdict === "COMPILATION_ERROR") return { score: 0, rationale: "The last submitted solution did not compile." };
  const score = Math.round((judge.passed / judge.total) * SCORE_MAX * 10) / 10;
  return {
    score,
    rationale: `The best submission passed ${judge.passed} of ${judge.total} tests (verdict: ${judge.verdict ?? "unknown"}), as reported by the code judge.`,
  };
}

const normalize = (s: string) => s.toLowerCase().replace(/[`*_"'“”‘’]/g, "").replace(/\s+/g, " ").trim();

/** Keeps only quotes that really occur (ignoring case/whitespace/quote marks) in the candidate's material. */
export function verifyEvidence(quotes: string[], corpus: string): { kept: string[]; removed: number } {
  const haystack = normalize(corpus);
  const kept: string[] = [];
  let removed = 0;
  for (const q of quotes) {
    const needle = normalize(q.replace(/^\.{3}|\.{3}$/g, "").replace(/…/g, ""));
    if (needle.length >= 4 && haystack.includes(needle)) kept.push(q.trim());
    else removed++;
  }
  return { kept, removed };
}

/** Weighted mean of the assessed dimensions on 0..100, or null if none were assessed. */
export function weightedScore(dimensions: Pick<DimensionResult, "score" | "weight">[]): number | null {
  const assessed = dimensions.filter((d) => d.score !== null);
  const totalWeight = assessed.reduce((n, d) => n + d.weight, 0);
  if (totalWeight === 0) return null;
  const value = assessed.reduce((n, d) => n + (d.score as number) * d.weight, 0) / totalWeight;
  return Math.round((value / SCORE_MAX) * 100);
}

/**
 * Merges a validated model response with the rubric and judge results.
 * Unknown dimension keys from the model are ignored; missing ones are null.
 */
export function buildQuestionResult(args: {
  questionId: string;
  kind: QuestionKind;
  title: string;
  ai: AiQuestionEvaluation | null;
  judge: JudgeEvidence | null;
  corpus: string;
  aiUnavailableReason?: string;
}): QuestionResult {
  const rubric = RUBRICS[args.kind];
  const dims: DimensionResult[] = rubric.map((d) => {
    if (d.source === "judge") {
      const c = correctnessFromJudge(args.judge);
      return { ...d, score: c.score, rationale: c.rationale, evidence: [], removedEvidence: 0 };
    }
    const fromAi = args.ai?.dimensions.find((x) => x.key === d.key);
    if (!fromAi) {
      return { ...d, score: null, rationale: args.aiUnavailableReason ?? "This dimension could not be assessed.", evidence: [], removedEvidence: 0 };
    }
    const { kept, removed } = verifyEvidence(fromAi.evidence, args.corpus);
    return { ...d, score: Math.round(fromAi.score * 10) / 10, rationale: fromAi.rationale, evidence: kept, removedEvidence: removed };
  });
  return {
    questionId: args.questionId,
    kind: args.kind,
    title: args.title,
    score: weightedScore(dims),
    dimensions: dims,
    summary: args.ai?.summary ?? args.aiUnavailableReason ?? "",
    strengths: args.ai?.strengths ?? [],
    improvements: args.ai?.improvements ?? [],
    judge: args.judge,
  };
}

export interface ReportScores {
  overallScore: number | null;
  techScore: number | null;
  commScore: number | null;
}

/** Interview-level scores: mean of question scores, and technical/communication sub-scores. */
export function aggregateScores(questions: QuestionResult[]): ReportScores {
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const overall = mean(questions.map((q) => q.score).filter((s): s is number => s !== null));
  const sub = (technical: boolean) =>
    mean(
      questions
        .map((q) => weightedScore(q.dimensions.filter((d) => d.technical === technical)))
        .filter((s): s is number => s !== null),
    );
  return { overallScore: overall, techScore: sub(true), commScore: sub(false) };
}

export const AUTOMATED_FEEDBACK_NOTICE =
  "This report is automated feedback generated from your answers, code and test results. It is meant to help you practise and is not a definitive judgement of your ability.";

/** BullMQ queue consumed by apps/worker. Job data: { roomId }. */
export const EVALUATION_QUEUE = "interview-evaluation";
/** Redis key the evaluation worker refreshes while alive. */
export const EVALUATION_WORKER_HEARTBEAT_KEY = "evaluation-worker:heartbeat";
export interface EvaluationJobData {
  roomId: string;
  requestedAt: string;
}
