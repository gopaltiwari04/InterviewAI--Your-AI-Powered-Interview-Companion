import type { PrismaClient } from "@prisma/client";

/**
 * Idempotent runtime database schema synchronization.
 * Safe to run against any Postgres database (Neon pooled, direct, Supabase, local).
 * Creates missing enums, creates missing tables, adds missing columns, and creates indexes
 * without destroying existing data.
 */
export async function migrateRuntime(db: PrismaClient): Promise<{ success: boolean; log: string[] }> {
  const log: string[] = [];

  const execute = async (sql: string, description: string) => {
    try {
      await db.$executeRawUnsafe(sql);
      log.push(`OK: ${description}`);
    } catch (err) {
      log.push(`WARN (${description}): ${(err as Error).message}`);
    }
  };

  // 1. Enums
  const enums: [string, string[]][] = [
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
    await execute(
      `DO $$ BEGIN
        CREATE TYPE "${name}" AS ENUM (${valuesList});
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;`,
      `Enum ${name}`
    );
  }

  // Standalone enum updates for existing installations
  const roomStatuses = ["CREATED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
  for (const val of roomStatuses) {
    await execute(
      `ALTER TYPE "InterviewRoomStatus" ADD VALUE IF NOT EXISTS '${val}';`,
      `InterviewRoomStatus value ${val}`
    );
  }

  const eventTypes = ["STATE_CHANGED", "QUESTION_ASKED", "ANSWER_SUBMITTED", "FOLLOW_UP_ASKED"];
  for (const val of eventTypes) {
    await execute(
      `ALTER TYPE "InterviewEventType" ADD VALUE IF NOT EXISTS '${val}';`,
      `InterviewEventType value ${val}`
    );
  }

  // 2. Base tables (if fresh database)
  await execute(
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
    `Table User`
  );

  await execute(
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
    `Table Account`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS "Session" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "sessionToken" TEXT NOT NULL UNIQUE,
      "userId" TEXT NOT NULL,
      "expires" TIMESTAMP(3) NOT NULL
    );`,
    `Table Session`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS "VerificationToken" (
      "identifier" TEXT NOT NULL,
      "token" TEXT NOT NULL UNIQUE,
      "expires" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "VerificationToken_identifier_token_key" UNIQUE ("identifier", "token")
    );`,
    `Table VerificationToken`
  );

  await execute(
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
    `Table InterviewRoom`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS "InterviewParticipant" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "roomId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "role" "ParticipantRole" NOT NULL DEFAULT 'CANDIDATE',
      "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "InterviewParticipant_roomId_userId_key" UNIQUE ("roomId", "userId")
    );`,
    `Table InterviewParticipant`
  );

  await execute(
    `CREATE TABLE IF NOT EXISTS "InterviewEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "roomId" TEXT NOT NULL,
      "questionId" TEXT,
      "userId" TEXT,
      "eventType" "InterviewEventType" NOT NULL,
      "payload" JSONB NOT NULL,
      "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `Table InterviewEvent`
  );

  await execute(
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
    `Table InterviewReport`
  );

  // 3. New Models
  await execute(
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
    `Table GeneratedProblem`
  );

  await execute(
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
    `Table ResumeProfile`
  );

  await execute(
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
    `Table InterviewQuestion`
  );

  await execute(
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
    `Table Submission`
  );

  await execute(
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
    `Table ProctoringEvent`
  );

  // 4. Alter columns on existing tables (safe add if missing)
  await execute(
    `ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "passwordHash" TEXT,
      ADD COLUMN IF NOT EXISTS "role" "Role" NOT NULL DEFAULT 'CANDIDATE';`,
    `Alter User columns`
  );

  await execute(
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
    `Alter InterviewRoom columns`
  );

  await execute(
    `ALTER TABLE "InterviewParticipant" ADD COLUMN IF NOT EXISTS "role" "ParticipantRole" NOT NULL DEFAULT 'CANDIDATE';`,
    `Alter InterviewParticipant role`
  );

  await execute(
    `ALTER TABLE "InterviewEvent" 
      ADD COLUMN IF NOT EXISTS "questionId" TEXT,
      ADD COLUMN IF NOT EXISTS "userId" TEXT;`,
    `Alter InterviewEvent columns`
  );

  await execute(
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
    `Alter InterviewReport columns`
  );

  // Relax legacy NOT NULL score columns on InterviewReport and ensure status default on InterviewRoom
  await execute(
    `ALTER TABLE "InterviewReport"
      ALTER COLUMN "techScore" DROP NOT NULL,
      ALTER COLUMN "commScore" DROP NOT NULL,
      ALTER COLUMN "overallScore" DROP NOT NULL;`,
    `Relax InterviewReport score NOT NULL constraints`
  );

  await execute(
    `UPDATE "InterviewRoom" SET "status" = 'IN_PROGRESS' WHERE "status"::text = 'ACTIVE';`,
    `Update legacy ACTIVE room status to IN_PROGRESS`
  );

  await execute(
    `ALTER TABLE "InterviewRoom" ALTER COLUMN "status" SET DEFAULT 'CREATED';`,
    `Set InterviewRoom status default CREATED`
  );


  // 5. Constraints and Key Indexes
  await execute(`CREATE UNIQUE INDEX IF NOT EXISTS "InterviewQuestion_roomId_position_key" ON "InterviewQuestion"("roomId", "position");`, `Constraint InterviewQuestion roomId position`);
  await execute(`CREATE UNIQUE INDEX IF NOT EXISTS "InterviewRoom_inviteTokenHash_key" ON "InterviewRoom"("inviteTokenHash");`, `Constraint InterviewRoom inviteTokenHash`);
  await execute(`CREATE UNIQUE INDEX IF NOT EXISTS "Submission_userId_idempotencyKey_key" ON "Submission"("userId", "idempotencyKey");`, `Constraint Submission userId idempotency`);
  await execute(`CREATE UNIQUE INDEX IF NOT EXISTS "ProctoringEvent_roomId_clientEventId_key" ON "ProctoringEvent"("roomId", "clientEventId");`, `Constraint ProctoringEvent clientEventId`);

  await execute(`CREATE INDEX IF NOT EXISTS "InterviewRoom_userId_createdAt_idx" ON "InterviewRoom"("userId", "createdAt");`, `Index InterviewRoom user`);
  await execute(`CREATE INDEX IF NOT EXISTS "InterviewRoom_status_endsAt_idx" ON "InterviewRoom"("status", "endsAt");`, `Index InterviewRoom status endsAt`);
  await execute(`CREATE INDEX IF NOT EXISTS "InterviewParticipant_userId_idx" ON "InterviewParticipant"("userId");`, `Index InterviewParticipant userId`);
  await execute(`CREATE INDEX IF NOT EXISTS "InterviewEvent_roomId_timestamp_idx" ON "InterviewEvent"("roomId", "timestamp");`, `Index InterviewEvent room`);
  await execute(`CREATE INDEX IF NOT EXISTS "InterviewQuestion_roomId_idx" ON "InterviewQuestion"("roomId");`, `Index InterviewQuestion room`);
  await execute(`CREATE INDEX IF NOT EXISTS "InterviewQuestion_problemSlug_idx" ON "InterviewQuestion"("problemSlug");`, `Index InterviewQuestion problemSlug`);
  await execute(`CREATE INDEX IF NOT EXISTS "GeneratedProblem_status_difficulty_idx" ON "GeneratedProblem"("status", "difficulty");`, `Index GeneratedProblem status difficulty`);
  await execute(`CREATE INDEX IF NOT EXISTS "Submission_roomId_createdAt_idx" ON "Submission"("roomId", "createdAt");`, `Index Submission room`);
  await execute(`CREATE INDEX IF NOT EXISTS "Submission_questionId_kind_createdAt_idx" ON "Submission"("questionId", "kind", "createdAt");`, `Index Submission question`);
  await execute(`CREATE INDEX IF NOT EXISTS "Submission_userId_createdAt_idx" ON "Submission"("userId", "createdAt");`, `Index Submission user`);
  await execute(`CREATE INDEX IF NOT EXISTS "Submission_status_createdAt_idx" ON "Submission"("status", "createdAt");`, `Index Submission status`);
  await execute(`CREATE INDEX IF NOT EXISTS "ProctoringEvent_roomId_startedAt_idx" ON "ProctoringEvent"("roomId", "startedAt");`, `Index ProctoringEvent room`);
  await execute(`CREATE INDEX IF NOT EXISTS "ResumeProfile_userId_createdAt_idx" ON "ResumeProfile"("userId", "createdAt");`, `Index ResumeProfile user`);

  // 6. User unification: ensure Gopal / ZEUS account retains all interview history across OAuth logins
  await execute(
    `DO $$
    DECLARE
      target_id TEXT;
      other_user RECORD;
    BEGIN
      SELECT id INTO target_id FROM "User" WHERE email = 'tiwarigopal94@gmail.com' OR name = 'ZEUS' ORDER BY "createdAt" ASC LIMIT 1;
      
      IF target_id IS NOT NULL THEN
        UPDATE "User" SET name = 'ZEUS' WHERE id = target_id;

        FOR other_user IN
          SELECT id FROM "User" WHERE (name ILIKE '%gopaltiwari%' OR email ILIKE '%gopaltiwari%' OR email ILIKE '%tiwarigopal%') AND id != target_id
        LOOP
          UPDATE "InterviewRoom" SET "userId" = target_id WHERE "userId" = other_user.id;
          UPDATE "Submission" SET "userId" = target_id WHERE "userId" = other_user.id;
          UPDATE "InterviewEvent" SET "userId" = target_id WHERE "userId" = other_user.id;
          UPDATE "InterviewParticipant" SET "userId" = target_id WHERE "userId" = other_user.id;
          UPDATE "Account" SET "userId" = target_id WHERE "userId" = other_user.id;
          UPDATE "Session" SET "userId" = target_id WHERE "userId" = other_user.id;
          DELETE FROM "User" WHERE id = other_user.id;
        END LOOP;
      ELSE
        UPDATE "User" SET name = 'ZEUS' WHERE name ILIKE '%gopaltiwari%' OR email ILIKE '%tiwarigopal%';
      END IF;
    END $$;`,
    `Unify candidate ZEUS account across OAuth providers`
  );

  return { success: true, log };

}
