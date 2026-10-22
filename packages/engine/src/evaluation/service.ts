/**
 * Interview evaluation pipeline.
 *
 *   completeRoom() -> report PENDING -> scheduleEvaluation()
 *     queue mode:  BullMQ job consumed by apps/worker (bounded retries, backoff)
 *     inline mode: the web route runs runEvaluation() after responding
 *   runEvaluation(): claim (PENDING|FAILED|stale RUNNING -> RUNNING) exactly once,
 *     finalise submissions, score each question, persist, broadcast.
 *
 * Coding correctness always comes from judge results. The model scores the
 * remaining rubric dimensions; totals are computed in code. If the model is
 * unavailable a partial report (judge-based scores only) is stored and the
 * evaluation can be retried safely.
 */
import {
  AUTOMATED_FEEDBACK_NOTICE,
  RUBRICS,
  RUBRIC_VERSION,
  aggregateScores,
  aiOverallSchema,
  aiQuestionEvaluationSchema,
  buildQuestionResult,
  type JudgeEvidence,
  type QuestionResult,
} from "@repo/core/evaluation";
import type { QuestionKind } from "@repo/core/interview";
import { summarizeProctoring, type ProctoringEventLike } from "@repo/core/proctoring";
import type { InterviewQuestion, Prisma } from "@repo/database";
import { AiError, getAiClient, type AiClient } from "../ai/client";
import { UNTRUSTED_CONTENT_RULE, generateStructured, untrusted } from "../ai/structured";
import { getEnv } from "../env";
import { conflict } from "../errors";
import { db, logger } from "../infra";
import { loadRoomForActor, loadRoomForCandidate, type Actor } from "../interviews/access";
import { resolveProblem } from "../interviews/problems";
import { enqueueEvaluation, evaluationWorkerStatus } from "../queues";
import { RATE_LIMITS, enforceRateLimit } from "../rate-limit";
import { broadcast } from "../realtime";
import { finalizePendingForRoom } from "../submissions/service";

export type EvaluationSchedule = "queued" | "inline";
const STALE_RUNNING_MS = 10 * 60_000;

/** Prefers the background worker; falls back to running inline in the web process. */
export async function scheduleEvaluation(roomId: string): Promise<EvaluationSchedule> {
  const mode = getEnv().EVALUATION_MODE;
  const report = await db.interviewReport.findUnique({ where: { roomId }, select: { attempts: true } });
  if (mode !== "inline") {
    const worker = mode === "queue" ? { online: true } : await evaluationWorkerStatus();
    if (worker.online) {
      try {
        await enqueueEvaluation(roomId, (report?.attempts ?? 0) + 1);
        return "queued";
      } catch (err) {
        logger.warn("could not enqueue evaluation, running inline", { roomId, error: (err as Error).message });
      }
    }
  }
  return "inline";
}

export class RetryableEvaluationError extends Error {}

async function claim(roomId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);
  const claimed = await db.interviewReport.updateMany({
    where: { roomId, OR: [{ status: { in: ["PENDING", "FAILED"] } }, { status: "RUNNING", updatedAt: { lt: staleBefore } }] },
    data: { status: "RUNNING", attempts: { increment: 1 }, error: null },
  });
  if (claimed.count === 0) return false;
  await db.interviewRoom.update({ where: { id: roomId }, data: { evaluationStatus: "RUNNING" } });
  return true;
}

async function judgeEvidence(question: InterviewQuestion): Promise<JudgeEvidence | null> {
  const submissions = await db.submission.findMany({
    where: { questionId: question.id, kind: "SUBMIT", status: "COMPLETED" },
    orderBy: [{ passedCount: "desc" }, { createdAt: "desc" }],
    take: 1,
  });
  const best = submissions[0];
  if (!best) return null;
  return { passed: best.passedCount ?? 0, total: best.totalCount ?? 0, verdict: best.verdict, language: best.language };
}

