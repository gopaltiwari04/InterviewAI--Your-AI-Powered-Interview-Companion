import { randomUUID } from "node:crypto";
import { db } from "@repo/database";
import { getJudgeTests } from "@repo/problem-bank";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AppError,
  acceptInvite,
  createInvite,
  reviewProctoringEvent,
  reviewResume,
  uploadResume,
  advanceQuestion,
  completeInterview,
  createInterview,
  createSubmission,
  generateFollowUp,
  getInterview,
  getProctoringReport,
  getReport,
  getSubmission,
  ingestProctoringEvents,
  listChat,
  retryEvaluation,
  runEvaluation,
  saveDraft,
  sendChatMessage,
  startInterview,
  submitAnswer,
} from "../../src/index";
import { resetAiClient } from "../../src/ai/client";
import { resetEnvCache } from "../../src/env";
import { createUser, resetDatabase, startFakeExecutor, waitFor } from "./helpers";

let executor: Awaited<ReturnType<typeof startFakeExecutor>>;
let alice: { userId: string; name: string };
let mallory: { userId: string; name: string };

beforeAll(async () => {
  await resetDatabase();
  executor = await startFakeExecutor();
  const a = await createUser("Alice");
  const m = await createUser("Mallory");
  alice = { userId: a.id, name: "Alice" };
  mallory = { userId: m.id, name: "Mallory" };
});

afterAll(async () => {
  await executor.stop();
  await db.$disconnect();
});

const setup = { mode: "DSA", language: "python", difficulty: "EASY", durationMinutes: 30, topics: ["hashing"], adaptive: true, proctoring: true };

async function expectAppError(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toBeInstanceOf(AppError);
  await expect(p).rejects.toMatchObject({ status });
}

