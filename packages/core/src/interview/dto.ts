/**
 * Shapes returned by the web API. Everything here is safe to send to the
 * browser: no hidden tests, reference solutions or rubric hints.
 */
import type { CodingExplanation, InterviewMode, InterviewStatus, QuestionKind } from "./index";
import type { TestVerdict, Verdict, SubmissionKind } from "../judge/index";
import type { Difficulty, Language, PublicProblem } from "../problems/types";

export type ParticipantRole = "CANDIDATE" | "INTERVIEWER" | "OBSERVER";
export type EvaluationStatus = "NOT_STARTED" | "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface ClientQuestion {
  id: string;
  position: number;
  kind: QuestionKind;
  source: "BANK" | "AI_GENERATED" | "RESUME" | "AI_FALLBACK_BANK";
  status: "ACTIVE" | "ANSWERED" | "SKIPPED";
  title: string;
  prompt: string;
  topic: string | null;
  difficulty: Difficulty;
  selectionReason: string;
  answer: string | null;
  explanation: CodingExplanation | null;
  /** Only sent to the candidate who owns the interview. */
  draftCode: string | null;
  draftLanguage: Language | null;
  problem: PublicProblem | null;
  askedAt: string;
  answeredAt: string | null;
}

export interface ClientInterview {
  id: string;
  status: InterviewStatus;
  mode: InterviewMode;
  difficulty: Difficulty;
  language: Language;
  topics: string[];
  durationMinutes: number;
  questionCount: number;
  adaptive: boolean;
  useAiQuestions: boolean;
  proctoringEnabled: boolean;
  hasResume: boolean;
  startedAt: string | null;
  endsAt: string | null;
  completedAt: string | null;
  /** Lets the client correct for clock skew when rendering the timer. */
  serverTime: string;
  version: number;
  evaluationStatus: EvaluationStatus;
  viewerRole: ParticipantRole;
  isCandidate: boolean;
  candidateName: string | null;
  currentQuestionId: string | null;
  questions: ClientQuestion[];
  legacy: boolean;
}

export interface ClientTestResult {
  id: string;
  visible: boolean;
  verdict: TestVerdict;
  timeMs: number;
  input?: string;
  expected?: string;
  stdout?: string;
  stderr?: string;
}

export interface ClientSubmission {
  id: string;
  questionId: string;
  kind: SubmissionKind;
  language: Language;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  verdict: Verdict | null;
  passedCount: number | null;
  totalCount: number | null;
  compileOutput: string | null;
  tests: ClientTestResult[];
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ClientChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  questionId: string | null;
  kind: "chat" | "follow-up" | "system";
  createdAt: string;
}
