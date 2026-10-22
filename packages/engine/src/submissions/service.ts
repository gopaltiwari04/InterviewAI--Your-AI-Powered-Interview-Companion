/**
 * Code submissions. The web process never runs candidate code: it validates the
 * request, stores a QUEUED submission and enqueues a judge job whose ID is the
 * submission ID. Results are read back from BullMQ ("lazy finalisation") and
 * stored in sanitised form: hidden tests keep only a verdict and a time.
 */
import { DEFAULT_LIMITS, MAX_CUSTOM_INPUT_BYTES, MAX_SOURCE_BYTES, SUBMISSION_KINDS, type ExecutionResult } from "@repo/core/judge";
import type { ClientSubmission, ClientTestResult } from "@repo/core/interview";
import { LANGUAGES, assembleProgram, type Language } from "@repo/core/problems";
import { Prisma, type Submission } from "@repo/database";
import { z } from "zod";
import { badRequest, conflict, notFound, rateLimited, tooLarge, unavailable } from "../errors";
import { db, logger } from "../infra";
import { loadRoomForActor, loadRoomForCandidate, type Actor } from "../interviews/access";
import { resolveProblem } from "../interviews/problems";
import { enqueueExecution, executorStatus, lookupExecution } from "../queues";
import { RATE_LIMITS, enforceRateLimit } from "../rate-limit";
import { broadcast } from "../realtime";
import { isPastDeadline } from "@repo/core/interview";

const createSchema = z.object({
  questionId: z.string().min(1).max(64),
  kind: z.enum(SUBMISSION_KINDS).refine((k) => k !== "VALIDATE", "invalid kind"),
  language: z.enum(LANGUAGES),
  code: z.string().min(1, "Write some code first."),
  customInput: z.string().optional(),
  idempotencyKey: z.string().uuid(),
});

const MAX_ACTIVE_PER_USER = 3;
/** Jobs whose BullMQ record disappeared (Redis flush, eviction) are failed after this long. */
const LOST_JOB_MS = 10 * 60_000;

interface StoredTest {
  id: string;
  visible: boolean;
  verdict: ClientTestResult["verdict"];
  timeMs: number;
  stdout?: string;
  stderr?: string;
}

