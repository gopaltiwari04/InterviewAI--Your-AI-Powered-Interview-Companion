-- InterviewAI platform upgrade: interview modes and lifecycle, questions,
-- coding submissions, structured evaluations, proctoring events and resumes.
-- Safe for an existing database: every new column has a default or is nullable,
-- and legacy data is mapped (see the hand-edited sections).

-- Hand-edited: the whole migration runs in one transaction so a failure leaves
-- the database untouched (requires PostgreSQL 12+ for ALTER TYPE ... ADD VALUE).
BEGIN;

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('DSA', 'TECHNICAL', 'BEHAVIORAL', 'MIXED');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('CANDIDATE', 'INTERVIEWER', 'OBSERVER');

-- CreateEnum
CREATE TYPE "QuestionKind" AS ENUM ('CODING', 'TECHNICAL', 'BEHAVIORAL');

-- CreateEnum
CREATE TYPE "QuestionSource" AS ENUM ('BANK', 'AI_GENERATED', 'RESUME', 'AI_FALLBACK_BANK');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('ACTIVE', 'ANSWERED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "GeneratedProblemStatus" AS ENUM ('VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubmissionKind" AS ENUM ('RUN', 'SUBMIT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('ACCEPTED', 'WRONG_ANSWER', 'COMPILATION_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'OUTPUT_LIMIT_EXCEEDED', 'INTERNAL_ERROR');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProctoringEventType" AS ENUM ('PROCTORING_STARTED', 'PROCTORING_STOPPED', 'TAB_HIDDEN', 'TAB_RETURNED', 'WINDOW_BLUR', 'FACE_NOT_DETECTED', 'MULTIPLE_FACES_DETECTED', 'CAMERA_PERMISSION_DENIED', 'CAMERA_INTERRUPTED', 'NETWORK_INTERRUPTED');

-- CreateEnum
CREATE TYPE "ProctoringSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('UNREVIEWED', 'ACKNOWLEDGED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ResumeStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- AlterEnum
CREATE TYPE "InterviewRoomStatus_new" AS ENUM ('CREATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
ALTER TABLE "InterviewRoom" ALTER COLUMN "status" DROP DEFAULT;
-- Hand-edited: legacy rooms were ACTIVE, which is now IN_PROGRESS.
ALTER TABLE "InterviewRoom" ALTER COLUMN "status" TYPE "InterviewRoomStatus_new" USING (
  CASE "status"::text WHEN 'ACTIVE' THEN 'IN_PROGRESS' ELSE "status"::text END
)::"InterviewRoomStatus_new";
ALTER TYPE "InterviewRoomStatus" RENAME TO "InterviewRoomStatus_old";
ALTER TYPE "InterviewRoomStatus_new" RENAME TO "InterviewRoomStatus";
DROP TYPE "InterviewRoomStatus_old";
ALTER TABLE "InterviewRoom" ALTER COLUMN "status" SET DEFAULT 'CREATED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InterviewEventType" ADD VALUE 'STATE_CHANGED';
ALTER TYPE "InterviewEventType" ADD VALUE 'QUESTION_ASKED';
ALTER TYPE "InterviewEventType" ADD VALUE 'ANSWER_SUBMITTED';
ALTER TYPE "InterviewEventType" ADD VALUE 'FOLLOW_UP_ASKED';

-- AlterTable
ALTER TABLE "InterviewRoom" ADD COLUMN     "adaptive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 45,
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "evaluationStatus" "EvaluationStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "inviteTokenHash" TEXT,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'python',
ADD COLUMN     "mode" "InterviewMode" NOT NULL DEFAULT 'MIXED',
ADD COLUMN     "proctoringConsentAt" TIMESTAMP(3),
ADD COLUMN     "proctoringEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "questionCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "resumeProfileId" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "useAiQuestions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "status" SET DEFAULT 'CREATED';

-- AlterTable
ALTER TABLE "InterviewParticipant" ADD COLUMN     "role" "ParticipantRole" NOT NULL DEFAULT 'CANDIDATE';

-- AlterTable
ALTER TABLE "InterviewEvent" ADD COLUMN     "questionId" TEXT,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "InterviewReport" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "dimensionScores" JSONB,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "integritySummary" JSONB,
ADD COLUMN     "judgeSummary" JSONB,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "questionFeedback" JSONB,
ADD COLUMN     "rubricVersion" TEXT,
ADD COLUMN     "status" "EvaluationStatus" NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "techScore" DROP NOT NULL,
ALTER COLUMN "commScore" DROP NOT NULL,
ALTER COLUMN "overallScore" DROP NOT NULL,
ALTER COLUMN "aiFeedback" SET DEFAULT '';

-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "QuestionKind" NOT NULL,
    "source" "QuestionSource" NOT NULL,
    "status" "QuestionStatus" NOT NULL DEFAULT 'ACTIVE',
    "problemSlug" TEXT,
    "problemVersion" INTEGER,
    "generatedProblemId" TEXT,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "topic" TEXT,
    "difficulty" "Difficulty" NOT NULL,
    "selectionReason" TEXT NOT NULL,
    "rubricHints" JSONB,
    "answer" TEXT,
    "explanation" JSONB,
    "draftCode" TEXT,
    "draftLanguage" TEXT,
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedProblem" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "status" "GeneratedProblemStatus" NOT NULL,
    "model" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "topics" TEXT[],
    "definition" JSONB NOT NULL,
    "tests" JSONB NOT NULL,
    "referenceSolution" TEXT NOT NULL,
    "validationLog" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "SubmissionKind" NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customInput" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'QUEUED',
    "verdict" "Verdict",
    "passedCount" INTEGER,
    "totalCount" INTEGER,
    "compileOutput" TEXT,
    "results" JSONB,
    "executionTimeMs" INTEGER,
    "judgeVersion" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProctoringEvent" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "type" "ProctoringEventType" NOT NULL,
    "severity" "ProctoringSeverity" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ProctoringEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "status" "ResumeStatus" NOT NULL DEFAULT 'PROCESSING',
    "summary" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "projects" JSONB,
    "experience" JSONB,
    "confirmedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewQuestion_problemSlug_idx" ON "InterviewQuestion"("problemSlug");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewQuestion_roomId_position_key" ON "InterviewQuestion"("roomId", "position");

-- CreateIndex
CREATE INDEX "GeneratedProblem_status_difficulty_idx" ON "GeneratedProblem"("status", "difficulty");

-- CreateIndex
CREATE INDEX "Submission_roomId_createdAt_idx" ON "Submission"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "Submission_questionId_kind_createdAt_idx" ON "Submission"("questionId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "Submission_userId_createdAt_idx" ON "Submission"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Submission_status_createdAt_idx" ON "Submission"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_userId_idempotencyKey_key" ON "Submission"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ProctoringEvent_roomId_startedAt_idx" ON "ProctoringEvent"("roomId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProctoringEvent_roomId_clientEventId_key" ON "ProctoringEvent"("roomId", "clientEventId");

-- CreateIndex
CREATE INDEX "ResumeProfile_userId_createdAt_idx" ON "ResumeProfile"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewRoom_inviteTokenHash_key" ON "InterviewRoom"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "InterviewRoom_userId_createdAt_idx" ON "InterviewRoom"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InterviewRoom_status_endsAt_idx" ON "InterviewRoom"("status", "endsAt");

-- CreateIndex
CREATE INDEX "InterviewParticipant_userId_idx" ON "InterviewParticipant"("userId");

-- CreateIndex
CREATE INDEX "InterviewEvent_roomId_timestamp_idx" ON "InterviewEvent"("roomId", "timestamp");

-- AddForeignKey
ALTER TABLE "InterviewRoom" ADD CONSTRAINT "InterviewRoom_resumeProfileId_fkey" FOREIGN KEY ("resumeProfileId") REFERENCES "ResumeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewEvent" ADD CONSTRAINT "InterviewEvent_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "InterviewRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_generatedProblemId_fkey" FOREIGN KEY ("generatedProblemId") REFERENCES "GeneratedProblem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "InterviewRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProctoringEvent" ADD CONSTRAINT "ProctoringEvent_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "InterviewRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProctoringEvent" ADD CONSTRAINT "ProctoringEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeProfile" ADD CONSTRAINT "ResumeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-edited data backfill for interviews created before this migration.
UPDATE "InterviewRoom" SET "startedAt" = "createdAt" WHERE "startedAt" IS NULL AND "status" IN ('IN_PROGRESS', 'COMPLETED');
UPDATE "InterviewRoom" SET "completedAt" = "updatedAt" WHERE "completedAt" IS NULL AND "status" = 'COMPLETED';
UPDATE "InterviewRoom" r SET "evaluationStatus" = 'COMPLETED'
  WHERE EXISTS (SELECT 1 FROM "InterviewReport" rep WHERE rep."roomId" = r."id");
UPDATE "InterviewReport" SET "completedAt" = "createdAt" WHERE "completedAt" IS NULL;

COMMIT;
