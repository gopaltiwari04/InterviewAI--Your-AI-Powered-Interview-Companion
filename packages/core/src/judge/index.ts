import { z } from "zod";
import { LANGUAGES, VALUE_TYPES } from "../problems/types";

/** Queue that carries code-execution jobs from the web app to apps/code-executor. */
export const EXECUTION_QUEUE = "code-execution-v2";
/** Redis key the executor refreshes while it is alive. */
export const EXECUTOR_HEARTBEAT_KEY = "code-executor:heartbeat";
/** Pub/sub channel prefix used to notify the realtime server about finished jobs. */
export const SUBMISSION_CHANNEL_PREFIX = "submission-updates:";
export const JUDGE_VERSION = "judge-2";

export const VERDICTS = [
  "ACCEPTED",
  "WRONG_ANSWER",
  "COMPILATION_ERROR",
  "RUNTIME_ERROR",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "OUTPUT_LIMIT_EXCEEDED",
  "INTERNAL_ERROR",
] as const;
export type Verdict = (typeof VERDICTS)[number];

/** Per-test verdicts add EXECUTED (custom input, nothing to compare) and SKIPPED. */
export const TEST_VERDICTS = [...VERDICTS, "EXECUTED", "SKIPPED"] as const;
export type TestVerdict = (typeof TEST_VERDICTS)[number];

export const SUBMISSION_KINDS = ["RUN", "SUBMIT", "CUSTOM", "VALIDATE"] as const;
export type SubmissionKind = (typeof SUBMISSION_KINDS)[number];

export const MAX_SOURCE_BYTES = 64 * 1024;
export const MAX_CUSTOM_INPUT_BYTES = 16 * 1024;

const comparatorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("exact") }),
  z.object({ kind: z.literal("unordered"), sortInner: z.boolean().optional() }),
  z.object({ kind: z.literal("float"), tolerance: z.number().positive() }),
]);

export const executionJobSchema = z.object({
  submissionId: z.string().min(1).max(64),
  roomId: z.string().max(64).nullable(),
  kind: z.enum(SUBMISSION_KINDS),
  language: z.enum(LANGUAGES),
  files: z.record(z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/), z.string().max(512 * 1024)),
  returns: z.enum(VALUE_TYPES),
  comparator: comparatorSchema,
  tests: z
    .array(
      z.object({
        id: z.string().max(64),
        input: z.string().max(256 * 1024),
        expected: z.string().max(256 * 1024).nullable(),
        visible: z.boolean(),
      }),
    )
    .min(1)
    .max(60),
  limits: z.object({
    timeMsPerTest: z.number().int().min(100).max(20_000),
    memoryMb: z.number().int().min(32).max(1024),
    maxOutputBytes: z.number().int().min(1024).max(1024 * 1024),
    totalTimeMs: z.number().int().min(1000).max(180_000),
  }),
});
export type ExecutionJob = z.infer<typeof executionJobSchema>;

export interface TestResult {
  id: string;
  visible: boolean;
  verdict: TestVerdict;
  timeMs: number;
  /** Only present for visible tests: hidden output could leak hidden inputs. */
  stdout?: string;
  stderr?: string;
}

export interface ExecutionResult {
  submissionId: string;
  verdict: Verdict;
  passed: number;
  total: number;
  compileOutput: string | null;
  tests: TestResult[];
  executionTimeMs: number;
  judgeVersion: string;
}

export const DEFAULT_LIMITS = {
  memoryMb: 256,
  maxOutputBytes: 64 * 1024,
  totalTimeMs: 90_000,
};

/** Interpreted and JIT languages get proportionally more time per test. */
export const LANGUAGE_TIME_FACTOR: Record<(typeof LANGUAGES)[number], number> = {
  c: 1,
  cpp: 1,
  java: 2,
  javascript: 1.5,
  python: 3,
};

/** Priority of verdicts when summarising many tests: the first failing test decides. */
export function summarizeVerdict(tests: TestResult[]): Verdict {
  const failing = tests.find((t) => t.verdict !== "ACCEPTED" && t.verdict !== "EXECUTED");
  if (!failing) return "ACCEPTED";
  if (failing.verdict === "SKIPPED" || failing.verdict === "EXECUTED") return "TIME_LIMIT_EXCEEDED";
  return failing.verdict;
}

export const VERDICT_LABELS: Record<TestVerdict, string> = {
  ACCEPTED: "Accepted",
  WRONG_ANSWER: "Wrong answer",
  COMPILATION_ERROR: "Compilation error",
  RUNTIME_ERROR: "Runtime error",
  TIME_LIMIT_EXCEEDED: "Time limit exceeded",
  MEMORY_LIMIT_EXCEEDED: "Memory limit exceeded",
  OUTPUT_LIMIT_EXCEEDED: "Output limit exceeded",
  INTERNAL_ERROR: "Judge error",
  EXECUTED: "Executed",
  SKIPPED: "Not run",
};