export async function createSubmission(roomId: string, actor: Actor, input: unknown): Promise<ClientSubmission> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid submission.");
  const req = parsed.data;
  if (Buffer.byteLength(req.code) > MAX_SOURCE_BYTES) throw tooLarge(`Code must be smaller than ${MAX_SOURCE_BYTES / 1024} KB.`);
  if (req.kind === "CUSTOM") {
    if (req.customInput === undefined) throw badRequest("Custom runs need input.");
    if (Buffer.byteLength(req.customInput) > MAX_CUSTOM_INPUT_BYTES) throw tooLarge(`Custom input must be smaller than ${MAX_CUSTOM_INPUT_BYTES / 1024} KB.`);
  }

  // Idempotency: a retried request returns the original submission instead of judging twice.
  const existing = await db.submission.findUnique({ where: { userId_idempotencyKey: { userId: actor.userId, idempotencyKey: req.idempotencyKey } } });
  if (existing) {
    if (existing.roomId !== roomId) throw conflict("This idempotency key was already used.");
    return toClientSubmission(await finalizeSubmission(existing));
  }

  const { room } = await loadRoomForCandidate(roomId, actor);
  if (room.status !== "IN_PROGRESS") throw conflict("This interview is not in progress.");
  if (isPastDeadline(room.endsAt)) throw conflict("Time is up for this interview.");
  const question = await db.interviewQuestion.findFirst({ where: { id: req.questionId, roomId } });
  if (!question) throw notFound("Question");
  if (question.kind !== "CODING") throw badRequest("This question does not take code.");
  if (question.status !== "ACTIVE") throw conflict("This question is no longer active.");

  await enforceRateLimit(RATE_LIMITS.submission, actor.userId);
  const active = await db.submission.count({ where: { userId: actor.userId, status: { in: ["QUEUED", "RUNNING"] }, createdAt: { gt: new Date(Date.now() - LOST_JOB_MS) } } });
  if (active >= MAX_ACTIVE_PER_USER) throw rateLimited(5);

  const executor = await executorStatus();
  if (!executor.online) throw unavailable("The code judge is offline right now, so code cannot be run. Your code is saved; please try again shortly.");

  const problem = await resolveProblem(question);
  if (!problem) throw unavailable("The problem for this question could not be loaded.");
  const tests =
    req.kind === "CUSTOM"
      ? [{ id: "custom", input: req.customInput!.endsWith("\n") ? req.customInput! : `${req.customInput}\n`, expected: null, visible: true }]
      : problem.tests(req.kind === "RUN" ? "RUN" : "SUBMIT");

  let submission: Submission;
  try {
    submission = await db.submission.create({
      data: {
        roomId,
        questionId: question.id,
        userId: actor.userId,
        kind: req.kind,
        language: req.language,
        code: req.code,
        customInput: req.kind === "CUSTOM" ? req.customInput : null,
        idempotencyKey: req.idempotencyKey,
        status: "QUEUED",
        totalCount: tests.length,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const dup = await db.submission.findUniqueOrThrow({ where: { userId_idempotencyKey: { userId: actor.userId, idempotencyKey: req.idempotencyKey } } });
      return toClientSubmission(await finalizeSubmission(dup));
    }
    throw err;
  }

  await db.interviewQuestion.update({ where: { id: question.id }, data: { draftCode: req.code, draftLanguage: req.language } });
  await db.interviewEvent.create({
    data: { roomId, questionId: question.id, userId: actor.userId, eventType: "CODE_EXECUTION", payload: { submissionId: submission.id, kind: req.kind, language: req.language } },
  });

  try {
    await enqueueExecution({
      submissionId: submission.id,
      roomId,
      kind: req.kind,
      language: req.language,
      files: assembleProgram(req.language, problem.signature, req.code),
      returns: problem.signature.returns,
      comparator: problem.comparator,
      tests,
      limits: { timeMsPerTest: problem.timeLimitMs, ...DEFAULT_LIMITS },
    });
  } catch (err) {
    logger.error("enqueue failed", { submissionId: submission.id, error: (err as Error).message });
    submission = await db.submission.update({
      where: { id: submission.id },
      data: { status: "FAILED", verdict: "INTERNAL_ERROR", error: "The code could not be queued. Please try again.", completedAt: new Date() },
    });
  }
  await broadcast(roomId, { type: "submission", version: room.version, submissionId: submission.id, questionId: question.id, status: submission.status, verdict: submission.verdict });
  return toClientSubmission(submission);
}

function sanitize(result: ExecutionResult): StoredTest[] {
  return result.tests.map((t) => ({
    id: t.id,
    visible: t.visible,
    verdict: t.verdict,
    timeMs: t.timeMs,
    ...(t.visible && t.stdout !== undefined ? { stdout: t.stdout.slice(0, 4096) } : {}),
    ...(t.visible && t.stderr !== undefined ? { stderr: t.stderr.slice(0, 4096) } : {}),
  }));
}

/**
 * Moves a QUEUED/RUNNING submission to its final state if the judge has
 * finished. Conditional updates make concurrent calls safe.
 */
export async function finalizeSubmission(submission: Submission): Promise<Submission> {
  if (submission.status === "COMPLETED" || submission.status === "FAILED") return submission;
  let lookup;
  try {
    lookup = await lookupExecution(submission.id);
  } catch (err) {
    logger.warn("job lookup failed", { submissionId: submission.id, error: (err as Error).message });
    return submission;
  }
  let data: Prisma.SubmissionUpdateManyMutationInput | null = null;
  if (lookup.state === "completed") {
    const r = lookup.result;
    data = {
      status: "COMPLETED",
      verdict: r.verdict,
      passedCount: r.passed,
      totalCount: r.total,
      compileOutput: r.compileOutput,
      results: sanitize(r) as unknown as Prisma.InputJsonValue,
      executionTimeMs: r.executionTimeMs,
      judgeVersion: r.judgeVersion,
      completedAt: new Date(),
    };
  } else if (lookup.state === "failed") {
    data = { status: "FAILED", verdict: "INTERNAL_ERROR", error: "The judge could not run this submission.", completedAt: new Date() };
  } else if (lookup.state === "missing" && Date.now() - submission.createdAt.getTime() > LOST_JOB_MS) {
    data = { status: "FAILED", verdict: "INTERNAL_ERROR", error: "The judge result was lost. Please run the code again.", completedAt: new Date() };
  } else if (lookup.state === "pending" && lookup.detail === "active" && submission.status === "QUEUED") {
    data = { status: "RUNNING" };
  }
  if (!data) return submission;
  const updated = await db.submission.updateMany({ where: { id: submission.id, status: { in: ["QUEUED", "RUNNING"] } }, data });
  const fresh = await db.submission.findUniqueOrThrow({ where: { id: submission.id } });
  if (updated.count > 0 && (fresh.status === "COMPLETED" || fresh.status === "FAILED")) {
    const room = await db.interviewRoom.findUnique({ where: { id: fresh.roomId }, select: { version: true } });
    await broadcast(fresh.roomId, { type: "submission", version: room?.version ?? 0, submissionId: fresh.id, questionId: fresh.questionId, status: fresh.status, verdict: fresh.verdict });
  }
  return fresh;
}

export async function finalizePendingForRoom(roomId: string): Promise<void> {
  const pending = await db.submission.findMany({ where: { roomId, status: { in: ["QUEUED", "RUNNING"] } } });
  for (const s of pending) await finalizeSubmission(s);
}

export async function toClientSubmission(s: Submission): Promise<ClientSubmission> {
  const stored = (Array.isArray(s.results) ? s.results : []) as unknown as StoredTest[];
  let visibleData = new Map<string, { input: string; expected: string }>();
  if (stored.some((t) => t.visible) && s.kind !== "CUSTOM") {
    const question = await db.interviewQuestion.findUnique({ where: { id: s.questionId } });
    const problem = question ? await resolveProblem(question) : null;
    // Only visible examples, which are already shown in the statement.
    visibleData = new Map((problem?.tests("RUN") ?? []).map((t) => [t.id, { input: t.input, expected: t.expected }]));
  }
  return {
    id: s.id,
    questionId: s.questionId,
    kind: s.kind as ClientSubmission["kind"],
    language: s.language as Language,
    status: s.status,
    verdict: s.verdict,
    passedCount: s.passedCount,
    totalCount: s.totalCount,
    compileOutput: s.compileOutput,
    error: s.error,
    tests: stored.map((t) => ({
      id: t.id,
      visible: t.visible,
      verdict: t.verdict,
      timeMs: t.timeMs,
      ...(t.visible
        ? {
            input: s.kind === "CUSTOM" ? (s.customInput ?? undefined) : visibleData.get(t.id)?.input,
            expected: s.kind === "CUSTOM" ? undefined : visibleData.get(t.id)?.expected,
            stdout: t.stdout,
            stderr: t.stderr,
          }
        : {}),
    })),
    createdAt: s.createdAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
  };
}

export async function getSubmission(roomId: string, submissionId: string, actor: Actor): Promise<ClientSubmission> {
  await loadRoomForActor(roomId, actor);
  const submission = await db.submission.findFirst({ where: { id: submissionId, roomId } });
  if (!submission) throw notFound("Submission");
  return toClientSubmission(await finalizeSubmission(submission));
}

export async function listSubmissions(roomId: string, actor: Actor, questionId?: string): Promise<ClientSubmission[]> {
  await loadRoomForActor(roomId, actor);
  const rows = await db.submission.findMany({
    where: { roomId, ...(questionId ? { questionId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const finalized = await Promise.all(rows.map((r) => finalizeSubmission(r)));
  return Promise.all(finalized.map((r) => toClientSubmission(r)));
}