async function questionMaterial(question: InterviewQuestion): Promise<{ prompt: string; corpus: string }> {
  const chat = await db.interviewEvent.findMany({
    where: { questionId: question.id, eventType: { in: ["AI_CHAT_MESSAGE", "FOLLOW_UP_ASKED"] } },
    orderBy: { timestamp: "asc" },
    take: 40,
  });
  const transcript = chat
    .map((e) => e.payload as { role?: string; content?: string; kind?: string })
    .filter((p) => p.kind !== "system" && p.content)
    .map((p) => `${p.role === "user" ? "Candidate" : "Interviewer"}: ${p.content}`)
    .join("\n");
  const candidateLines = chat
    .map((e) => e.payload as { role?: string; content?: string })
    .filter((p) => p.role === "user" && p.content)
    .map((p) => p.content!)
    .join("\n");

  const parts: string[] = [`Title: ${question.title}`, `Difficulty: ${question.difficulty}`];
  let corpus = candidateLines;
  if (question.kind === "CODING") {
    const problem = await resolveProblem(question);
    if (problem) parts.push(`Problem statement: ${problem.publicView.statement}`, `Constraints: ${problem.publicView.constraints.join("; ")}`);
    const best = await db.submission.findFirst({ where: { questionId: question.id, kind: "SUBMIT" }, orderBy: [{ passedCount: "desc" }, { createdAt: "desc" }] });
    const code = best?.code ?? question.draftCode ?? "";
    parts.push(code ? `Candidate's submitted code (${best?.language ?? question.draftLanguage}):\n${untrusted("code", code)}` : "The candidate submitted no code.");
    if (question.explanation) {
      const exp = JSON.stringify(question.explanation);
      parts.push(`Candidate's explanation:\n${untrusted("explanation", exp, 6000)}`);
      corpus += `\n${Object.values(question.explanation as Record<string, string>).join("\n")}`;
    } else parts.push("The candidate did not write an explanation.");
    corpus += `\n${code}`;
  } else {
    parts.push(`Question: ${question.prompt}`);
    parts.push(question.answer ? `Candidate's answer:\n${untrusted("answer", question.answer)}` : "The candidate did not answer this question.");
    corpus += `\n${question.answer ?? ""}`;
    const hints = (question.rubricHints ?? {}) as { keyPoints?: { point: string }[] };
    if (hints.keyPoints?.length) parts.push(`Reference key points a strong answer might cover (not required verbatim): ${hints.keyPoints.map((k) => k.point).join("; ")}`);
  }
  if (transcript) parts.push(`Discussion transcript:\n${untrusted("transcript", transcript, 8000)}`);
  return { prompt: parts.join("\n\n"), corpus };
}

function hasCandidateInput(question: InterviewQuestion, judge: JudgeEvidence | null, corpus: string): boolean {
  return Boolean(judge) || corpus.trim().length > 0 || Boolean(question.answer) || Boolean(question.draftCode);
}

async function evaluateQuestion(client: AiClient | null, question: InterviewQuestion): Promise<{ result: QuestionResult; aiError: AiError | null; model: string | null }> {
  const kind = question.kind as QuestionKind;
  const judge = kind === "CODING" ? await judgeEvidence(question) : null;
  const { prompt, corpus } = await questionMaterial(question);
  const base = { questionId: question.id, kind, title: question.title, judge, corpus };

  if (!hasCandidateInput(question, judge, corpus)) {
    return { result: buildQuestionResult({ ...base, ai: null, aiUnavailableReason: "No answer was given for this question." }), aiError: null, model: null };
  }
  if (!client) {
    return { result: buildQuestionResult({ ...base, ai: null, aiUnavailableReason: "AI evaluation is not configured; only judge-based scores are available." }), aiError: new AiError("NOT_CONFIGURED", "AI evaluation is not configured."), model: null };
  }
  const aiDims = RUBRICS[kind].filter((d) => d.source === "ai");
  try {
    const res = await generateStructured(client, {
      task: "evaluate-question",
      system: `You are a calibrated, fair interview evaluator. Score each rubric dimension from 0 to 10 using only evidence in the candidate's material. Quote evidence verbatim from the candidate's own words or code (short excerpts). If there is no evidence for a dimension, give a low score and say so; never invent statements, accomplishments or test results. ${kind === "CODING" ? "Correctness is measured separately by the code judge; do not score it." : ""}
${UNTRUSTED_CONTENT_RULE}`,
      prompt: `QUESTION_ID: ${question.id}\nAI_DIMENSIONS: ${aiDims.map((d) => d.key).join(",")}\n\nRubric:\n${aiDims.map((d) => `- ${d.key} (${d.label}): ${d.guidance}`).join("\n")}\n\n${prompt}`,
      schema: aiQuestionEvaluationSchema,
      shapeHint: `{"questionId": "${question.id}", "dimensions": [{"key": one of ${aiDims.map((d) => `"${d.key}"`).join(" | ")}, "score": number 0-10, "rationale": string, "evidence": string[] (verbatim quotes)}], "summary": string, "strengths": string[], "improvements": string[]}`,
      maxOutputTokens: 2048,
      temperature: 0.2,
    });
    return { result: buildQuestionResult({ ...base, ai: res.data }), aiError: null, model: res.model };
  } catch (err) {
    const aiError = err instanceof AiError ? err : new AiError("UNKNOWN", (err as Error).message);
    return { result: buildQuestionResult({ ...base, ai: null, aiUnavailableReason: `AI evaluation failed for this question (${aiError.code}).` }), aiError, model: null };
  }
}

