import { z } from "zod";
import { DIFFICULTIES, LANGUAGES, TOPICS, type Difficulty } from "../problems/types";

export const INTERVIEW_MODES = ["DSA", "TECHNICAL", "BEHAVIORAL", "MIXED"] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];

export const INTERVIEW_STATUSES = ["CREATED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const QUESTION_KINDS = ["CODING", "TECHNICAL", "BEHAVIORAL"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const DURATIONS = [30, 45, 60, 90] as const;

export const TECHNICAL_TOPICS = [
  "data-structures",
  "algorithms",
  "operating-systems",
  "networking",
  "databases",
  "system-design",
  "oop-design",
  "web",
  "concurrency",
  "security",
] as const;
export type TechnicalTopic = (typeof TECHNICAL_TOPICS)[number];

export const TECHNICAL_TOPIC_LABELS: Record<TechnicalTopic, string> = {
  "data-structures": "Data structures",
  algorithms: "Algorithms & complexity",
  "operating-systems": "Operating systems",
  networking: "Networking",
  databases: "Databases",
  "system-design": "System design",
  "oop-design": "OOP & design",
  web: "Web fundamentals",
  concurrency: "Concurrency",
  security: "Security",
};

export const MODE_INFO: Record<InterviewMode, { label: string; description: string }> = {
  DSA: {
    label: "DSA / Coding",
    description: "Solve real data-structures and algorithms problems in the editor, run them against tests and explain your solution.",
  },
  TECHNICAL: {
    label: "Technical knowledge",
    description: "Conceptual questions on CS fundamentals and engineering topics, answered in writing.",
  },
  BEHAVIORAL: {
    label: "Behavioral",
    description: "Experience-based questions evaluated with the STAR method (situation, task, action, result).",
  },
  MIXED: {
    label: "Mixed technical",
    description: "A coding problem plus technical and behavioral questions, like a full interview loop.",
  },
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<InterviewStatus, InterviewStatus[]> = {
  CREATED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: InterviewStatus,
    readonly to: InterviewStatus,
  ) {
    super(`An interview cannot move from ${from} to ${to}.`);
  }
}

export function canTransition(from: InterviewStatus, to: InterviewStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: InterviewStatus, to: InterviewStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export const isTerminal = (status: InterviewStatus): boolean => TRANSITIONS[status].length === 0;

/** Small grace period so a submission sent just before the deadline still counts. */
export const DEADLINE_GRACE_MS = 30_000;

export function computeDeadline(startedAt: Date, durationMinutes: number): Date {
  return new Date(startedAt.getTime() + durationMinutes * 60_000);
}

export function isPastDeadline(endsAt: Date | null, now: Date = new Date()): boolean {
  return endsAt !== null && now.getTime() > endsAt.getTime() + DEADLINE_GRACE_MS;
}

/** Which kinds of question an interview asks, in order. */
export function questionPlan(mode: InterviewMode, durationMinutes: number): QuestionKind[] {
  const long = durationMinutes >= 60;
  const veryLong = durationMinutes >= 90;
  switch (mode) {
    case "DSA":
      return veryLong ? ["CODING", "CODING", "CODING"] : durationMinutes >= 45 ? ["CODING", "CODING"] : ["CODING"];
    case "TECHNICAL":
      return Array.from({ length: veryLong ? 6 : long ? 5 : durationMinutes >= 45 ? 4 : 3 }, () => "TECHNICAL" as const);
    case "BEHAVIORAL":
      return Array.from({ length: veryLong ? 6 : long ? 5 : durationMinutes >= 45 ? 4 : 3 }, () => "BEHAVIORAL" as const);
    case "MIXED":
      if (veryLong) return ["CODING", "TECHNICAL", "CODING", "TECHNICAL", "BEHAVIORAL"];
      if (long) return ["CODING", "TECHNICAL", "TECHNICAL", "BEHAVIORAL"];
      if (durationMinutes >= 45) return ["CODING", "TECHNICAL", "BEHAVIORAL"];
      return ["CODING", "TECHNICAL"];
  }
}

// ---------------------------------------------------------------------------
// Setup validation (shared by the setup form and the API)
// ---------------------------------------------------------------------------

export const interviewSetupSchema = z.object({
  mode: z.enum(INTERVIEW_MODES),
  language: z.enum(LANGUAGES),
  difficulty: z.enum(DIFFICULTIES),
  durationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)]),
  topics: z.array(z.enum(TOPICS)).max(TOPICS.length).default([]),
  technicalTopics: z.array(z.enum(TECHNICAL_TOPICS)).max(TECHNICAL_TOPICS.length).default([]),
  adaptive: z.boolean().default(true),
  useAiQuestions: z.boolean().default(false),
  proctoring: z.boolean().default(false),
  resumeProfileId: z.string().max(64).nullable().default(null),
});
export type InterviewSetup = z.infer<typeof interviewSetupSchema>;

// ---------------------------------------------------------------------------
// Adaptive difficulty: a transparent rules-based policy
// ---------------------------------------------------------------------------

export interface AdaptivePolicyConfig {
  /** Coding: fraction of hidden tests that must pass to move up a level. */
  stepUpPassRatio: number;
  /** Coding: below this fraction the next question is easier. */
  stepDownPassRatio: number;
  /** Written answers: rubric key-point coverage needed to move up. */
  stepUpCoverage: number;
  /** Written answers: below this coverage the next question is easier. */
  stepDownCoverage: number;
}

