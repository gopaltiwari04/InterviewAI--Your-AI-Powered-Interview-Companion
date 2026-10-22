import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../prisma/schema.prisma");

if (!process.env.DATABASE_URL) {
  console.log("[sync-db] DATABASE_URL is not set; skipping database synchronization.");
  process.exit(0);
}

console.log("[sync-db] Synchronizing database schema...");

async function runRawSqlSync(db) {
  console.log("[sync-db] Executing raw idempotent SQL sync...");
  const enums = [
    ["Role", ["CANDIDATE", "INTERVIEWER", "ADMIN"]],
    ["InterviewRoomStatus", ["CREATED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]],
    ["InterviewMode", ["DSA", "TECHNICAL", "BEHAVIORAL", "MIXED"]],
    ["Difficulty", ["EASY", "MEDIUM", "HARD"]],
    ["ParticipantRole", ["CANDIDATE", "INTERVIEWER", "OBSERVER"]],
    ["InterviewEventType", ["AI_CHAT_MESSAGE", "CODE_EXECUTION", "CODE_CHANGE", "USER_JOINED", "USER_LEFT", "STATE_CHANGED", "QUESTION_ASKED", "ANSWER_SUBMITTED", "FOLLOW_UP_ASKED"]],
    ["QuestionKind", ["CODING", "TECHNICAL", "BEHAVIORAL"]],
    ["QuestionSource", ["BANK", "AI_GENERATED", "RESUME", "AI_FALLBACK_BANK"]],
    ["QuestionStatus", ["ACTIVE", "ANSWERED", "SKIPPED"]],
    ["GeneratedProblemStatus", ["VALIDATED", "REJECTED"]],
    ["SubmissionKind", ["RUN", "SUBMIT", "CUSTOM"]],
    ["SubmissionStatus", ["QUEUED", "RUNNING", "COMPLETED", "FAILED"]],
    ["Verdict", ["ACCEPTED", "WRONG_ANSWER", "COMPILATION_ERROR", "RUNTIME_ERROR", "TIME_LIMIT_EXCEEDED", "MEMORY_LIMIT_EXCEEDED", "OUTPUT_LIMIT_EXCEEDED", "INTERNAL_ERROR"]],
    ["EvaluationStatus", ["NOT_STARTED", "PENDING", "RUNNING", "COMPLETED", "FAILED"]],
    ["ProctoringEventType", ["PROCTORING_STARTED", "PROCTORING_STOPPED", "TAB_HIDDEN", "TAB_RETURNED", "WINDOW_BLUR", "FACE_NOT_DETECTED", "MULTIPLE_FACES_DETECTED", "CAMERA_PERMISSION_DENIED", "CAMERA_INTERRUPTED", "NETWORK_INTERRUPTED"]],
    ["ProctoringSeverity", ["INFO", "LOW", "MEDIUM", "HIGH"]],
    ["ReviewStatus", ["UNREVIEWED", "ACKNOWLEDGED", "DISMISSED"]],
    ["ResumeStatus", ["PROCESSING", "READY", "FAILED"]],
  ];

  for (const [name, values] of enums) {
    const valuesList = values.map((v) => `'${v}'`).join(", ");
    try {
      await db.$executeRawUnsafe(
        `DO $$ BEGIN CREATE TYPE "${name}" AS ENUM (${valuesList}); EXCEPTION WHEN duplicate_object THEN null; END $$;`
      );
    } catch {
      // ignore
    }
  }

  const roomStatuses = ["CREATED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
  for (const val of roomStatuses) {
    try {
      await db.$executeRawUnsafe(`ALTER TYPE "InterviewRoomStatus" ADD VALUE IF NOT EXISTS '${val}';`);
    } catch {
      // ignore
    }
  }

  const eventTypes = ["STATE_CHANGED", "QUESTION_ASKED", "ANSWER_SUBMITTED", "FOLLOW_UP_ASKED"];
  for (const val of eventTypes) {
    try {
      await db.$executeRawUnsafe(`ALTER TYPE "InterviewEventType" ADD VALUE IF NOT EXISTS '${val}';`);
    } catch {
      // ignore
    }
  }


  const stmts = [
    `CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT,
      "email" TEXT UNIQUE,
      "emailVerified" TIMESTAMP(3),
      "image" TEXT,
      "passwordHash" TEXT,
      "role" "Role" NOT NULL DEFAULT 'CANDIDATE',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS "Account" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "providerAccountId" TEXT NOT NULL,
      "refresh_token" TEXT,
      "access_token" TEXT,
      "expires_at" INTEGER,
      "token_type" TEXT,
      "scope" TEXT,
      "id_token" TEXT,
      "session_state" TEXT,
      CONSTRAINT "Account_provider_providerAccountId_key" UNIQUE ("provider", "providerAccountId")
    );`,
    `CREATE TABLE IF NOT EXISTS "Session" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "sessionToken" TEXT NOT NULL UNIQUE,
      "userId" TEXT NOT NULL,
      "expires" TIMESTAMP(3) NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS "VerificationToken" (
      "identifier" TEXT NOT NULL,
      "token" TEXT NOT NULL UNIQUE,
      "expires" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "VerificationToken_identifier_token_key" UNIQUE ("identifier", "token")
    );`,
    `CREATE TABLE IF NOT EXISTS "InterviewRoom" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "status" "InterviewRoomStatus" NOT NULL DEFAULT 'CREATED',
      "mode" "InterviewMode" NOT NULL DEFAULT 'MIXED',
      "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
      "language" TEXT NOT NULL DEFAULT 'python',
      "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
      "durationMinutes" INTEGER NOT NULL DEFAULT 45,
      "questionCount" INTEGER NOT NULL DEFAULT 1,
      "adaptive" BOOLEAN NOT NULL DEFAULT false,
      "useAiQuestions" BOOLEAN NOT NULL DEFAULT false,
      "proctoringEnabled" BOOLEAN NOT NULL DEFAULT false,
      "proctoringConsentAt" TIMESTAMP(3),
      "resumeProfileId" TEXT,
      "inviteTokenHash" TEXT UNIQUE,
      "startedAt" TIMESTAMP(3),
      "endsAt" TIMESTAMP(3),
      "completedAt" TIMESTAMP(3),
      "version" INTEGER NOT NULL DEFAULT 0,
      "evaluationStatus" "EvaluationStatus" NOT NULL DEFAULT 'NOT_STARTED',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS "InterviewParticipant" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "roomId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "role" "ParticipantRole" NOT NULL DEFAULT 'CANDIDATE',
      "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "InterviewParticipant_roomId_userId_key" UNIQUE ("roomId", "userId")
    );`,
    `CREATE TABLE IF NOT EXISTS "InterviewEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "roomId" TEXT NOT NULL,
      "questionId" TEXT,
      "userId" TEXT,
      "eventType" "InterviewEventType" NOT NULL,
      "payload" JSONB NOT NULL,
      "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS "InterviewReport" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "roomId" TEXT NOT NULL UNIQUE,
      "status" "EvaluationStatus" NOT NULL DEFAULT 'COMPLETED',
      "techScore" INTEGER,
      "commScore" INTEGER,
      "overallScore" INTEGER,
      "strengths" TEXT[] DEFAULT ARRAY[]::TEXT[],
      "weaknesses" TEXT[] DEFAULT ARRAY[]::TEXT[],
      "aiFeedback" TEXT NOT NULL DEFAULT '',
      "rubricVersion" TEXT,
      "model" TEXT,
      "dimensionScores" JSONB,
      "questionFeedback" JSONB,
      "judgeSummary" JSONB,
      "integritySummary" JSONB,
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "error" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completedAt" TIMESTAMP(3)
    );`,
    `CREATE TABLE IF NOT EXISTS "GeneratedProblem" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "createdById" TEXT,
      "status" "GeneratedProblemStatus" NOT NULL,
      "model" TEXT NOT NULL,
      "difficulty" "Difficulty" NOT NULL,
      "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
      "definition" JSONB NOT NULL,
      "tests" JSONB NOT NULL,
      "referenceSolution" TEXT NOT NULL,
      "validationLog" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS "ResumeProfile" (
      "id" TEXT NOT NULL PRIMARY KEY,
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
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS "InterviewQuestion" (
      "id" TEXT NOT NULL PRIMARY KEY,
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
      "answeredAt" TIMESTAMP(3)
    );`,
    `CREATE TABLE IF NOT EXISTS "Submission" (
      "id" TEXT NOT NULL PRIMARY KEY,
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
      "completedAt" TIMESTAMP(3)
    );`,
    `CREATE TABLE IF NOT EXISTS "ProctoringEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
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
      "reviewedAt" TIMESTAMP(3)
    );`,
    `ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "passwordHash" TEXT,
      ADD COLUMN IF NOT EXISTS "role" "Role" NOT NULL DEFAULT 'CANDIDATE';`,
    `ALTER TABLE "InterviewRoom" 
      ADD COLUMN IF NOT EXISTS "adaptive" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
      ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NOT NULL DEFAULT 45,
      ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "evaluationStatus" "EvaluationStatus" NOT NULL DEFAULT 'NOT_STARTED',
      ADD COLUMN IF NOT EXISTS "inviteTokenHash" TEXT,
      ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'python',
      ADD COLUMN IF NOT EXISTS "mode" "InterviewMode" NOT NULL DEFAULT 'MIXED',
      ADD COLUMN IF NOT EXISTS "proctoringConsentAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "proctoringEnabled" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "questionCount" INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "resumeProfileId" TEXT,
      ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS "useAiQuestions" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE "InterviewParticipant" ADD COLUMN IF NOT EXISTS "role" "ParticipantRole" NOT NULL DEFAULT 'CANDIDATE';`,
    `ALTER TABLE "InterviewEvent" 
      ADD COLUMN IF NOT EXISTS "questionId" TEXT,
      ADD COLUMN IF NOT EXISTS "userId" TEXT;`,
    `ALTER TABLE "InterviewReport" 
      ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "dimensionScores" JSONB,
      ADD COLUMN IF NOT EXISTS "error" TEXT,
      ADD COLUMN IF NOT EXISTS "integritySummary" JSONB,
      ADD COLUMN IF NOT EXISTS "judgeSummary" JSONB,
      ADD COLUMN IF NOT EXISTS "model" TEXT,
      ADD COLUMN IF NOT EXISTS "questionFeedback" JSONB,
      ADD COLUMN IF NOT EXISTS "rubricVersion" TEXT,
      ADD COLUMN IF NOT EXISTS "status" "EvaluationStatus" NOT NULL DEFAULT 'COMPLETED',
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "techScore" INTEGER,
      ADD COLUMN IF NOT EXISTS "commScore" INTEGER,
      ADD COLUMN IF NOT EXISTS "overallScore" INTEGER,
      ADD COLUMN IF NOT EXISTS "aiFeedback" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "strengths" TEXT[] DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS "weaknesses" TEXT[] DEFAULT ARRAY[]::TEXT[];`,
    `ALTER TABLE "InterviewReport"
      ALTER COLUMN "techScore" DROP NOT NULL,
      ALTER COLUMN "commScore" DROP NOT NULL,
      ALTER COLUMN "overallScore" DROP NOT NULL;`,
    `UPDATE "InterviewRoom" SET "status" = 'IN_PROGRESS' WHERE "status"::text = 'ACTIVE';`,
    `ALTER TABLE "InterviewRoom" ALTER COLUMN "status" SET DEFAULT 'CREATED';`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "InterviewQuestion_roomId_position_key" ON "InterviewQuestion"("roomId", "position");`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "InterviewRoom_inviteTokenHash_key" ON "InterviewRoom"("inviteTokenHash");`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Submission_userId_idempotencyKey_key" ON "Submission"("userId", "idempotencyKey");`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ProctoringEvent_roomId_clientEventId_key" ON "ProctoringEvent"("roomId", "clientEventId");`,
    `CREATE INDEX IF NOT EXISTS "InterviewRoom_userId_createdAt_idx" ON "InterviewRoom"("userId", "createdAt");`,
    `CREATE INDEX IF NOT EXISTS "InterviewRoom_status_endsAt_idx" ON "InterviewRoom"("status", "endsAt");`,
    `CREATE INDEX IF NOT EXISTS "InterviewParticipant_userId_idx" ON "InterviewParticipant"("userId");`,
    `CREATE INDEX IF NOT EXISTS "InterviewEvent_roomId_timestamp_idx" ON "InterviewEvent"("roomId", "timestamp");`,
    `CREATE INDEX IF NOT EXISTS "InterviewQuestion_roomId_idx" ON "InterviewQuestion"("roomId");`,
    `CREATE INDEX IF NOT EXISTS "InterviewQuestion_problemSlug_idx" ON "InterviewQuestion"("problemSlug");`,
    `CREATE INDEX IF NOT EXISTS "GeneratedProblem_status_difficulty_idx" ON "GeneratedProblem"("status", "difficulty");`,
    `CREATE INDEX IF NOT EXISTS "Submission_roomId_createdAt_idx" ON "Submission"("roomId", "createdAt");`,
    `CREATE INDEX IF NOT EXISTS "Submission_questionId_kind_createdAt_idx" ON "Submission"("questionId", "kind", "createdAt");`,
    `CREATE INDEX IF NOT EXISTS "Submission_userId_createdAt_idx" ON "Submission"("userId", "createdAt");`,
    `CREATE INDEX IF NOT EXISTS "Submission_status_createdAt_idx" ON "Submission"("status", "createdAt");`,
    `CREATE INDEX IF NOT EXISTS "ProctoringEvent_roomId_startedAt_idx" ON "ProctoringEvent"("roomId", "startedAt");`,
    `CREATE INDEX IF NOT EXISTS "ResumeProfile_userId_createdAt_idx" ON "ResumeProfile"("userId", "createdAt");`,
  ];

  for (const sql of stmts) {
    try {
      await db.$executeRawUnsafe(sql);
    } catch {
      // ignore
    }
  }
  console.log("[sync-db] Raw idempotent SQL sync completed.");
}

async function run() {
  try {
    execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
      stdio: "inherit",
      env: process.env,
    });
    console.log("[sync-db] Prisma migrations applied successfully.");
    return;
  } catch (migErr) {
    console.warn("[sync-db] migrate deploy did not complete cleanly, attempting fallback...", migErr?.message ?? "");
  }

  try {
    const db = new PrismaClient();
    await runRawSqlSync(db);
    await db.$disconnect();
  } catch (rawErr) {
    console.warn("[sync-db] Raw SQL sync warning:", rawErr?.message ?? rawErr);
  }
}

await run();
