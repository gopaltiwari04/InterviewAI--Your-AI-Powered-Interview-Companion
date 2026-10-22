/**
 * Chooses the next question for an interview.
 *
 * Order of preference for coding questions:
 *   1. a specific problem requested at setup (practice recommendations),
 *   2. an AI-generated problem, only if enabled AND it passes sandbox validation,
 *   3. the curated problem bank (always available).
 * The adaptive policy (rules in @repo/core/interview) picks difficulty and
 * topic; the model never controls the interview lifecycle.
 */
import {
  TECHNICAL_TOPICS,
  chooseTopic,
  decideNextDifficulty,
  keyPointCoverage,
  questionPlan,
  type InterviewMode,
  type PreviousOutcome,
  type QuestionKind,
} from "@repo/core/interview";
import { TOPICS, TOPIC_LABELS, type Difficulty, type Topic } from "@repo/core/problems";
import type { InterviewQuestion, InterviewRoom, Prisma } from "@repo/database";
import { getProblemDefinition, selectBehavioralQuestion, selectProblem, selectTechnicalQuestion, type KeyPoint } from "@repo/problem-bank";
import { getAiClient } from "../ai/client";
import { generateValidatedProblem } from "../ai/problem-generator";
import { generateResumeQuestion } from "../ai/resume";
import { db, logger } from "../infra";
import { executorStatus } from "../queues";

export interface QuestionDraft {
  kind: QuestionKind;
  source: "BANK" | "AI_GENERATED" | "RESUME" | "AI_FALLBACK_BANK";
  problemSlug: string | null;
  problemVersion: number | null;
  generatedProblemId: string | null;
  title: string;
  prompt: string;
  topic: string | null;
  difficulty: Difficulty;
  selectionReason: string;
  rubricHints: Prisma.InputJsonValue | null;
}

interface RubricHints {
  bankId?: string;
  keyPoints?: KeyPoint[];
  followUps?: string[];
  competency?: string;
  groundedIn?: string;
}

export const hintsOf = (q: Pick<InterviewQuestion, "rubricHints">): RubricHints => (q.rubricHints ?? {}) as RubricHints;

/** What the previous question tells the adaptive policy. */
export async function outcomeOf(q: InterviewQuestion): Promise<PreviousOutcome> {
  let passRatio: number | null = null;
  let coverage: number | null = null;
  if (q.kind === "CODING") {
    const best = await db.submission.findFirst({
      where: { questionId: q.id, kind: "SUBMIT", status: "COMPLETED", totalCount: { gt: 0 } },
      orderBy: [{ passedCount: "desc" }, { createdAt: "desc" }],
    });
    if (best && best.totalCount) passRatio = (best.passedCount ?? 0) / best.totalCount;
  } else {
    const keyPoints = hintsOf(q).keyPoints ?? [];
    coverage = q.answer ? keyPointCoverage(q.answer, keyPoints) : 0;
  }
  return {
    kind: q.kind as QuestionKind,
    difficulty: q.difficulty as Difficulty,
    title: q.title,
    topic: q.topic,
    skipped: q.status === "SKIPPED",
    passRatio,
    coverage,
  };
}

async function recentlySeenSlugs(userId: string): Promise<string[]> {
  const recent = await db.interviewQuestion.findMany({
    where: { room: { userId }, problemSlug: { not: null } },
    orderBy: { askedAt: "desc" },
    take: 20,
    select: { problemSlug: true },
  });
  return recent.map((r) => r.problemSlug!).filter(Boolean);
}

export interface SelectionContext {
  room: InterviewRoom;
  position: number;
  previous: InterviewQuestion[];
  /** Problem requested at setup for the first coding question (practice links). */
  requestedProblemSlug?: string | null;
  /** Generating and validating an AI problem takes a while; callers can disable it. */
  allowAi?: boolean;
}

export async function selectNextQuestion(ctx: SelectionContext): Promise<QuestionDraft> {
  const { room, position, previous } = ctx;
  const plan = questionPlan(room.mode as InterviewMode, room.durationMinutes);
  const kind = plan[Math.min(position, plan.length - 1)]!;
  const sameKind = previous.filter((q) => q.kind === kind).sort((a, b) => b.position - a.position);
  const last = sameKind[0] ?? null;

  const decision = room.adaptive
    ? decideNextDifficulty(room.difficulty as Difficulty, last ? await outcomeOf(last) : null)
    : { difficulty: room.difficulty as Difficulty, reason: `Fixed ${room.difficulty.toLowerCase()} difficulty (adaptive mode is off).`, revisitTopic: null };

  if (kind === "CODING") return selectCoding(ctx, decision, sameKind);
  if (kind === "TECHNICAL") return selectTechnical(ctx, decision, sameKind);
  return selectBehavioral(ctx, decision, sameKind);
}