describe("DSA interview end to end", () => {
  let roomId: string;
  let questionId: string;

  it("creates an interview in the CREATED state", async () => {
    ({ id: roomId } = await createInterview(alice, setup));
    const state = await getInterview(roomId, alice);
    expect(state.status).toBe("CREATED");
    expect(state.questions).toHaveLength(0);
    expect(state.questionCount).toBe(1);
  });

  it("starts with a real coding problem and no hidden data in the client view", async () => {
    const state = await startInterview(roomId, alice, { proctoring: true });
    expect(state.status).toBe("IN_PROGRESS");
    expect(state.endsAt).not.toBeNull();
    const q = state.questions[0]!;
    questionId = q.id;
    expect(q.kind).toBe("CODING");
    expect(q.difficulty).toBe("EASY");
    expect(q.problem).not.toBeNull();
    expect(q.problem!.statement.length).toBeGreaterThan(40);
    expect(q.problem!.examples.length).toBeGreaterThan(0);
    expect(q.problem!.constraints.length).toBeGreaterThan(0);
    expect(q.problem!.starterCode.python).toContain(q.problem!.signature.functionName);
    expect(q.problem!.topics).toContain("hashing");
    const json = JSON.stringify(state);
    for (const hidden of getJudgeTests(q.problem!.slug, "SUBMIT").filter((t) => !t.visible)) {
      if (hidden.input.length > 30) expect(json).not.toContain(hidden.input);
    }
    expect(json).not.toContain("rubricHints");
    expect(json).not.toContain("reference");
  });

  it("is idempotent when started twice", async () => {
    const again = await startInterview(roomId, alice, { proctoring: true });
    expect(again.questions).toHaveLength(1);
  });

  it("autosaves drafts for reconnection", async () => {
    await saveDraft(roomId, questionId, alice, { code: "def x(): pass", language: "python" });
    const state = await getInterview(roomId, alice);
    expect(state.questions[0]!.draftCode).toBe("def x(): pass");
  });

  it("runs visible tests and returns their output", async () => {
    const run = await createSubmission(roomId, alice, { questionId, kind: "RUN", language: "python", code: "wrong", idempotencyKey: randomUUID() });
    expect(run.status).toBe("QUEUED");
    const done = await waitFor(() => getSubmission(roomId, run.id, alice), (s) => s.status === "COMPLETED");
    expect(done.verdict).toBe("ACCEPTED");
    expect(done.tests.every((t) => t.visible && t.input && t.expected !== undefined)).toBe(true);
  });

  it("submits for hidden tests without exposing them", async () => {
    const sub = await createSubmission(roomId, alice, { questionId, kind: "SUBMIT", language: "python", code: "wrong", idempotencyKey: randomUUID() });
    const done = await waitFor(() => getSubmission(roomId, sub.id, alice), (s) => s.status === "COMPLETED");
    expect(done.verdict).toBe("WRONG_ANSWER");
    expect(done.passedCount).toBeLessThan(done.totalCount!);
    for (const t of done.tests.filter((x) => !x.visible)) {
      expect(t.input).toBeUndefined();
      expect(t.expected).toBeUndefined();
      expect(t.stdout).toBeUndefined();
    }
    const hiddenJobTests = executor.seen.find((j) => j.submissionId === sub.id)!.tests.filter((t) => !t.visible);
    expect(hiddenJobTests.length).toBeGreaterThan(0);
  });

  it("deduplicates retried submissions with the same idempotency key", async () => {
    const key = randomUUID();
    const first = await createSubmission(roomId, alice, { questionId, kind: "SUBMIT", language: "python", code: "# CORRECT", idempotencyKey: key });
    const second = await createSubmission(roomId, alice, { questionId, kind: "SUBMIT", language: "python", code: "# CORRECT", idempotencyKey: key });
    expect(second.id).toBe(first.id);
    expect(await db.submission.count({ where: { idempotencyKey: key } })).toBe(1);
    const done = await waitFor(() => getSubmission(roomId, first.id, alice), (s) => s.status === "COMPLETED");
    expect(done.verdict).toBe("ACCEPTED");
  });

  it("rejects invalid and oversized submissions", async () => {
    await expectAppError(createSubmission(roomId, alice, { questionId, kind: "SUBMIT", language: "ruby", code: "x", idempotencyKey: randomUUID() }), 400);
    await expectAppError(createSubmission(roomId, alice, { questionId, kind: "SUBMIT", language: "python", code: "x".repeat(70_000), idempotencyKey: randomUUID() }), 413);
    await expectAppError(createSubmission(roomId, alice, { questionId, kind: "SUBMIT", language: "python", code: "", idempotencyKey: randomUUID() }), 400);
    await expectAppError(createSubmission(roomId, alice, { questionId, kind: "VALIDATE", language: "python", code: "x", idempotencyKey: randomUUID() }), 400);
  });

  it("asks a follow-up grounded in the judge result, only once per submission", async () => {
    const accepted = await db.submission.findFirstOrThrow({ where: { questionId, verdict: "ACCEPTED", kind: "SUBMIT" } });
    const first = await generateFollowUp(roomId, alice, { questionId, trigger: "submission", submissionId: accepted.id });
    const second = await generateFollowUp(roomId, alice, { questionId, trigger: "submission", submissionId: accepted.id });
    expect(first?.kind).toBe("follow-up");
    expect(second?.id).toBe(first?.id);
    const reply = await sendChatMessage(roomId, alice, { questionId, message: "I used a hash map so lookups are O(1) and the whole thing is O(n)." });
    expect(reply.messages).toHaveLength(2);
    const chat = await listChat(roomId, alice);
    expect(chat.some((m) => m.kind === "system")).toBe(true);
  });

  it("records the explanation and completes the interview", async () => {
    await submitAnswer(roomId, questionId, alice, {
      explanation: { approach: "I used a hash map to store complements", timeComplexity: "O(n)", spaceComplexity: "O(n)", edgeCases: "duplicates, negatives" },
    });
    const finished = await advanceQuestion(roomId, alice, { expectedQuestionId: questionId });
    expect(finished.status).toBe("COMPLETED");
    expect(finished.evaluation).toBe("inline");
    // A repeated click must not change anything.
    const again = await advanceQuestion(roomId, alice, { expectedQuestionId: questionId });
    expect(again.status).toBe("COMPLETED");
  });

  it("evaluates using judge results for correctness", async () => {
    expect(await runEvaluation(roomId)).toBe("completed");
    expect(await runEvaluation(roomId)).toBe("skipped");
    const { report } = await getReport(roomId, alice);
    expect(report!.status).toBe("COMPLETED");
    expect(report!.rubricVersion).toMatch(/^rubric-/);
    expect(report!.model).toContain("mock");
    const results = report!.dimensionScores as unknown as { dimensions: { key: string; score: number; source: string; evidence: string[] }[] }[];
    const correctness = results[0]!.dimensions.find((d) => d.key === "correctness")!;
    expect(correctness.source).toBe("judge");
    expect(correctness.score).toBe(10);
    expect(report!.overallScore).toBeGreaterThan(0);
    expect(report!.aiFeedback).toMatch(/automated feedback/i);
  });
});

