import {
  JUDGE_VERSION,
  LANGUAGE_TIME_FACTOR,
  summarizeVerdict,
  type ExecutionJob,
  type ExecutionResult,
  type TestResult,
  type TestVerdict,
} from "@repo/core/judge";
import { outputsMatch } from "@repo/core/problems";
import { LANGUAGES } from "./languages.js";
import { Sandbox, SandboxError, type SandboxConfig } from "./sandbox.js";

const COMPILE_TIMEOUT_MS = 30_000;
const MAX_COMPILE_OUTPUT = 8 * 1024;
const MAX_VISIBLE_STDOUT = 4 * 1024;
const MAX_VISIBLE_STDERR = 4 * 1024;
/** docker exec adds latency that is not the program's fault. */
const EXEC_OVERHEAD_ALLOWANCE_MS = 400;
const STOP_AFTER_TIMEOUTS = 2;

/** Thrown when the infrastructure (not the candidate) failed; BullMQ will retry the job. */
export class JudgeInfrastructureError extends Error {}

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}\n… (truncated)` : s);

function invalidJob(job: ExecutionJob, message: string): ExecutionResult {
  return {
    submissionId: job.submissionId,
    verdict: "INTERNAL_ERROR",
    passed: 0,
    total: job.tests.length,
    compileOutput: message,
    tests: job.tests.map((t) => ({ id: t.id, visible: t.visible, verdict: "SKIPPED", timeMs: 0 })),
    executionTimeMs: 0,
    judgeVersion: JUDGE_VERSION,
  };
}

export async function judge(job: ExecutionJob, config: SandboxConfig): Promise<ExecutionResult> {
  const lang = LANGUAGES[job.language];
  const fileNames = Object.keys(job.files);
  if (fileNames.length === 0 || fileNames.some((f) => !lang.files.includes(f)) || lang.files.some((f) => !(f in job.files))) {
    return invalidJob(job, `Unexpected files for ${job.language}: ${fileNames.join(", ")}`);
  }

  const started = Date.now();
  const deadline = started + job.limits.totalTimeMs;
  const timeLimitMs = Math.round(job.limits.timeMsPerTest * LANGUAGE_TIME_FACTOR[job.language]);
  const memoryMb = Math.max(job.limits.memoryMb, lang.minMemoryMb);

  let sandbox: Sandbox;
  try {
    sandbox = await Sandbox.create(lang.image, memoryMb, config);
  } catch (e) {
    throw new JudgeInfrastructureError((e as Error).message);
  }

  const results: TestResult[] = [];
  let compileOutput: string | null = null;
  try {
    try {
      for (const name of fileNames) await sandbox.writeFile(name, job.files[name]!);
    } catch (e) {
      throw new JudgeInfrastructureError((e as Error).message);
    }

    if (lang.compile) {
      const compiled = await sandbox.exec(lang.compile, { timeoutMs: COMPILE_TIMEOUT_MS, maxStdoutBytes: MAX_COMPILE_OUTPUT });
      if (compiled.exitCode !== 0) {
        const output = `${compiled.stderr}\n${compiled.stdout}`.trim();
        compileOutput = truncate(
          compiled.exitCode === 137 ? "Compilation took too long or used too much memory." : output || `Compiler exited with code ${compiled.exitCode}`,
          MAX_COMPILE_OUTPUT,
        );
        const tests = job.tests.map((t) => ({ id: t.id, visible: t.visible, verdict: "COMPILATION_ERROR" as const, timeMs: 0 }));
        return {
          submissionId: job.submissionId,
          verdict: "COMPILATION_ERROR",
          passed: 0,
          total: job.tests.length,
          compileOutput,
          tests,
          executionTimeMs: Date.now() - started,
          judgeVersion: JUDGE_VERSION,
        };
      }
      // Warnings are useful feedback even on success.
      const warnings = compiled.stderr.trim();
      compileOutput = warnings ? truncate(warnings, MAX_COMPILE_OUTPUT) : null;
    }

    const baselineOom = await sandbox.oomKills();
    let timeouts = 0;
    let stop = false;

    for (const test of job.tests) {
      if (stop || sandbox.isDestroyed || Date.now() > deadline || timeouts >= STOP_AFTER_TIMEOUTS) {
        results.push({ id: test.id, visible: test.visible, verdict: "SKIPPED", timeMs: 0 });
        continue;
      }

      const run = await sandbox.exec(lang.run, {
        stdin: test.input,
        timeoutMs: Math.min(timeLimitMs, Math.max(100, deadline - Date.now())),
        maxStdoutBytes: job.limits.maxOutputBytes,
      });

      let verdict: TestVerdict;
      if (run.outputLimitExceeded) {
        verdict = "OUTPUT_LIMIT_EXCEEDED";
        stop = true;
      } else if (run.watchdogFired) {
        verdict = "TIME_LIMIT_EXCEEDED";
        timeouts++;
      } else if (run.exitCode === 137) {
        const oom = await sandbox.oomKills();
        if (oom !== null && baselineOom !== null && oom > baselineOom) verdict = "MEMORY_LIMIT_EXCEEDED";
        else if (run.timeMs >= timeLimitMs * 0.9) verdict = "TIME_LIMIT_EXCEEDED";
        else verdict = "MEMORY_LIMIT_EXCEEDED";
        if (verdict === "TIME_LIMIT_EXCEEDED") timeouts++;
      } else if (run.exitCode !== 0) {
        verdict = lang.oomMarkers.some((m) => run.stderr.includes(m)) ? "MEMORY_LIMIT_EXCEEDED" : "RUNTIME_ERROR";
      } else if (run.timeMs > timeLimitMs + EXEC_OVERHEAD_ALLOWANCE_MS) {
        verdict = "TIME_LIMIT_EXCEEDED";
        timeouts++;
      } else if (test.expected === null) {
        verdict = "EXECUTED";
      } else {
        verdict = outputsMatch(run.stdout, test.expected, job.comparator, job.returns) ? "ACCEPTED" : "WRONG_ANSWER";
      }

      const result: TestResult = { id: test.id, visible: test.visible, verdict, timeMs: run.timeMs };
      // Output of hidden tests is never returned: a program could print its hidden input.
      if (test.visible) {
        result.stdout = truncate(run.stdout, MAX_VISIBLE_STDOUT);
        if (run.stderr.trim()) result.stderr = truncate(run.stderr, MAX_VISIBLE_STDERR);
      }
      results.push(result);
    }
  } catch (e) {
    if (e instanceof JudgeInfrastructureError) throw e;
    if (e instanceof SandboxError) throw new JudgeInfrastructureError(e.message);
    throw e;
  } finally {
    await sandbox.destroy();
  }

  return {
    submissionId: job.submissionId,
    verdict: summarizeVerdict(results),
    passed: results.filter((r) => r.verdict === "ACCEPTED").length,
    total: job.tests.length,
    compileOutput,
    tests: results,
    executionTimeMs: Date.now() - started,
    judgeVersion: JUDGE_VERSION,
  };
}
