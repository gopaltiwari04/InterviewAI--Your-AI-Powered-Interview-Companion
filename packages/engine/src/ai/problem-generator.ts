/**
 * AI-generated coding problems, admitted only after validation:
 *   1. the model's JSON must match a strict schema using the judge's type system,
 *   2. every example and test argument must type-check and encode,
 *   3. the model's Python reference solution is run against every test in the
 *      real sandbox (never on the web server),
 *   4. the reference must reproduce every example output the model claimed.
 * Hidden-test expected outputs come from the sandboxed run, not from the model.
 * Any failure rejects the problem and the caller falls back to the bank.
 */
import { randomUUID } from "node:crypto";
import { MAX_SOURCE_BYTES } from "@repo/core/judge";
import {
  VALUE_TYPES,
  allStarterCode,
  assembleProgram,
  encodeInput,
  encodeOutput,
  formatArgs,
  formatValue,
  outputsMatch,
  type Comparator,
  type Difficulty,
  type JudgeTestCase,
  type PublicProblem,
  type Signature,
  type Topic,
} from "@repo/core/problems";
import type { Prisma } from "@repo/database";
import { z } from "zod";
import { db, logger } from "../infra";
import { enqueueExecution, lookupExecution } from "../queues";
import { AiError, getAiClient } from "./client";
import { generateStructured } from "./structured";

const valueSchema: z.ZodType<unknown> = z.lazy(() => z.union([z.number(), z.boolean(), z.string(), z.null(), z.array(valueSchema)]));
const identifier = z.string().regex(/^[a-z][a-zA-Z0-9]{0,30}$/);

export const generatedProblemSchema = z.object({
  title: z.string().min(3).max(80),
  statement: z.string().min(30).max(3000),
  inputDescription: z.string().min(3).max(600),
  outputDescription: z.string().min(3).max(600),
  constraints: z.array(z.string().max(200)).min(1).max(8),
  functionName: identifier,
  params: z.array(z.object({ name: identifier, type: z.enum(VALUE_TYPES) })).min(1).max(4),
  returns: z.enum(VALUE_TYPES),
  comparator: z.enum(["exact", "unordered"]),
  examples: z.array(z.object({ args: z.array(valueSchema), output: valueSchema, explanation: z.string().max(400).optional() })).min(1).max(3),
  tests: z.array(z.object({ args: z.array(valueSchema) })).min(6).max(15),
  referenceSolutionPython: z.string().min(10).max(MAX_SOURCE_BYTES),
  followUps: z.array(z.string().max(300)).max(4).default([]),
});
export type GeneratedProblemDraft = z.infer<typeof generatedProblemSchema>;

const SHAPE_HINT = `{
  "title": string, "statement": string (markdown, no HTML), "inputDescription": string, "outputDescription": string,
  "constraints": string[],
  "functionName": camelCase identifier, "params": [{"name": camelCase identifier, "type": one of ${VALUE_TYPES.join(" | ")}}],
  "returns": one of the same types,
  "comparator": "exact" | "unordered",
  "examples": [{"args": [one JSON value per param], "output": JSON value, "explanation": string}],
  "tests": [{"args": [...]}] (6-12 tests covering edge cases: empty/minimum input, duplicates, negatives, large values within constraints),
  "referenceSolutionPython": "def <functionName>(...):\\n    ..." (a plain function, standard library only, no input()/print()),
  "followUps": string[]
}
Value encodings: int/long/double/bool/string as JSON scalars; int[] and ListNode as integer arrays; int[][] as arrays of integer arrays; string[] as string arrays; TreeNode as a level-order array using null for missing children. Keep every test small (at most 200 elements).`;

export type GenerationResult =
  | { ok: true; id: string; title: string; statement: string; followUps: string[] }
  | { ok: false; reason: string };

class ValidationError extends Error {}

export interface BuiltProblem {
  signature: Signature;
  comparator: Comparator;
  examples: { args: unknown[]; output: unknown; explanation?: string; input: string; expected: string }[];
  tests: { args: unknown[]; input: string }[];
}