describe("authorization", () => {
  let roomId: string;
  let questionId: string;
  beforeAll(async () => {
    ({ id: roomId } = await createInterview(alice, { ...setup, proctoring: false }));
    const s = await startInterview(roomId, alice, { proctoring: false });
    questionId = s.questions[0]!.id;
  });

  it("hides other candidates' interviews", async () => {
    await expectAppError(getInterview(roomId, mallory), 404);
    await expectAppError(getReport(roomId, mallory), 404);
    await expectAppError(getProctoringReport(roomId, mallory), 404);
    await expectAppError(listChat(roomId, mallory), 404);
    await expectAppError(getInterview("does-not-exist", alice), 404);
  });

  it("blocks writes to another candidate's interview", async () => {
    await expectAppError(createSubmission(roomId, mallory, { questionId, kind: "SUBMIT", language: "python", code: "x", idempotencyKey: randomUUID() }), 404);
    await expectAppError(saveDraft(roomId, questionId, mallory, { code: "x", language: "python" }), 404);
    await expectAppError(completeInterview(roomId, mallory), 404);
    await expectAppError(
      ingestProctoringEvents(roomId, mallory, { events: [{ clientEventId: randomUUID(), type: "TAB_HIDDEN", startedAt: new Date().toISOString() }] }),
      404,
    );
  });

  it("does not let one user read another's submission through their own room", async () => {
    const sub = await createSubmission(roomId, alice, { questionId, kind: "RUN", language: "python", code: "x", idempotencyKey: randomUUID() });
    const { id: malloryRoom } = await createInterview(mallory, setup);
    await expectAppError(getSubmission(malloryRoom, sub.id, mallory), 404);
  });
});

describe("proctoring ingestion", () => {
  let roomId: string;
  beforeAll(async () => {
    ({ id: roomId } = await createInterview(alice, setup));
    await startInterview(roomId, alice, { proctoring: true });
    // Pretend the interview started five minutes ago so past timestamps fall inside its window.
    await db.interviewRoom.update({ where: { id: roomId }, data: { startedAt: new Date(Date.now() - 5 * 60_000) } });
  });

  it("stores events with server-computed severity and deduplicates", async () => {
    const hiddenId = randomUUID();
    const start = new Date(Date.now() - 30_000);
    const res = await ingestProctoringEvents(roomId, alice, {
      events: [
        { clientEventId: hiddenId, type: "TAB_HIDDEN", startedAt: start.toISOString(), severity: "INFO" },
        { clientEventId: randomUUID(), type: "TAB_RETURNED", startedAt: new Date(start.getTime() + 20_000).toISOString(), closesEventId: hiddenId },
        { clientEventId: randomUUID(), type: "FACE_NOT_DETECTED", startedAt: start.toISOString(), endedAt: new Date(start.getTime() + 45_000).toISOString(), metadata: { faceCount: 0 } },
      ],
    });
    expect(res.accepted).toBe(3);
    const hidden = await db.proctoringEvent.findFirstOrThrow({ where: { roomId, clientEventId: hiddenId } });
    expect(hidden.durationMs).toBe(20_000);
    expect(hidden.severity).toBe("MEDIUM");
    const dup = await ingestProctoringEvents(roomId, alice, { events: [{ clientEventId: hiddenId, type: "TAB_HIDDEN", startedAt: start.toISOString() }] });
    expect(dup.duplicates).toBe(1);
  });

  it("rejects backdated, future and malformed events", async () => {
    const res = await ingestProctoringEvents(roomId, alice, {
      events: [
        { clientEventId: randomUUID(), type: "TAB_HIDDEN", startedAt: "2020-01-01T00:00:00.000Z" },
        { clientEventId: randomUUID(), type: "TAB_HIDDEN", startedAt: new Date(Date.now() + 3_600_000).toISOString() },
      ],
    });
    expect(res.accepted).toBe(0);
    expect(res.rejected).toHaveLength(2);
    await expectAppError(ingestProctoringEvents(roomId, alice, { events: [{ clientEventId: "not-a-uuid", type: "TAB_HIDDEN", startedAt: new Date().toISOString() }] }), 400);
    await expectAppError(ingestProctoringEvents(roomId, alice, { events: [{ clientEventId: randomUUID(), type: "SCREEN_RECORDING", startedAt: new Date().toISOString() }] }), 400);
    await expectAppError(
      ingestProctoringEvents(roomId, alice, { events: [{ clientEventId: randomUUID(), type: "TAB_HIDDEN", startedAt: new Date().toISOString(), metadata: { evil: "x" } }] }),
      400,
    );
  });

  it("rejects camera events when proctoring is off", async () => {
    const { id } = await createInterview(alice, { ...setup, proctoring: false });
    await startInterview(id, alice, { proctoring: false });
    const res = await ingestProctoringEvents(id, alice, { events: [{ clientEventId: randomUUID(), type: "FACE_NOT_DETECTED", startedAt: new Date().toISOString() }] });
    expect(res.rejected[0]?.reason).toMatch(/not enabled/);
  });

  it("summarises the timeline neutrally", async () => {
    const report = await getProctoringReport(roomId, alice);
    expect(report.summary.tabSwitches).toBe(1);
    expect(report.summary.faceAbsences).toBe(1);
    expect(report.disclaimer).toMatch(/not evidence of misconduct/);
  });
});

