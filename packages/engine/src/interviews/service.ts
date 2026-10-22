import { createHash, randomBytes } from "node:crypto";
import {
  MAX_ANSWER_CHARS,
  codingExplanationSchema,
  computeDeadline,
  interviewSetupSchema,
  isPastDeadline,
  questionPlan,
  type ClientChatMessage,
  type ClientInterview,
  type InterviewMode,
  type InterviewStatus,
} from "@repo/core/interview";
import { MAX_SOURCE_BYTES } from "@repo/core/judge";
import { LANGUAGES, type Language } from "@repo/core/problems";
import { Prisma, type InterviewQuestion, type InterviewRoom } from "@repo/database";
import { getProblemDefinition } from "@repo/problem-bank";
import { z } from "zod";
import { AppError, badRequest, conflict, forbidden, notFound, tooLarge } from "../errors";
import { db, logger } from "../infra";
import { RATE_LIMITS, enforceRateLimit } from "../rate-limit";
import { broadcast } from "../realtime";
import { scheduleEvaluation, type EvaluationSchedule } from "../evaluation/service";
import { loadRoomForActor, loadRoomForCandidate, type Actor, type RoomAccess } from "./access";
import { openingMessage, selectNextQuestion, type QuestionDraft } from "./questions";
import { toClientInterview } from "./views";

const createInputSchema = interviewSetupSchema.extend({
  problemSlug: z.string().max(80).nullable().optional(),
});
export type CreateInterviewInput = z.input<typeof createInputSchema>;

export async function createInterview(actor: Actor, input: unknown): Promise<{ id: string }> {
  const parsed = createInputSchema.safeParse(input);
  if (!parsed.success) throw badRequest("Invalid interview settings.", { issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
  const setup = parsed.data;
  await enforceRateLimit(RATE_LIMITS.createInterview, actor.userId);

  if (setup.problemSlug && !getProblemDefinition(setup.problemSlug)) throw badRequest("Unknown practice problem.");
  if (setup.problemSlug && setup.mode !== "DSA" && setup.mode !== "MIXED") throw badRequest("A practice problem needs a DSA or mixed interview.");
  if (setup.resumeProfileId) {
    const profile = await db.resumeProfile.findFirst({ where: { id: setup.resumeProfileId, userId: actor.userId } });
    if (!profile) throw notFound("Resume");
    if (profile.status !== "READY" || !profile.confirmedAt) throw badRequest("Review and confirm your resume profile before using it in an interview.");
  }

  const plan = questionPlan(setup.mode, setup.durationMinutes);
  const room = await db.$transaction(async (tx) => {
    const created = await tx.interviewRoom.create({
      data: {
        userId: actor.userId,
        status: "CREATED",
        mode: setup.mode,
        difficulty: setup.difficulty,
        language: setup.language,
        topics: [...setup.topics, ...setup.technicalTopics],
        durationMinutes: setup.durationMinutes,
        questionCount: plan.length,
        adaptive: setup.adaptive,
        useAiQuestions: setup.useAiQuestions,
        proctoringEnabled: setup.proctoring,
        resumeProfileId: setup.resumeProfileId,
        participants: { create: { userId: actor.userId, role: "CANDIDATE" } },
      },
    });
    await tx.interviewEvent.create({
      data: { roomId: created.id, userId: actor.userId, eventType: "STATE_CHANGED", payload: { to: "CREATED", problemSlug: setup.problemSlug ?? null } },
    });
    return created;
  });
  logger.info("interview created", { roomId: room.id, mode: setup.mode, difficulty: setup.difficulty });
  return { id: room.id };
}

async function loadQuestions(roomId: string): Promise<InterviewQuestion[]> {
  return db.interviewQuestion.findMany({ where: { roomId }, orderBy: { position: "asc" } });
}

async function candidateName(room: InterviewRoom): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: room.userId }, select: { name: true } });
  return user?.name ?? null;
}

async function view(access: RoomAccess): Promise<ClientInterview> {
  const room = await db.interviewRoom.findUniqueOrThrow({ where: { id: access.room.id } });
  return toClientInterview(access, room, await loadQuestions(room.id), await candidateName(room));
}

/** Returns the interview, completing it first if its time ran out. */
export async function getInterview(roomId: string, actor: Actor): Promise<ClientInterview> {
  const access = await loadRoomForActor(roomId, actor);
  if (access.room.status === "IN_PROGRESS" && isPastDeadline(access.room.endsAt)) {
    await completeRoom(access.room, "TIME_EXPIRED", null);
  }
  return view(access);
}