async function integritySummary(roomId: string, proctoringEnabled: boolean) {
  const events = await db.proctoringEvent.findMany({ where: { roomId }, orderBy: { startedAt: "asc" } });
  return summarizeProctoring(events as unknown as ProctoringEventLike[], proctoringEnabled);
}

export interface RunOptions {
  /** In the worker, transient AI failures are retried by BullMQ instead of finalising a partial report. */
  finalAttempt: boolean;
}

export async function runEvaluation(roomId: string, options: RunOptions = { finalAttempt: true }): Promise<"completed" | "partial" | "skipped"> {
  if (!(await claim(roomId))) return "skipped";
  const log = logger.child({ roomId, rubricVersion: RUBRIC_VERSION });
  const started = Date.now();
  try {
    await finalizePendingForRoom(roomId);
    const room = await db.interviewRoom.findUniqueOrThrow({ where: { id: roomId } });
    const questions = await db.interviewQuestion.findMany({ where: { roomId }, orderBy: { position: "asc" } });
    const client = getAiClient();

    const results: QuestionResult[] = [];
    const errors: AiError[] = [];
    const models = new Set<string>();
    for (const q of questions) {
      const r = await evaluateQuestion(client, q);
      results.push(r.result);
      if (r.aiError) errors.push(r.aiError);
      if (r.model) models.add(r.model);
    }

    const transient = errors.filter((e) => e.retryable);
    if (transient.length > 0 && !options.finalAttempt) {
      await db.interviewReport.update({ where: { roomId }, data: { status: "PENDING", error: "AI provider temporarily unavailable; retrying." } });
      await db.interviewRoom.update({ where: { id: roomId }, data: { evaluationStatus: "PENDING" } });
      throw new RetryableEvaluationError(transient[0]!.message);
    }

    let overall = { summary: "", strengths: [] as string[], improvements: [] as string[] };
    const answered = results.filter((r) => r.summary);
    if (client && errors.length === 0 && answered.length > 0) {
      try {
        const res = await generateStructured(client, {
          task: "evaluate-overall",
          system: `Summarise an interview evaluation for the candidate in a constructive, neutral tone. Base it only on the per-question findings provided; do not add new claims. ${UNTRUSTED_CONTENT_RULE}`,
          prompt: untrusted("findings", JSON.stringify(results.map((r) => ({ title: r.title, kind: r.kind, score: r.score, summary: r.summary, strengths: r.strengths, improvements: r.improvements }))), 10_000),
          schema: aiOverallSchema,
          shapeHint: `{"summary": string, "strengths": string[], "improvements": string[]}`,
          maxOutputTokens: 1024,
          temperature: 0.3,
        });
        overall = res.data;
        models.add(res.model);
      } catch (err) {
        log.warn("overall summary failed", { error: (err as Error).message });
      }
    }
    if (!overall.summary) {
      overall = {
        summary: answered.length ? answered.map((r) => `${r.title}: ${r.summary}`).join(" ") : "No AI summary is available for this interview.",
        strengths: [...new Set(results.flatMap((r) => r.strengths))].slice(0, 5),
        improvements: [...new Set(results.flatMap((r) => r.improvements))].slice(0, 5),
      };
    }

    const scores = aggregateScores(results);
    const judgeSummary = results.filter((r) => r.kind === "CODING").map((r) => ({ questionId: r.questionId, title: r.title, ...(r.judge ?? { passed: 0, total: 0, verdict: null, language: null }) }));
    const partial = errors.length > 0;
    const errorText = partial ? `${errors[0]!.message} Scores shown are based on judge results and the dimensions that could be assessed.` : null;

    await db.interviewReport.update({
      where: { roomId },
      data: {
        status: partial ? "FAILED" : "COMPLETED",
        overallScore: scores.overallScore,
        techScore: scores.techScore,
        commScore: scores.commScore,
        strengths: overall.strengths,
        weaknesses: overall.improvements,
        aiFeedback: `${overall.summary}\n\n${AUTOMATED_FEEDBACK_NOTICE}`,
        rubricVersion: RUBRIC_VERSION,
        model: models.size ? [...models].join(", ") : client ? client.id : "none",
        dimensionScores: results as unknown as Prisma.InputJsonValue,
        questionFeedback: results.map((r) => ({ questionId: r.questionId, title: r.title, kind: r.kind, score: r.score, summary: r.summary, strengths: r.strengths, improvements: r.improvements })) as unknown as Prisma.InputJsonValue,
        judgeSummary: judgeSummary as unknown as Prisma.InputJsonValue,
        integritySummary: (await integritySummary(roomId, room.proctoringEnabled)) as unknown as Prisma.InputJsonValue,
        error: errorText,
        completedAt: new Date(),
      },
    });
    const status = partial ? "FAILED" : "COMPLETED";
    const fresh = await db.interviewRoom.update({ where: { id: roomId }, data: { evaluationStatus: status } });
    await broadcast(roomId, { type: "evaluation", version: fresh.version, status });
    log.info("evaluation finished", { status, durationMs: Date.now() - started, questions: results.length, overallScore: scores.overallScore });
    return partial ? "partial" : "completed";
  } catch (err) {
    if (err instanceof RetryableEvaluationError) throw err;
    log.error("evaluation crashed", { error: (err as Error).message });
    await db.interviewReport.update({ where: { roomId }, data: { status: "FAILED", error: "The evaluation failed unexpectedly. You can retry it." } }).catch(() => undefined);
    await db.interviewRoom.update({ where: { id: roomId }, data: { evaluationStatus: "FAILED" } }).catch(() => undefined);
    throw err;
  }
}