describe("adaptive difficulty", () => {
  it("moves to a harder problem after every hidden test passes", async () => {
    const { id } = await createInterview(alice, { ...setup, durationMinutes: 45, proctoring: false });
    const state = await startInterview(id, alice, { proctoring: false });
    const first = state.questions[0]!;
    const sub = await createSubmission(id, alice, { questionId: first.id, kind: "SUBMIT", language: "python", code: "# CORRECT", idempotencyKey: randomUUID() });
    await waitFor(() => getSubmission(id, sub.id, alice), (s) => s.status === "COMPLETED");
    const next = await advanceQuestion(id, alice, { expectedQuestionId: first.id });
    const second = next.questions[1]!;
    expect(second.kind).toBe("CODING");
    expect(second.difficulty).toBe("MEDIUM");
    expect(second.selectionReason).toMatch(/every hidden test/);
    expect(second.problem!.slug).not.toBe(first.problem!.slug);
  });

  it("moves to an easier problem after a skip", async () => {
    const { id } = await createInterview(alice, { ...setup, difficulty: "HARD", durationMinutes: 45, proctoring: false });
    const state = await startInterview(id, alice, { proctoring: false });
    const next = await advanceQuestion(id, alice, { expectedQuestionId: state.questions[0]!.id, skip: true });
    expect(next.questions[0]!.status).toBe("SKIPPED");
    expect(next.questions[1]!.difficulty).toBe("MEDIUM");
    expect(next.questions[1]!.selectionReason).toMatch(/skipped/);
  });
});

describe("evaluation fallback and retry", () => {
  it("stores a partial judge-based report when AI is unavailable, then retries safely", async () => {
    const { id } = await createInterview(alice, { ...setup, mode: "MIXED", durationMinutes: 30, proctoring: false });
    let state = await startInterview(id, alice, { proctoring: false });
    const coding = state.questions[0]!;
    const sub = await createSubmission(id, alice, { questionId: coding.id, kind: "SUBMIT", language: "python", code: "# CORRECT", idempotencyKey: randomUUID() });
    await waitFor(() => getSubmission(id, sub.id, alice), (s) => s.status === "COMPLETED");
    state = await advanceQuestion(id, alice, { expectedQuestionId: coding.id });
    const technical = state.questions[1]!;
    expect(technical.kind).toBe("TECHNICAL");
    // Adaptivity is per question kind: the first technical question starts at the selected level.
    expect(technical.selectionReason).toMatch(/Starting at the easy level/);
    await submitAnswer(id, technical.id, alice, { answer: "A hash table maps keys to buckets with a hash function and handles collisions by chaining." });
    await completeInterview(id, alice);

    process.env.AI_PROVIDER = "gemini";
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    resetEnvCache();
    resetAiClient();
    expect(await runEvaluation(id)).toBe("partial");
    let { report } = await getReport(id, alice);
    expect(report!.status).toBe("FAILED");
    expect(report!.overallScore).not.toBeNull();
    expect(report!.error).toMatch(/not configured/);

    process.env.AI_PROVIDER = "mock";
    resetEnvCache();
    resetAiClient();
    expect(await retryEvaluation(id, alice)).toBe("inline");
    expect(await runEvaluation(id)).toBe("completed");
    ({ report } = await getReport(id, alice));
    expect(report!.status).toBe("COMPLETED");
    expect(report!.attempts).toBe(2);
  });
});