type Decision = { difficulty: Difficulty; reason: string; revisitTopic: string | null };

async function selectCoding(ctx: SelectionContext, decision: Decision, sameKind: InterviewQuestion[]): Promise<QuestionDraft> {
  const { room } = ctx;
  const dsaTopics = room.topics.filter((t): t is Topic => (TOPICS as readonly string[]).includes(t));
  const usedTopics = sameKind.map((q) => q.topic ?? "");
  const topics = chooseTopic(dsaTopics, usedTopics, decision.revisitTopic, TOPICS);

  if (ctx.requestedProblemSlug && sameKind.length === 0) {
    const def = getProblemDefinition(ctx.requestedProblemSlug);
    if (def) {
      return {
        kind: "CODING",
        source: "BANK",
        problemSlug: def.slug,
        problemVersion: def.version,
        generatedProblemId: null,
        title: def.title,
        prompt: def.statement,
        topic: def.topics[0] ?? null,
        difficulty: def.difficulty,
        selectionReason: "You chose this problem from your practice recommendations.",
        rubricHints: { followUps: def.followUps },
      };
    }
  }

  let fallbackNote = "";
  if (room.useAiQuestions && ctx.allowAi !== false) {
    const ai = getAiClient();
    const executor = await executorStatus();
    if (!ai) fallbackNote = " AI-generated problems were requested, but the AI provider is not configured, so a verified bank problem was used.";
    else if (!executor.online) fallbackNote = " AI-generated problems need the code judge to validate them, which is offline, so a verified bank problem was used.";
    else {
      const generated = await generateValidatedProblem({ difficulty: decision.difficulty, topics, userId: room.userId });
      if (generated.ok) {
        return {
          kind: "CODING",
          source: "AI_GENERATED",
          problemSlug: null,
          problemVersion: null,
          generatedProblemId: generated.id,
          title: generated.title,
          prompt: generated.statement,
          topic: topics[0] ?? null,
          difficulty: decision.difficulty,
          selectionReason: `${decision.reason} This problem was generated by AI and verified by running its reference solution against its tests in the sandbox.`,
          rubricHints: { followUps: generated.followUps },
        };
      }
      logger.warn("ai problem rejected, falling back to bank", { roomId: room.id, reason: generated.reason });
      fallbackNote = " An AI-generated problem failed validation, so a verified bank problem was used instead.";
    }
  }

  const exclude = [...sameKind.map((q) => q.problemSlug ?? ""), ...(await recentlySeenSlugs(room.userId))];
  let pick = selectProblem({ difficulty: decision.difficulty, topics, exclude });
  // If the history filter exhausted the matching pool, allow repeats from earlier interviews.
  if (pick.matched !== "exact") {
    const relaxed = selectProblem({ difficulty: decision.difficulty, topics, exclude: sameKind.map((q) => q.problemSlug ?? "") });
    if (relaxed.matched === "exact") pick = relaxed;
  }
  const def = getProblemDefinition(pick.slug)!;
  const topicNote =
    topics.length > 0 && pick.matched === "exact" ? ` Topic: ${TOPIC_LABELS[def.topics.find((t) => topics.includes(t)) ?? def.topics[0]!]}.` : "";
  return {
    kind: "CODING",
    source: fallbackNote ? "AI_FALLBACK_BANK" : "BANK",
    problemSlug: def.slug,
    problemVersion: def.version,
    generatedProblemId: null,
    title: def.title,
    prompt: def.statement,
    topic: def.topics.find((t) => topics.includes(t)) ?? def.topics[0] ?? null,
    difficulty: def.difficulty,
    selectionReason: `${decision.reason}${topicNote}${fallbackNote}`.trim(),
    rubricHints: { followUps: def.followUps },
  };
}

