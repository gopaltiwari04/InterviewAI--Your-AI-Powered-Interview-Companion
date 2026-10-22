/**
 * SERVER-ONLY service layer. Never import from client components; apps/web
 * re-exports it from lib/server/engine.ts behind "server-only".
 */
export { getEnv, resetEnvCache } from "./env";
export { AppError, badRequest, forbidden, notFound, unauthorized } from "./errors";
export { db, getRedis, logger } from "./infra";
export { enforceRateLimit, RATE_LIMITS } from "./rate-limit";
export { issueRealtimeToken, broadcast } from "./realtime";
export { executorStatus, evaluationWorkerStatus, queueMetrics } from "./queues";
export { readiness } from "./health";
export { getAiClient, createAiClient, AiError, classifyError } from "./ai/client";
export { generateStructured, extractJson, untrusted } from "./ai/structured";
export { buildFromDraft, generatedProblemSchema } from "./ai/problem-generator";
export { heuristicProfile } from "./ai/resume";

export { loadRoomForActor, loadRoomForCandidate, type Actor } from "./interviews/access";
export {
  createInterview,
  getInterview,
  startInterview,
  saveDraft,
  submitAnswer,
  advanceQuestion,
  completeInterview,
  cancelInterview,
  completeRoom,
  expireOverdueInterviews,
  listChat,
  createInvite,
  acceptInvite,
} from "./interviews/service";
export { sendChatMessage, generateFollowUp } from "./interviews/chat";
export { createSubmission, getSubmission, listSubmissions, finalizeSubmission } from "./submissions/service";
export { runEvaluation, retryEvaluation, scheduleEvaluation, getReport, RetryableEvaluationError } from "./evaluation/service";
export { ingestProctoringEvents, getProctoringReport, reviewProctoringEvent } from "./proctoring/service";
export { dashboardStats, interviewHistory } from "./analytics/service";
export { uploadResume, listResumes, reviewResume, deleteResume, detectResumeType, MAX_RESUME_BYTES } from "./resume/service";