describe("interviewer invites", () => {
  it("lets an invited interviewer watch and review signals but not act as the candidate", async () => {
    const { id } = await createInterview(alice, { ...setup, proctoring: false });
    const state = await startInterview(id, alice, { proctoring: false });
    const questionId = state.questions[0]!.id;
    await expectAppError(createInvite(id, mallory), 404);
    const { token } = await createInvite(id, alice);
    const bob = { userId: (await createUser("Bob")).id, name: "Bob" };
    await expectAppError(acceptInvite("x".repeat(30), bob), 404);
    expect((await acceptInvite(token, bob)).roomId).toBe(id);

    const view = await getInterview(id, bob);
    expect(view.viewerRole).toBe("INTERVIEWER");
    expect(view.isCandidate).toBe(false);
    expect(view.questions[0]!.draftCode).toBeNull();
    await expectAppError(createSubmission(id, bob, { questionId, kind: "RUN", language: "python", code: "x", idempotencyKey: randomUUID() }), 403);
    await expectAppError(completeInterview(id, bob), 403);

    await ingestProctoringEvents(id, alice, { events: [{ clientEventId: randomUUID(), type: "TAB_HIDDEN", startedAt: new Date().toISOString() }] });
    const event = await db.proctoringEvent.findFirstOrThrow({ where: { roomId: id } });
    await expectAppError(reviewProctoringEvent(id, event.id, alice, "DISMISSED"), 409);
    await reviewProctoringEvent(id, event.id, bob, "ACKNOWLEDGED");
    expect((await db.proctoringEvent.findUniqueOrThrow({ where: { id: event.id } })).reviewStatus).toBe("ACKNOWLEDGED");
  });
});

describe("AI-generated problems", () => {
  it("falls back to a verified bank problem when validation fails, and says why", async () => {
    // The fake executor prints placeholder output for validation jobs, so the mock problem's
    // examples do not reproduce and the problem must be rejected.
    const { id } = await createInterview(alice, { ...setup, useAiQuestions: true, proctoring: false });
    const state = await startInterview(id, alice, { proctoring: false });
    const q = state.questions[0]!;
    expect(q.source).toBe("AI_FALLBACK_BANK");
    expect(q.selectionReason).toMatch(/failed validation/);
    expect(q.problem?.source).toBe("BANK");
    const rejected = await db.generatedProblem.findFirstOrThrow({ where: { status: "REJECTED" }, orderBy: { createdAt: "desc" } });
    expect(rejected.validationLog).toMatch(/example 1/);
  });
});

describe("resume-based interviews", () => {
  it("extracts, requires review, and grounds a question in the confirmed profile", async () => {
    const text = "Jane Doe. Software engineer. Built a realtime chat app with React, Node.js, Redis and PostgreSQL. Deployed with Docker on AWS.";
    await expectAppError(uploadResume(alice, { name: "cv.exe", bytes: new TextEncoder().encode(text) }), 400);
    await expectAppError(uploadResume(alice, { name: "cv.txt", bytes: new Uint8Array(3 * 1024 * 1024) }), 413);
    const profile = await uploadResume(alice, { name: "cv.txt", bytes: new TextEncoder().encode(text) });
    expect(profile.status).toBe("READY");
    expect(profile.skills).toEqual(expect.arrayContaining(["react", "redis"]));
    // Not usable before the candidate confirms it.
    await expectAppError(createInterview(alice, { ...setup, mode: "TECHNICAL", resumeProfileId: profile.id }), 400);
    await expectAppError(reviewResume(mallory, profile.id, { summary: "", skills: [], projects: [], experience: [] }), 404);
    await reviewResume(alice, profile.id, { summary: "Engineer", skills: ["React", "Redis"], projects: [{ name: "Chat app", description: "Realtime chat", technologies: ["Redis"] }], experience: [] });
    const { id } = await createInterview(alice, { ...setup, mode: "TECHNICAL", resumeProfileId: profile.id });
    const state = await startInterview(id, alice, { proctoring: false });
    expect(state.questions[0]!.source).toBe("RESUME");
    expect(state.questions[0]!.selectionReason).toMatch(/not verified/);
    expect(JSON.stringify(state)).not.toContain("keyPoints");
  });
});