function questionData(roomId: string, position: number, draft: QuestionDraft): Prisma.InterviewQuestionUncheckedCreateInput {
  return {
    roomId,
    position,
    kind: draft.kind,
    source: draft.source,
    status: "ACTIVE",
    problemSlug: draft.problemSlug,
    problemVersion: draft.problemVersion,
    generatedProblemId: draft.generatedProblemId,
    title: draft.title,
    prompt: draft.prompt,
    topic: draft.topic,
    difficulty: draft.difficulty,
    selectionReason: draft.selectionReason,
    rubricHints: draft.rubricHints ?? Prisma.JsonNull,
  };
}

async function recordQuestionAsked(tx: Prisma.TransactionClient, roomId: string, questionId: string, draft: QuestionDraft, position: number, total: number) {
  await tx.interviewEvent.create({
    data: { roomId, questionId, eventType: "QUESTION_ASKED", payload: { position, kind: draft.kind, source: draft.source, title: draft.title } },
  });
  await tx.interviewEvent.create({
    data: { roomId, questionId, eventType: "AI_CHAT_MESSAGE", payload: { role: "assistant", kind: "system", content: openingMessage(draft, position, total) } },
  });
}

export async function startInterview(roomId: string, actor: Actor, input: unknown): Promise<ClientInterview> {
  const parsed = z.object({ proctoring: z.boolean() }).safeParse(input);
  if (!parsed.success) throw badRequest("Say whether proctoring is enabled.");
  const access = await loadRoomForCandidate(roomId, actor);
  const room = access.room;
  if (room.status === "IN_PROGRESS" || room.status === "COMPLETED") return view(access);
  if (room.status !== "CREATED") throw conflict("This interview can no longer be started.");

  // The candidate can always choose an unproctored interview in the lobby; they can never turn
  // proctoring on without having asked for it at setup.
  const proctoringEnabled = room.proctoringEnabled && parsed.data.proctoring;
  const startEvent = await db.interviewEvent.findFirst({ where: { roomId, eventType: "STATE_CHANGED" }, orderBy: { timestamp: "asc" } });
  const requestedProblemSlug = (startEvent?.payload as { problemSlug?: string | null } | null)?.problemSlug ?? null;

  // Selecting the first question may call the AI provider, so it happens before the transaction.
  const draft = await selectNextQuestion({ room, position: 0, previous: [], requestedProblemSlug });
  const now = new Date();
  const started = await db.$transaction(async (tx) => {
    const updated = await tx.interviewRoom.updateMany({
      where: { id: roomId, status: "CREATED", version: room.version },
      data: {
        status: "IN_PROGRESS",
        startedAt: now,
        endsAt: computeDeadline(now, room.durationMinutes),
        proctoringEnabled,
        proctoringConsentAt: proctoringEnabled ? now : null,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) return false;
    const question = await tx.interviewQuestion.create({ data: questionData(roomId, 0, draft) });
    await tx.interviewEvent.create({ data: { roomId, userId: actor.userId, eventType: "STATE_CHANGED", payload: { from: "CREATED", to: "IN_PROGRESS", proctoringEnabled } } });
    await recordQuestionAsked(tx, roomId, question.id, draft, 0, room.questionCount);
    return true;
  });
  // A concurrent start (e.g. a second tab) won the race; just return the current state.
  const state = await view(access);
  if (started) {
    logger.info("interview started", { roomId, proctoringEnabled, firstQuestion: draft.problemSlug ?? draft.kind });
    await broadcast(roomId, { type: "state", version: state.version, status: state.status, currentQuestionId: state.currentQuestionId, endsAt: state.endsAt });
  }
  return state;
}

function assertActive(room: InterviewRoom) {
  if (room.status !== "IN_PROGRESS") throw conflict("This interview is not in progress.");
  if (isPastDeadline(room.endsAt)) throw conflict("Time is up for this interview.");
}

async function activeQuestion(roomId: string, questionId: string): Promise<InterviewQuestion> {
  const question = await db.interviewQuestion.findFirst({ where: { id: questionId, roomId } });
  if (!question) throw notFound("Question");
  if (question.status !== "ACTIVE") throw conflict("This question is no longer active.");
  return question;
}

export async function saveDraft(roomId: string, questionId: string, actor: Actor, input: unknown): Promise<{ savedAt: string }> {
  const parsed = z.object({ code: z.string(), language: z.enum(LANGUAGES) }).safeParse(input);
  if (!parsed.success) throw badRequest("Invalid draft.");
  if (Buffer.byteLength(parsed.data.code) > MAX_SOURCE_BYTES) throw tooLarge(`Code must be smaller than ${MAX_SOURCE_BYTES / 1024} KB.`);
  await enforceRateLimit(RATE_LIMITS.draft, actor.userId);
  const { room } = await loadRoomForCandidate(roomId, actor);
  assertActive(room);
  const question = await activeQuestion(roomId, questionId);
  if (question.kind !== "CODING") throw badRequest("Only coding questions have code drafts.");
  await db.interviewQuestion.update({ where: { id: questionId }, data: { draftCode: parsed.data.code, draftLanguage: parsed.data.language } });
  return { savedAt: new Date().toISOString() };
}

const answerSchema = z.union([
  z.object({ answer: z.string().trim().min(1, "Write an answer first.").max(MAX_ANSWER_CHARS) }),
  z.object({ explanation: codingExplanationSchema }),
]);

export async function submitAnswer(roomId: string, questionId: string, actor: Actor, input: unknown): Promise<ClientInterview> {
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid answer.");
  const access = await loadRoomForCandidate(roomId, actor);
  assertActive(access.room);
  const question = await activeQuestion(roomId, questionId);
  if ("answer" in parsed.data) {
    if (question.kind === "CODING") throw badRequest("Use the explanation form for coding questions.");
    await db.interviewQuestion.update({ where: { id: questionId }, data: { answer: parsed.data.answer, answeredAt: new Date() } });
  } else {
    if (question.kind !== "CODING") throw badRequest("Explanations are only for coding questions.");
    await db.interviewQuestion.update({ where: { id: questionId }, data: { explanation: parsed.data.explanation } });
  }
  await db.interviewEvent.create({
    data: { roomId, questionId, userId: actor.userId, eventType: "ANSWER_SUBMITTED", payload: { type: "answer" in parsed.data ? "answer" : "explanation" } },
  });
  return view(access);
}

export async function advanceQuestion(roomId: string, actor: Actor, input: unknown): Promise<ClientInterview & { evaluation?: EvaluationSchedule }> {
  const parsed = z.object({ expectedQuestionId: z.string().min(1).max(64), skip: z.boolean().default(false) }).safeParse(input);
  if (!parsed.success) throw badRequest("Invalid request.");
  const access = await loadRoomForCandidate(roomId, actor);
  const room = access.room;
  if (room.status === "COMPLETED") return view(access);
  assertActive(room);

  const questions = await loadQuestions(roomId);
  const current = questions.find((q) => q.status === "ACTIVE");
  // A double click or a retry after a network error: the question already moved on.
  if (!current || current.id !== parsed.data.expectedQuestionId) return view(access);

  const nextPosition = current.position + 1;
  const isLast = nextPosition >= room.questionCount;
  const closedStatus = parsed.data.skip ? "SKIPPED" : "ANSWERED";

  if (isLast) {
    await db.interviewQuestion.updateMany({ where: { id: current.id, status: "ACTIVE" }, data: { status: closedStatus, answeredAt: current.answeredAt ?? new Date() } });
    const evaluation = await completeRoom({ ...room }, "CANDIDATE_FINISHED", actor.userId);
    return { ...(await view(access)), evaluation: evaluation ?? undefined };
  }

  const closed = { ...current, status: closedStatus } as InterviewQuestion;
  const draft = await selectNextQuestion({ room, position: nextPosition, previous: [...questions.filter((q) => q.id !== current.id), closed] });
  const advanced = await db.$transaction(async (tx) => {
    const closedCount = await tx.interviewQuestion.updateMany({ where: { id: current.id, status: "ACTIVE" }, data: { status: closedStatus, answeredAt: current.answeredAt ?? new Date() } });
    if (closedCount.count === 0) return false;
    const question = await tx.interviewQuestion.create({ data: questionData(roomId, nextPosition, draft) });
    await tx.interviewRoom.update({ where: { id: roomId }, data: { version: { increment: 1 } } });
    await recordQuestionAsked(tx, roomId, question.id, draft, nextPosition, room.questionCount);
    return true;
  });
  const state = await view(access);
  if (advanced) await broadcast(roomId, { type: "state", version: state.version, status: state.status, currentQuestionId: state.currentQuestionId, endsAt: state.endsAt });
  return state;
}

/**
 * IN_PROGRESS -> COMPLETED, exactly once. Closes the active question, marks the
 * evaluation as pending and schedules it. Safe to call concurrently.
 */
export async function completeRoom(room: InterviewRoom, reason: "CANDIDATE_FINISHED" | "TIME_EXPIRED", userId: string | null): Promise<EvaluationSchedule | null> {
  const now = new Date();
  const done = await db.$transaction(async (tx) => {
    const updated = await tx.interviewRoom.updateMany({
      where: { id: room.id, status: "IN_PROGRESS" },
      data: { status: "COMPLETED", completedAt: now, evaluationStatus: "PENDING", version: { increment: 1 } },
    });
    if (updated.count === 0) return false;
    await tx.interviewQuestion.updateMany({ where: { roomId: room.id, status: "ACTIVE" }, data: { status: "ANSWERED" } });
    await tx.interviewReport.upsert({
      where: { roomId: room.id },
      create: { roomId: room.id, status: "PENDING", strengths: [], weaknesses: [] },
      update: { status: "PENDING", error: null },
    });
    await tx.interviewEvent.create({ data: { roomId: room.id, userId, eventType: "STATE_CHANGED", payload: { from: "IN_PROGRESS", to: "COMPLETED", reason } } });
    return true;
  });
  if (!done) return null;
  logger.info("interview completed", { roomId: room.id, reason });
  const fresh = await db.interviewRoom.findUniqueOrThrow({ where: { id: room.id } });
  await broadcast(room.id, { type: "state", version: fresh.version, status: "COMPLETED", currentQuestionId: null, endsAt: fresh.endsAt?.toISOString() ?? null });
  return scheduleEvaluation(room.id);
}

export async function completeInterview(roomId: string, actor: Actor): Promise<ClientInterview & { evaluation?: EvaluationSchedule }> {
  const access = await loadRoomForCandidate(roomId, actor);
  if (access.room.status === "CREATED") throw conflict("Start the interview before finishing it.");
  if (access.room.status !== "IN_PROGRESS") return view(access);
  const evaluation = await completeRoom(access.room, isPastDeadline(access.room.endsAt) ? "TIME_EXPIRED" : "CANDIDATE_FINISHED", actor.userId);
  return { ...(await view(access)), evaluation: evaluation ?? undefined };
}

export async function cancelInterview(roomId: string, actor: Actor): Promise<ClientInterview> {
  const access = await loadRoomForCandidate(roomId, actor);
  if (access.room.status !== "CREATED") throw conflict("Only interviews that have not started can be cancelled.");
  await db.interviewRoom.updateMany({ where: { id: roomId, status: "CREATED" }, data: { status: "CANCELLED", version: { increment: 1 } } });
  return view(access);
}

/** Completes interviews whose deadline passed while nobody had them open. Called by the worker. */
export async function expireOverdueInterviews(limit = 50): Promise<number> {
  const overdue = await db.interviewRoom.findMany({
    where: { status: "IN_PROGRESS", endsAt: { lt: new Date(Date.now() - 60_000) } },
    take: limit,
  });
  let count = 0;
  for (const room of overdue) {
    if (await completeRoom(room, "TIME_EXPIRED", null).catch((e) => logger.error("expire failed", { roomId: room.id, error: (e as Error).message }))) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Chat history
// ---------------------------------------------------------------------------

interface ChatPayload {
  role?: string;
  content?: string;
  kind?: string;
}

export async function listChat(roomId: string, actor: Actor): Promise<ClientChatMessage[]> {
  await loadRoomForActor(roomId, actor);
  const events = await db.interviewEvent.findMany({
    where: { roomId, eventType: { in: ["AI_CHAT_MESSAGE", "FOLLOW_UP_ASKED"] } },
    orderBy: { timestamp: "asc" },
    take: 500,
  });
  return events.map((e) => {
    const p = (e.payload ?? {}) as ChatPayload;
    return {
      id: e.id,
      role: p.role === "user" ? "user" : "assistant",
      content: typeof p.content === "string" ? p.content : "",
      questionId: e.questionId,
      kind: e.eventType === "FOLLOW_UP_ASKED" ? "follow-up" : p.kind === "system" ? "system" : "chat",
      createdAt: e.timestamp.toISOString(),
    };
  });
}

// ---------------------------------------------------------------------------
// Interviewer invites (collaborative interviews)
// ---------------------------------------------------------------------------

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createInvite(roomId: string, actor: Actor): Promise<{ token: string }> {
  const { room } = await loadRoomForCandidate(roomId, actor);
  if (room.status === "COMPLETED" || room.status === "CANCELLED") throw conflict("This interview has ended.");
  const token = randomBytes(24).toString("base64url");
  await db.interviewRoom.update({ where: { id: roomId }, data: { inviteTokenHash: hashToken(token) } });
  return { token };
}

export async function acceptInvite(token: unknown, actor: Actor): Promise<{ roomId: string }> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) throw notFound("Invite");
  const room = await db.interviewRoom.findUnique({ where: { inviteTokenHash: hashToken(token) } });
  if (!room) throw notFound("Invite");
  if (room.userId === actor.userId) return { roomId: room.id };
  if (room.status === "COMPLETED" || room.status === "CANCELLED") throw conflict("This interview has ended.");
  await db.interviewParticipant.upsert({
    where: { roomId_userId: { roomId: room.id, userId: actor.userId } },
    create: { roomId: room.id, userId: actor.userId, role: "INTERVIEWER" },
    update: {},
  });
  await db.interviewEvent.create({ data: { roomId: room.id, userId: actor.userId, eventType: "USER_JOINED", payload: { role: "INTERVIEWER" } } });
  return { roomId: room.id };
}

export function assertRole(access: RoomAccess, allowed: Array<RoomAccess["role"]>): void {
  if (!allowed.includes(access.role)) throw forbidden();
}

export type { InterviewMode, InterviewStatus, Language };
export { AppError };
