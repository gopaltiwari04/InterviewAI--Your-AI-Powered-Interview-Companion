import { codingExplanationSchema, type ClientInterview, type ClientQuestion, type InterviewMode, type InterviewStatus, type QuestionKind } from "@repo/core/interview";
import type { Difficulty, Language } from "@repo/core/problems";
import type { InterviewQuestion, InterviewRoom } from "@repo/database";
import type { RoomAccess } from "./access";
import { resolveProblem } from "./problems";

export async function toClientQuestion(q: InterviewQuestion, includeDraft: boolean): Promise<ClientQuestion> {
  const problem = q.kind === "CODING" ? ((await resolveProblem(q))?.publicView ?? null) : null;
  const explanation = q.explanation ? codingExplanationSchema.safeParse(q.explanation) : null;
  return {
    id: q.id,
    position: q.position,
    kind: q.kind as QuestionKind,
    source: q.source,
    status: q.status,
    title: q.title,
    prompt: q.prompt,
    topic: q.topic,
    difficulty: q.difficulty as Difficulty,
    selectionReason: q.selectionReason,
    answer: q.answer,
    explanation: explanation?.success ? explanation.data : null,
    draftCode: includeDraft ? q.draftCode : null,
    draftLanguage: includeDraft ? ((q.draftLanguage as Language | null) ?? null) : null,
    problem,
    askedAt: q.askedAt.toISOString(),
    answeredAt: q.answeredAt?.toISOString() ?? null,
  };
}

export async function toClientInterview(
  access: RoomAccess,
  room: InterviewRoom,
  questions: InterviewQuestion[],
  candidateName: string | null,
): Promise<ClientInterview> {
  const sorted = [...questions].sort((a, b) => a.position - b.position);
  const current = sorted.find((q) => q.status === "ACTIVE") ?? null;
  return {
    id: room.id,
    status: room.status as InterviewStatus,
    mode: room.mode as InterviewMode,
    difficulty: room.difficulty as Difficulty,
    language: room.language as Language,
    topics: room.topics,
    durationMinutes: room.durationMinutes,
    questionCount: room.questionCount,
    adaptive: room.adaptive,
    useAiQuestions: room.useAiQuestions,
    proctoringEnabled: room.proctoringEnabled,
    hasResume: Boolean(room.resumeProfileId),
    startedAt: room.startedAt?.toISOString() ?? null,
    endsAt: room.endsAt?.toISOString() ?? null,
    completedAt: room.completedAt?.toISOString() ?? null,
    serverTime: new Date().toISOString(),
    version: room.version,
    evaluationStatus: room.evaluationStatus,
    viewerRole: access.role,
    isCandidate: access.isCandidate,
    candidateName,
    currentQuestionId: room.status === "IN_PROGRESS" ? (current?.id ?? null) : null,
    questions: await Promise.all(sorted.map((q) => toClientQuestion(q, access.isCandidate))),
    // Interviews created before structured questions existed have none.
    legacy: room.status !== "CREATED" && sorted.length === 0,
  };
}