/** Static validation: types, encodings and sizes. Throws ValidationError. */
export function buildFromDraft(draft: GeneratedProblemDraft): BuiltProblem {
  const signature: Signature = { functionName: draft.functionName, params: draft.params, returns: draft.returns };
  if (new Set(draft.params.map((p) => p.name)).size !== draft.params.length) throw new ValidationError("duplicate parameter names");
  if (!new RegExp(`def\\s+${draft.functionName}\\s*\\(`).test(draft.referenceSolutionPython)) throw new ValidationError("reference solution does not define the function");
  if (/\b(import\s+(os|subprocess|socket|sys)|open\(|eval\(|exec\()/.test(draft.referenceSolutionPython)) throw new ValidationError("reference solution uses disallowed calls");
  const comparator: Comparator = draft.comparator === "unordered" ? { kind: "unordered", sortInner: draft.returns === "int[][]" } : { kind: "exact" };
  try {
    const examples = draft.examples.map((e) => ({
      args: e.args,
      output: e.output as unknown,
      explanation: e.explanation,
      input: encodeInput(signature, e.args as never),
      expected: encodeOutput(draft.returns, e.output as never),
    }));
    const tests = draft.tests.map((t) => ({ args: t.args, input: encodeInput(signature, t.args as never) }));
    if ([...examples, ...tests].some((t) => t.input.length > 8 * 1024)) throw new ValidationError("a test is too large");
    if (new Set(tests.map((t) => t.input)).size < 5) throw new ValidationError("tests are not diverse enough");
    return { signature, comparator, examples, tests };
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new ValidationError(`invalid test data: ${(e as Error).message}`);
  }
}

async function runReference(draft: GeneratedProblemDraft, built: BuiltProblem, timeoutMs: number) {
  const submissionId = `validate-${randomUUID()}`;
  const inputs = [...built.examples.map((e) => e.input), ...built.tests.map((t) => t.input)];
  await enqueueExecution({
    submissionId,
    roomId: null,
    kind: "VALIDATE",
    language: "python",
    files: assembleProgram("python", built.signature, draft.referenceSolutionPython),
    returns: built.signature.returns,
    comparator: built.comparator,
    tests: inputs.map((input, i) => ({ id: `t${i}`, input, expected: null, visible: true })),
    limits: { timeMsPerTest: 2000, memoryMb: 256, maxOutputBytes: 64 * 1024, totalTimeMs: 60_000 },
  });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await lookupExecution(submissionId);
    if (state.state === "completed") return state.result;
    if (state.state === "failed") throw new ValidationError(`sandbox run failed: ${state.reason}`);
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new ValidationError("timed out waiting for the sandbox to validate the reference solution");
}

export async function generateValidatedProblem(options: {
  difficulty: Difficulty;
  topics: Topic[];
  userId: string;
  validationTimeoutMs?: number;
}): Promise<GenerationResult> {
  const client = getAiClient();
  if (!client) return { ok: false, reason: "AI provider not configured" };
  const log: string[] = [];
  let draft: GeneratedProblemDraft | null = null;
  let model = client.id;
  try {
    const topicText = options.topics.length ? `Topic: ${options.topics.join(", ")}.` : "Any classic data-structures topic.";
    const generated = await generateStructured(client, {
      task: "generate-problem",
      system:
        "You write original, unambiguous coding-interview problems with a correct reference solution and thorough tests. Problems must have exactly one correct output for every input unless the comparator is 'unordered'. Do not reproduce copyrighted text.",
      prompt: `Write one ${options.difficulty.toLowerCase()} coding interview problem. ${topicText}`,
      schema: generatedProblemSchema,
      shapeHint: SHAPE_HINT,
      maxOutputTokens: 4096,
      temperature: 0.7,
    });
    draft = generated.data;
    model = generated.model;
    log.push(`generated by ${generated.model} in ${generated.attempts} attempt(s)`);

    const built = buildFromDraft(draft);
    log.push(`schema and encodings valid: ${built.examples.length} examples, ${built.tests.length} tests`);

    const result = await runReference(draft, built, options.validationTimeoutMs ?? 45_000);
    if (result.verdict === "COMPILATION_ERROR" || result.tests.some((t) => t.verdict !== "EXECUTED")) {
      const bad = result.tests.find((t) => t.verdict !== "EXECUTED");
      throw new ValidationError(`reference solution failed in the sandbox (${bad?.verdict ?? result.verdict}): ${(bad?.stderr ?? result.compileOutput ?? "").slice(0, 300)}`);
    }
    const outputs = result.tests.map((t) => t.stdout ?? "");
    built.examples.forEach((ex, i) => {
      if (!outputsMatch(outputs[i]!, ex.expected, built.comparator, built.signature.returns)) {
        throw new ValidationError(`example ${i + 1} output ${ex.expected.trim()} does not match the reference output ${outputs[i]!.trim()}`);
      }
    });
    log.push("reference solution reproduced every example and ran every test in the sandbox");

    const tests: JudgeTestCase[] = [
      ...built.examples.map((e, i) => ({ id: `ex-${i + 1}`, input: e.input, expected: e.expected, visible: true })),
      ...built.tests.map((t, i) => ({ id: `h-${i + 1}`, input: t.input, expected: outputs[built.examples.length + i]!.replace(/\r\n/g, "\n"), visible: false })),
    ];
    const id = randomUUID().replace(/-/g, "").slice(0, 24);
    const publicView: PublicProblem = {
      slug: `ai-${id}`,
      version: 1,
      title: draft.title,
      difficulty: options.difficulty,
      topics: options.topics.length ? options.topics : ["arrays-strings"],
      statement: draft.statement,
      inputDescription: draft.inputDescription,
      outputDescription: draft.outputDescription,
      constraints: draft.constraints,
      examples: built.examples.map((e) => ({
        input: formatArgs(built.signature.params, e.args as never),
        output: formatValue(e.output as never),
        stdin: e.input,
        explanation: e.explanation,
      })),
      signature: built.signature,
      starterCode: allStarterCode(built.signature),
      timeLimitMs: 2000,
      source: "AI_GENERATED",
    };
    const saved = await db.generatedProblem.create({
      data: {
        id,
        createdById: options.userId,
        status: "VALIDATED",
        model,
        difficulty: options.difficulty,
        topics: publicView.topics,
        definition: { publicView, comparator: built.comparator, followUps: draft.followUps } as unknown as Prisma.InputJsonValue,
        tests: tests as unknown as Prisma.InputJsonValue,
        referenceSolution: draft.referenceSolutionPython,
        validationLog: log.join("\n"),
      },
    });
    return { ok: true, id: saved.id, title: draft.title, statement: draft.statement, followUps: draft.followUps };
  } catch (err) {
    const reason = err instanceof ValidationError || err instanceof AiError ? err.message : `unexpected error: ${(err as Error).message}`;
    log.push(`rejected: ${reason}`);
    logger.warn("generated problem rejected", { reason });
    if (draft) {
      await db.generatedProblem
        .create({
          data: {
            createdById: options.userId,
            status: "REJECTED",
            model,
            difficulty: options.difficulty,
            topics: options.topics,
            definition: draft as unknown as Prisma.InputJsonValue,
            tests: [],
            referenceSolution: draft.referenceSolutionPython,
            validationLog: log.join("\n"),
          },
        })
        .catch(() => undefined);
    }
    return { ok: false, reason };
  }
}
