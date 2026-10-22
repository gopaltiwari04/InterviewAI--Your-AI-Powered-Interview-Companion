import { describe, expect, it } from "vitest";
import {
  AUTOMATED_FEEDBACK_NOTICE,
  aggregateScores,
  aiQuestionEvaluationSchema,
  buildQuestionResult,
  correctnessFromJudge,
  verifyEvidence,
  weightedScore,
} from "../src/evaluation";
import {
  InvalidTransitionError,
  assertTransition,
  canTransition,
  chooseTopic,
  computeDeadline,
  decideNextDifficulty,
  interviewSetupSchema,
  isPastDeadline,
  keyPointCoverage,
  questionPlan,
  type PreviousOutcome,
} from "../src/interview";
import { computeSeverity, summarizeProctoring, validateEventTimes } from "../src/proctoring";
import { RealtimeTokenError, signRealtimeToken, verifyRealtimeToken } from "../src/realtime";
import { createLogger, sanitize } from "../src/observability";
import { describeRedis, redisOptionsFromUrl } from "../src/redis";

describe("interview lifecycle", () => {
  it("allows only forward transitions", () => {
    expect(canTransition("CREATED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
    expect(canTransition("COMPLETED", "IN_PROGRESS")).toBe(false);
    expect(canTransition("CREATED", "COMPLETED")).toBe(false);
    expect(canTransition("CANCELLED", "IN_PROGRESS")).toBe(false);
    expect(() => assertTransition("COMPLETED", "CANCELLED")).toThrow(InvalidTransitionError);
  });

  it("computes deadlines with a grace period", () => {
    const start = new Date("2026-01-01T10:00:00Z");
    const end = computeDeadline(start, 45);
    expect(end.toISOString()).toBe("2026-01-01T10:45:00.000Z");
    expect(isPastDeadline(end, new Date("2026-01-01T10:45:20Z"))).toBe(false);
    expect(isPastDeadline(end, new Date("2026-01-01T10:46:00Z"))).toBe(true);
    expect(isPastDeadline(null)).toBe(false);
  });

  it("plans questions for every mode", () => {
    expect(questionPlan("DSA", 30)).toEqual(["CODING"]);
    expect(questionPlan("DSA", 45)).toEqual(["CODING", "CODING"]);
    expect(questionPlan("MIXED", 45)).toEqual(["CODING", "TECHNICAL", "BEHAVIORAL"]);
    expect(questionPlan("TECHNICAL", 30).every((k) => k === "TECHNICAL")).toBe(true);
    expect(questionPlan("BEHAVIORAL", 60)).toHaveLength(5);
  });

  it("validates interview setup input", () => {
    expect(interviewSetupSchema.safeParse({ mode: "DSA", language: "python", difficulty: "EASY", durationMinutes: 45 }).success).toBe(true);
    expect(interviewSetupSchema.safeParse({ mode: "DSA", language: "ruby", difficulty: "EASY", durationMinutes: 45 }).success).toBe(false);
    expect(interviewSetupSchema.safeParse({ mode: "DSA", language: "python", difficulty: "EASY", durationMinutes: 600 }).success).toBe(false);
    expect(interviewSetupSchema.safeParse({ mode: "DSA", language: "python", difficulty: "EASY", durationMinutes: 45, topics: ["not-a-topic"] }).success).toBe(false);
  });
});

describe("adaptive difficulty policy", () => {
  const coding = (passRatio: number | null, difficulty: "EASY" | "MEDIUM" | "HARD" = "MEDIUM"): PreviousOutcome => ({
    kind: "CODING",
    difficulty,
    title: "Two Sum",
    topic: "hashing",
    skipped: false,
    passRatio,
    coverage: null,
  });

  it("starts at the selected level", () => {
    expect(decideNextDifficulty("EASY", null).difficulty).toBe("EASY");
  });

  it("steps up after passing every hidden test and explains why", () => {
    const d = decideNextDifficulty("MEDIUM", coding(1));
    expect(d.difficulty).toBe("HARD");
    expect(d.reason).toMatch(/every hidden test/);
  });

  it("steps down after a weak result and revisits the topic", () => {
    const d = decideNextDifficulty("MEDIUM", coding(0.2));
    expect(d.difficulty).toBe("EASY");
    expect(d.revisitTopic).toBe("hashing");
    expect(d.reason).toMatch(/20%/);
  });

  it("stays put on a middling result and never leaves the scale", () => {
    expect(decideNextDifficulty("MEDIUM", coding(0.7)).difficulty).toBe("MEDIUM");
    expect(decideNextDifficulty("HARD", coding(1, "HARD")).difficulty).toBe("HARD");
    expect(decideNextDifficulty("EASY", coding(0, "EASY")).difficulty).toBe("EASY");
    expect(decideNextDifficulty("MEDIUM", coding(null)).difficulty).toBe("MEDIUM");
  });

  it("uses key-point coverage for written answers", () => {
    const kp = [{ keywords: ["hash"] }, { keywords: ["collision", "chaining"] }, { keywords: ["load factor"] }];
    expect(keyPointCoverage("We hash keys into buckets and resolve collisions with chaining.", kp)).toBeCloseTo(2 / 3);
    expect(keyPointCoverage("", kp)).toBe(0);
    const d = decideNextDifficulty("EASY", { kind: "TECHNICAL", difficulty: "EASY", title: "Q", topic: "databases", skipped: false, passRatio: null, coverage: 0.9 });
    expect(d.difficulty).toBe("MEDIUM");
  });

  it("rotates topics and revisits weak ones", () => {
    expect(chooseTopic(["a", "b"], ["a"], null, ["a", "b", "c"])).toEqual(["b"]);
    expect(chooseTopic(["a", "b"], ["a", "b"], null, ["a", "b", "c"])).toEqual(["a", "b"]);
    expect(chooseTopic(["a"], [], "c", ["a", "b", "c"])).toEqual(["c"]);
    expect(chooseTopic([], [], "zzz", ["a"])).toEqual([]);
  });
});

describe("evaluation scoring", () => {
  it("derives correctness from the judge only", () => {
    expect(correctnessFromJudge(null).score).toBe(0);
    expect(correctnessFromJudge({ passed: 9, total: 12, verdict: "WRONG_ANSWER", language: "python" }).score).toBe(7.5);
    expect(correctnessFromJudge({ passed: 0, total: 12, verdict: "COMPILATION_ERROR", language: "cpp" }).rationale).toMatch(/compile/);
  });

  it("removes evidence quotes that the candidate never wrote", () => {
    const corpus = "I used a hash map to store the complement. Time is O(n).";
    const { kept, removed } = verifyEvidence(["used a HASH map", "I proved it with induction", "time is o(n)"], corpus);
    expect(kept).toEqual(["used a HASH map", "time is o(n)"]);
    expect(removed).toBe(1);
  });

  it("computes weighted scores in code, ignoring unassessed dimensions", () => {
    expect(weightedScore([{ score: 10, weight: 1 }, { score: 0, weight: 1 }])).toBe(50);
    expect(weightedScore([{ score: 8, weight: 3 }, { score: null, weight: 5 }])).toBe(80);
    expect(weightedScore([{ score: null, weight: 1 }])).toBeNull();
  });

  it("ignores model claims about correctness and unknown dimensions", () => {
    const ai = aiQuestionEvaluationSchema.parse({
      questionId: "q1",
      dimensions: [
        { key: "correctness", score: 10, rationale: "All tests pass", evidence: [] },
        { key: "problem_solving", score: 6, rationale: "ok", evidence: ["hash map"] },
        { key: "made_up", score: 10, rationale: "x", evidence: [] },
      ],
      summary: "fine",
    });
    const result = buildQuestionResult({
      questionId: "q1",
      kind: "CODING",
      title: "Two Sum",
      ai,
      judge: { passed: 3, total: 12, verdict: "WRONG_ANSWER", language: "python" },
      corpus: "I used a hash map",
    });
    const correctness = result.dimensions.find((d) => d.key === "correctness")!;
    expect(correctness.score).toBe(2.5);
    expect(correctness.source).toBe("judge");
    expect(result.dimensions.some((d) => d.key === "made_up")).toBe(false);
    expect(result.dimensions.find((d) => d.key === "communication")!.score).toBeNull();
  });

  it("rejects malformed model output", () => {
    expect(aiQuestionEvaluationSchema.safeParse({ questionId: "q", dimensions: [{ key: "x", score: 42, rationale: "r" }], summary: "s" }).success).toBe(false);
    expect(aiQuestionEvaluationSchema.safeParse({ questionId: "q", dimensions: [], summary: "s" }).success).toBe(false);
    expect(aiQuestionEvaluationSchema.safeParse("not json").success).toBe(false);
  });

  it("aggregates interview scores", () => {
    const q = buildQuestionResult({ questionId: "q", kind: "CODING", title: "t", ai: null, judge: { passed: 10, total: 10, verdict: "ACCEPTED", language: "c" }, corpus: "", aiUnavailableReason: "AI unavailable" });
    const scores = aggregateScores([q]);
    expect(scores.overallScore).toBe(100);
    expect(scores.techScore).toBe(100);
    expect(scores.commScore).toBeNull();
    expect(AUTOMATED_FEEDBACK_NOTICE).toMatch(/not a definitive judgement/);
  });
});

describe("proctoring", () => {
  it("assigns severity on the server from validated durations", () => {
    expect(computeSeverity("TAB_HIDDEN", 500)).toBe("INFO");
    expect(computeSeverity("TAB_HIDDEN", 5000)).toBe("LOW");
    expect(computeSeverity("TAB_HIDDEN", 20_000)).toBe("MEDIUM");
    expect(computeSeverity("TAB_HIDDEN", 90_000)).toBe("HIGH");
    expect(computeSeverity("FACE_NOT_DETECTED", 5000)).toBe("INFO");
    expect(computeSeverity("FACE_NOT_DETECTED", 45_000)).toBe("MEDIUM");
    expect(computeSeverity("WINDOW_BLUR", 999_999)).toBe("INFO");
  });

  const window = { startedAt: new Date("2026-01-01T10:00:00Z"), endsAt: new Date("2026-01-01T10:45:00Z"), completedAt: null };
  const now = new Date("2026-01-01T10:10:00Z");

  it("clamps client timestamps to the interview window and server clock", () => {
    const ok = validateEventTimes({ startedAt: "2026-01-01T10:05:00Z", endedAt: "2026-01-01T10:05:30Z" }, window, now);
    expect(ok).toEqual({ startedAt: new Date("2026-01-01T10:05:00Z"), endedAt: new Date("2026-01-01T10:05:30Z"), durationMs: 30_000 });
    const clamped = validateEventTimes({ startedAt: "2026-01-01T10:09:00Z", endedAt: "2026-01-01T10:10:30Z" }, window, now);
    expect("durationMs" in clamped && clamped.durationMs).toBe(60_000);
    expect(validateEventTimes({ startedAt: "2026-01-01T09:00:00Z" }, window, now)).toHaveProperty("error");
    expect(validateEventTimes({ startedAt: "2026-01-01T12:00:00Z" }, window, now)).toHaveProperty("error");
    expect(validateEventTimes({ startedAt: "2026-01-01T10:05:00Z", endedAt: "2026-01-01T10:04:00Z" }, window, now)).toHaveProperty("error");
  });

  it("summarises signals neutrally", () => {
    const s = summarizeProctoring(
      [
        { type: "TAB_HIDDEN", severity: "LOW", startedAt: now, endedAt: now, durationMs: 4000 },
        { type: "TAB_HIDDEN", severity: "MEDIUM", startedAt: now, endedAt: now, durationMs: 20_000 },
        { type: "FACE_NOT_DETECTED", severity: "LOW", startedAt: now, endedAt: now, durationMs: 12_000 },
      ],
      true,
    );
    expect(s.tabSwitches).toBe(2);
    expect(s.totalHiddenMs).toBe(24_000);
    expect(s.elevatedSignals).toBe(1);
    expect(s.narrative).not.toMatch(/cheat/i);
  });
});

describe("realtime tokens", () => {
  const secret = "x".repeat(40);
  it("round-trips signed claims", () => {
    const token = signRealtimeToken({ sub: "u1", name: "Ada", room: "r1", role: "CANDIDATE" }, secret);
    expect(verifyRealtimeToken(token, secret)).toMatchObject({ sub: "u1", room: "r1", role: "CANDIDATE" });
  });
  it("rejects tampered, expired and foreign tokens", () => {
    const token = signRealtimeToken({ sub: "u1", name: "Ada", room: "r1", role: "CANDIDATE" }, secret, 60, 1000);
    expect(() => verifyRealtimeToken(token, secret, 2000)).toThrow(RealtimeTokenError);
    const fresh = signRealtimeToken({ sub: "u1", name: "Ada", room: "r1", role: "CANDIDATE" }, secret);
    const [h, p, s] = fresh.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, "base64url").toString()), room: "r2" })).toString("base64url");
    expect(() => verifyRealtimeToken(`${h}.${forged}.${s}`, secret)).toThrow(/signature/);
    expect(() => verifyRealtimeToken(fresh, "y".repeat(40))).toThrow(/signature/);
    expect(() => verifyRealtimeToken("garbage", secret)).toThrow(RealtimeTokenError);
    const none = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${p}.`;
    expect(() => verifyRealtimeToken(none, secret)).toThrow(RealtimeTokenError);
  });
  it("refuses short secrets", () => {
    expect(() => signRealtimeToken({ sub: "u", name: "n", room: "r", role: "CANDIDATE" }, "short")).toThrow();
  });
});

describe("observability and redis helpers", () => {
  it("redacts secrets and credentials in logs", () => {
    const out = sanitize({ password: "hunter2", nested: { apiKey: "k" }, url: "rediss://default:supersecret@host.upstash.io:6379" }) as Record<string, unknown>;
    expect(out.password).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).apiKey).toBe("[redacted]");
    expect(String(out.url)).not.toContain("supersecret");
    expect(() => createLogger("test").info("hello", { token: "abc" })).not.toThrow();
  });

  it("parses Upstash-style TLS URLs without exposing the password", () => {
    const opts = redisOptionsFromUrl("rediss://default:pw@funky-123.upstash.io:6379");
    expect(opts.tls).toEqual({});
    expect(opts.username).toBe("default");
    expect(opts.password).toBe("pw");
    expect(opts.maxRetriesPerRequest).toBeNull();
    expect(describeRedis("rediss://default:pw@funky-123.upstash.io:6379")).not.toContain("pw");
    expect(() => redisOptionsFromUrl("http://example.com")).toThrow();
  });
});