export const DEFAULT_ADAPTIVE_POLICY: AdaptivePolicyConfig = {
  stepUpPassRatio: 1,
  stepDownPassRatio: 0.5,
  stepUpCoverage: 0.6,
  stepDownCoverage: 0.25,
};

export interface PreviousOutcome {
  kind: QuestionKind;
  difficulty: Difficulty;
  title: string;
  topic: string | null;
  skipped: boolean;
  /** Coding: best hidden-test pass ratio from the judge (null if never submitted). */
  passRatio: number | null;
  /** Written answers: fraction of rubric key points the answer mentions (0..1). */
  coverage: number | null;
}

export interface DifficultyDecision {
  difficulty: Difficulty;
  reason: string;
  /** Topic to revisit (after a weak answer) or null to rotate topics. */
  revisitTopic: string | null;
}

const step = (d: Difficulty, delta: number): Difficulty => DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, DIFFICULTIES.indexOf(d) + delta))]!;

export function decideNextDifficulty(
  base: Difficulty,
  previous: PreviousOutcome | null,
  config: AdaptivePolicyConfig = DEFAULT_ADAPTIVE_POLICY,
): DifficultyDecision {
  if (!previous) return { difficulty: base, reason: `Starting at the ${base.toLowerCase()} level you selected.`, revisitTopic: null };
  const current = previous.difficulty;
  const label = `"${previous.title}"`;

  if (previous.skipped) {
    const next = step(current, -1);
    return {
      difficulty: next,
      reason: next === current ? `You skipped ${label}, so the level stays ${next.toLowerCase()}.` : `You skipped ${label}, so the next question is ${next.toLowerCase()}.`,
      revisitTopic: previous.topic,
    };
  }

  if (previous.kind === "CODING") {
    if (previous.passRatio === null) {
      return { difficulty: current, reason: `No solution to ${label} was submitted for hidden tests, so the level stays ${current.toLowerCase()}.`, revisitTopic: null };
    }
    const pct = Math.round(previous.passRatio * 100);
    if (previous.passRatio >= config.stepUpPassRatio) {
      const next = step(current, 1);
      return {
        difficulty: next,
        reason: next === current ? `You passed every hidden test on ${label}; staying at the highest level.` : `You passed every hidden test on ${label}, so the next problem is ${next.toLowerCase()}.`,
        revisitTopic: null,
      };
    }
    if (previous.passRatio < config.stepDownPassRatio) {
      const next = step(current, -1);
      return {
        difficulty: next,
        reason:
          next === current
            ? `${label} passed ${pct}% of hidden tests; staying at the ${next.toLowerCase()} level.`
            : `${label} passed ${pct}% of hidden tests, so the next problem is ${next.toLowerCase()} to consolidate the fundamentals.`,
        revisitTopic: previous.topic,
      };
    }
    return { difficulty: current, reason: `${label} passed ${pct}% of hidden tests, so the level stays ${current.toLowerCase()}.`, revisitTopic: null };
  }

  if (previous.coverage === null) return { difficulty: current, reason: `Keeping the ${current.toLowerCase()} level.`, revisitTopic: null };
  const pct = Math.round(previous.coverage * 100);
  if (previous.coverage >= config.stepUpCoverage) {
    const next = step(current, 1);
    return { difficulty: next, reason: `Your answer to ${label} covered about ${pct}% of the expected key points, so the next question goes deeper.`, revisitTopic: null };
  }
  if (previous.coverage < config.stepDownCoverage) {
    const next = step(current, -1);
    return { difficulty: next, reason: `Your answer to ${label} covered about ${pct}% of the expected key points, so the next question is more foundational.`, revisitTopic: previous.topic };
  }
  return { difficulty: current, reason: `Your answer to ${label} covered about ${pct}% of the expected key points; keeping the same level.`, revisitTopic: null };
}

/**
 * Deterministic key-point coverage used by the adaptive policy: the share of
 * rubric key points whose keywords appear in the answer. It is a coarse
 * signal for choosing the next question, not a grade.
 */
export function keyPointCoverage(answer: string, keyPoints: { keywords: string[] }[]): number {
  if (keyPoints.length === 0) return 0;
  const text = ` ${answer.toLowerCase().replace(/[^a-z0-9+#]+/g, " ")} `;
  const hit = keyPoints.filter((kp) => kp.keywords.some((k) => text.includes(` ${k.toLowerCase()}`))).length;
  return hit / keyPoints.length;
}

/** Picks the next topic: revisit a weak one, otherwise rotate through the requested topics. */
export function chooseTopic<T extends string>(requested: T[], usedTopics: string[], revisit: string | null, universe: readonly T[]): T[] {
  if (revisit && (universe as readonly string[]).includes(revisit)) return [revisit as T];
  if (requested.length === 0) return [];
  const unused = requested.filter((t) => !usedTopics.includes(t));
  return unused.length > 0 ? unused : requested;
}

// ---------------------------------------------------------------------------
// Explanation submitted after a coding question
// ---------------------------------------------------------------------------

export const codingExplanationSchema = z.object({
  approach: z.string().trim().max(4000).default(""),
  timeComplexity: z.string().trim().max(200).default(""),
  spaceComplexity: z.string().trim().max(200).default(""),
  edgeCases: z.string().trim().max(2000).default(""),
});
export type CodingExplanation = z.infer<typeof codingExplanationSchema>;

export const MAX_ANSWER_CHARS = 8000;
export const MAX_CHAT_MESSAGE_CHARS = 4000;

export * from "./dto";
