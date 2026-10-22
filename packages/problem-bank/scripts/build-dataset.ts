/**
 * Builds generated/dataset.json from src/problems.
 *
 *   pnpm --filter @repo/problem-bank build:dataset   regenerate the dataset
 *   pnpm --filter @repo/problem-bank verify          fail if the dataset is stale or any check fails
 *
 * For every problem the script
 *   1. encodes every example and hidden test (type-checking each argument),
 *   2. runs the JavaScript reference through the real JavaScript harness,
 *   3. runs the independently written Python reference through the Python harness,
 *   4. requires both references to agree on every test (using the problem's comparator),
 *   5. requires the references to reproduce every hand-written example output,
 *   6. enforces size limits so judge payloads stay small.
 * Expected outputs stored in the dataset come from step 2.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleProgram, encodeInput, encodeOutput, outputsMatch, type Value } from "@repo/core/problems";
import { PROBLEMS } from "../src/problems/index";
import { Rng } from "../src/rng";
import type { Dataset, DatasetProblem, DatasetTest, ProblemDefinition } from "../src/types";
import { PYTHON, pool, runProcess, withProgramDir } from "./local-runner";

const DATASET_VERSION = 1;
const MAX_TEST_INPUT_BYTES = 64 * 1024;
const MAX_PROBLEM_BYTES = 256 * 1024;
const MIN_HIDDEN_TESTS = 6;

const here = path.dirname(fileURLToPath(import.meta.url));
const datasetPath = path.join(here, "..", "generated", "dataset.json");
const checkOnly = process.argv.includes("--check");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);

class ProblemError extends Error {}

function validateDefinition(p: ProblemDefinition) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)) throw new ProblemError("slug must be kebab-case");
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p.signature.functionName)) throw new ProblemError("invalid function name");
  if (p.examples.length < 1) throw new ProblemError("needs at least one example");
  if (p.constraints.length < 1) throw new ProblemError("needs constraints");
  if (p.topics.length < 1) throw new ProblemError("needs at least one topic");
  for (const param of p.signature.params) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(param.name)) throw new ProblemError(`invalid parameter name ${param.name}`);
  }
}

async function runReference(p: ProblemDefinition, language: "javascript" | "python", inputs: string[]): Promise<string[]> {
  const files = assembleProgram(language, p.signature, p.reference[language]);
  return withProgramDir(files, (dir) =>
    pool(inputs, 6, async (input, i) => {
      const run =
        language === "javascript"
          ? await runProcess(process.execPath, ["--stack-size=7000", "main.js"], dir, input)
          : await runProcess(PYTHON, ["main.py"], dir, input);
      if (run.timedOut || run.code !== 0) {
        throw new ProblemError(
          `${language} reference failed on test #${i + 1} (exit ${run.code}${run.timedOut ? ", timed out" : ""}): ${run.stderr.slice(-600)}`,
        );
      }
      return run.stdout;
    }),
  );
}

async function buildProblem(p: ProblemDefinition): Promise<DatasetProblem> {
  validateDefinition(p);
  const rng = Rng.fromString(`${p.slug}@${p.version}`);
  const hidden = p.hiddenTests(rng);
  if (hidden.length < MIN_HIDDEN_TESTS) throw new ProblemError(`needs at least ${MIN_HIDDEN_TESTS} hidden tests`);

  const cases: { id: string; args: Value[]; visible: boolean }[] = [
    ...p.examples.map((e, i) => ({ id: `ex-${i + 1}`, args: e.args, visible: true })),
    ...hidden.map((args, i) => ({ id: `h-${i + 1}`, args, visible: false })),
  ];

  const inputs = cases.map((c) => {
    try {
      return encodeInput(p.signature, c.args);
    } catch (e) {
      throw new ProblemError(`test ${c.id}: ${(e as Error).message}`);
    }
  });
  inputs.forEach((input, i) => {
    if (input.length > MAX_TEST_INPUT_BYTES) throw new ProblemError(`test ${cases[i]?.id} input is ${input.length} bytes`);
  });

  const [jsOut, pyOut] = await Promise.all([runReference(p, "javascript", inputs), runReference(p, "python", inputs)]);

  cases.forEach((c, i) => {
    const js = jsOut[i] as string;
    const py = pyOut[i] as string;
    if (!outputsMatch(py, js, p.comparator, p.signature.returns)) {
      throw new ProblemError(`references disagree on ${c.id}\n  js: ${js.slice(0, 300)}\n  py: ${py.slice(0, 300)}`);
    }
  });

  p.examples.forEach((ex, i) => {
    const expected = encodeOutput(p.signature.returns, ex.output);
    if (!outputsMatch(jsOut[i] as string, expected, p.comparator, p.signature.returns)) {
      throw new ProblemError(`example ${i + 1} is wrong: stated ${expected.trim()} but references produce ${(jsOut[i] as string).trim()}`);
    }
  });

  const tests: DatasetTest[] = cases.map((c, i) => ({
    id: c.id,
    input: inputs[i] as string,
    // Normalise line endings so the dataset is identical on Windows and Linux.
    expected: (jsOut[i] as string).replace(/\r\n/g, "\n"),
    visible: c.visible,
  }));
  const bytes = tests.reduce((n, t) => n + t.input.length + t.expected.length, 0);
  if (bytes > MAX_PROBLEM_BYTES) throw new ProblemError(`tests total ${bytes} bytes (limit ${MAX_PROBLEM_BYTES})`);

  return { slug: p.slug, version: p.version, tests };
}

async function main() {
  const slugs = new Set<string>();
  for (const p of PROBLEMS) {
    if (slugs.has(p.slug)) throw new Error(`duplicate slug ${p.slug}`);
    slugs.add(p.slug);
  }

  const selected = only ? PROBLEMS.filter((p) => p.slug === only) : PROBLEMS;
  const problems: Record<string, DatasetProblem> = {};
  const failures: string[] = [];
  const started = Date.now();

  for (const p of selected) {
    try {
      problems[p.slug] = await buildProblem(p);
      const hiddenCount = problems[p.slug]!.tests.filter((t) => !t.visible).length;
      console.log(`  ok  ${p.slug.padEnd(48)} ${p.difficulty.padEnd(6)} ${hiddenCount} hidden tests`);
    } catch (e) {
      failures.push(`${p.slug}: ${(e as Error).message}`);
      console.log(`  FAIL ${p.slug}: ${(e as Error).message}`);
    }
  }

  console.log(`\n${selected.length - failures.length}/${selected.length} problems verified in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} problem(s) failed verification.`);
    process.exit(1);
  }
  if (only) return;

  const dataset: Dataset = {
    datasetVersion: DATASET_VERSION,
    generatedBy: "packages/problem-bank/scripts/build-dataset.ts",
    problems: Object.fromEntries(Object.keys(problems).sort().map((k) => [k, problems[k]!])),
  };
  const serialized = JSON.stringify(dataset) + "\n";

  if (checkOnly) {
    const current = await readFile(datasetPath, "utf8").catch(() => "");
    if (current !== serialized) {
      console.error("generated/dataset.json is out of date. Run: pnpm --filter @repo/problem-bank build:dataset");
      process.exit(1);
    }
    console.log("generated/dataset.json is up to date.");
    return;
  }
  await writeFile(datasetPath, serialized);
  console.log(`Wrote ${path.relative(process.cwd(), datasetPath)} (${(serialized.length / 1024).toFixed(0)} KiB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