async function selectTechnical(ctx: SelectionContext, decision: Decision, sameKind: InterviewQuestion[]): Promise<QuestionDraft> {
  const { room } = ctx;
  const requested = room.topics.filter((t) => (TECHNICAL_TOPICS as readonly string[]).includes(t));
  const topics = chooseTopic(requested, sameKind.map((q) => q.topic ?? ""), decision.revisitTopic, TECHNICAL_TOPICS);

  // One resume-grounded question per interview when a confirmed resume is attached.
  if (room.resumeProfileId && !sameKind.some((q) => q.source === "RESUME") && ctx.allowAi !== false) {
    const generated = await generateResumeQuestion({ resumeProfileId: room.resumeProfileId, userId: room.userId, kind: "TECHNICAL", difficulty: decision.difficulty });
    if (generated) {
      return {
        kind: "TECHNICAL",
        source: "RESUME",
        problemSlug: null,
        problemVersion: null,
        generatedProblemId: null,
        title: "About your experience",
        prompt: generated.question,
        topic: generated.topic,
        difficulty: decision.difficulty,
        selectionReason: `Based on "${generated.groundedIn}" from your resume. Resume claims are not verified; this question simply lets you explain your work.`,
        rubricHints: { keyPoints: generated.keyPoints, followUps: generated.followUps, groundedIn: generated.groundedIn } as unknown as Prisma.InputJsonValue,
      };
    }
  }

  const q = selectTechnicalQuestion({ difficulty: decision.difficulty, topics, exclude: sameKind.map((x) => hintsOf(x).bankId ?? "") });
  return {
    kind: "TECHNICAL",
    source: "BANK",
    problemSlug: null,
    problemVersion: null,
    generatedProblemId: null,
    title: "Technical question",
    prompt: q.question,
    topic: q.topic,
    difficulty: q.difficulty,
    selectionReason: decision.reason,
    rubricHints: { bankId: q.id, keyPoints: q.keyPoints, followUps: q.followUps } as unknown as Prisma.InputJsonValue,
  };
}

async function selectBehavioral(ctx: SelectionContext, decision: Decision, sameKind: InterviewQuestion[]): Promise<QuestionDraft> {
  const { room } = ctx;
  if (room.resumeProfileId && !sameKind.some((q) => q.source === "RESUME") && sameKind.length > 0 && ctx.allowAi !== false) {
    const generated = await generateResumeQuestion({ resumeProfileId: room.resumeProfileId, userId: room.userId, kind: "BEHAVIORAL", difficulty: decision.difficulty });
    if (generated) {
      return {
        kind: "BEHAVIORAL",
        source: "RESUME",
        problemSlug: null,
        problemVersion: null,
        generatedProblemId: null,
        title: "About your experience",
        prompt: generated.question,
        topic: "experience",
        difficulty: decision.difficulty,
        selectionReason: `Based on "${generated.groundedIn}" from your resume. Resume claims are not verified.`,
        rubricHints: { keyPoints: generated.keyPoints, followUps: generated.followUps, groundedIn: generated.groundedIn } as unknown as Prisma.InputJsonValue,
      };
    }
  }
  const q = selectBehavioralQuestion({ difficulty: decision.difficulty, exclude: sameKind.map((x) => hintsOf(x).bankId ?? "") });
  return {
    kind: "BEHAVIORAL",
    source: "BANK",
    problemSlug: null,
    problemVersion: null,
    generatedProblemId: null,
    title: "Behavioral question",
    prompt: q.question,
    topic: q.competency,
    difficulty: q.difficulty,
    selectionReason: `${decision.reason} Competency: ${q.competency}. Structure your answer with the STAR method.`,
    rubricHints: { bankId: q.id, keyPoints: q.keyPoints, followUps: q.followUps, competency: q.competency } as unknown as Prisma.InputJsonValue,
  };
}

/** The interviewer's opening line for a question. Deterministic, so it works without AI. */
export function openingMessage(draft: Pick<QuestionDraft, "kind" | "title">, position: number, total: number): string {
  const n = `Question ${position + 1} of ${total}`;
  if (draft.kind === "CODING") {
    return `${n}: "${draft.title}". Read the statement and examples, then ask me any clarifying questions here. When you're ready, implement your solution, use Run to check the sample tests and Submit to evaluate against the hidden tests. Afterwards, explain your approach and its complexity.`;
  }
  if (draft.kind === "TECHNICAL") return `${n}. Take your time and answer in your own words; explain the why and any trade-offs, not just definitions.`;
  return `${n}. Please answer using a specific example from your experience: describe the situation, what you did, the result and what you learned.`;
}