/** Candidate-triggered retry of a failed (or stuck) evaluation. */
export async function retryEvaluation(roomId: string, actor: Actor): Promise<EvaluationSchedule> {
  const { room } = await loadRoomForCandidate(roomId, actor);
  if (room.status !== "COMPLETED") throw conflict("The interview has not finished yet.");
  await enforceRateLimit(RATE_LIMITS.evaluationRetry, actor.userId);
  const report = await db.interviewReport.upsert({
    where: { roomId },
    create: { roomId, status: "PENDING", strengths: [], weaknesses: [] },
    update: {},
  });
  const stuck = report.status === "RUNNING" && Date.now() - report.updatedAt.getTime() > STALE_RUNNING_MS;
  if (report.status === "COMPLETED") throw conflict("This interview has already been evaluated.");
  if (report.status === "RUNNING" && !stuck) throw conflict("The evaluation is already running.");
  if (report.status !== "PENDING") {
    await db.interviewReport.update({ where: { roomId }, data: { status: "PENDING" } });
    await db.interviewRoom.update({ where: { id: roomId }, data: { evaluationStatus: "PENDING" } });
  }
  return scheduleEvaluation(roomId);
}

export async function getReport(roomId: string, actor: Actor) {
  const access = await loadRoomForActor(roomId, actor);
  const [report, questions, submissions, events] = await Promise.all([
    db.interviewReport.findUnique({ where: { roomId } }),
    db.interviewQuestion.findMany({ where: { roomId }, orderBy: { position: "asc" } }),
    db.submission.findMany({ where: { roomId, kind: "SUBMIT" }, orderBy: { createdAt: "asc" }, select: { id: true, questionId: true, language: true, verdict: true, passedCount: true, totalCount: true, status: true, createdAt: true } }),
    db.proctoringEvent.findMany({ where: { roomId }, orderBy: { startedAt: "asc" } }),
  ]);
  return { access, room: access.room, report, questions, submissions, proctoringEvents: events };
}
