import { outputsMatch } from "@repo/core/problems";
import { summarizeVerdict, type ExecutionJob, type ExecutionResult, type TestResult, type TestVerdict } from "@repo/core/judge";

const COMPILERS: Record<string, string> = {
  cpp: "gcc-13.2.0",
  c: "gcc-13.2.0",
  python: "cpython-3.12.7",
  javascript: "nodejs-20.17.0",
  java: "openjdk-jdk-21+35",
};

interface WandboxResponse {
  status: string;
  signal?: string;
  compiler_output?: string;
  compiler_error?: string;
  program_output?: string;
  program_error?: string;
}

function getUnifiedCode(job: ExecutionJob): string {
  switch (job.language) {
    case "cpp":
      return job.files["main.cpp"] ?? Object.values(job.files)[0] ?? "";
    case "c":
      return job.files["main.c"] ?? Object.values(job.files)[0] ?? "";
    case "java":
      return job.files["Main.java"] ?? Object.values(job.files)[0] ?? "";
    case "python": {
      const sol = job.files["solution.py"] ?? "";
      const main = job.files["main.py"] ?? "";
      return `${sol}\n\n${main}`.trim();
    }
    case "javascript": {
      const sol = job.files["solution.js"] ?? "";
      const main = job.files["main.js"] ?? "";
      return `${sol}\n\n${main}`.trim();
    }
  }
}

/**
 * Fallback code judge when the background Docker executor worker is offline.
 * Works seamlessly in serverless (e.g. Vercel) and local development without Docker.
 */
export async function runFallbackJudge(job: ExecutionJob): Promise<ExecutionResult> {
  const started = Date.now();
  const compiler = COMPILERS[job.language] ?? "gcc-13.2.0";
  const code = getUnifiedCode(job);

  const testResults: TestResult[] = [];
  let compileOutput: string | null = null;

  for (let i = 0; i < job.tests.length; i++) {
    const test = job.tests[i]!;
    const testStart = Date.now();

    try {
      const res = await fetch("https://wandbox.org/api/compile.json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compiler,
          code,
          stdin: test.input,
        }),
        signal: AbortSignal.timeout(18_000),
      });

      if (!res.ok) {
        throw new Error(`Execution service HTTP ${res.status}`);
      }

      const json = (await res.json()) as WandboxResponse;
      const timeMs = Date.now() - testStart;

      // Handle Compilation Error (check on first test)
      if (json.status !== "0" && json.compiler_error && json.compiler_error.trim().length > 0) {
        compileOutput = json.compiler_error.trim();
        return {
          submissionId: job.submissionId,
          verdict: "COMPILATION_ERROR",
          passed: 0,
          total: job.tests.length,
          compileOutput,
          tests: job.tests.map((t) => ({
            id: t.id,
            visible: t.visible,
            verdict: "COMPILATION_ERROR" as const,
            timeMs: 0,
          })),
          executionTimeMs: Date.now() - started,
          judgeVersion: "cloud-fallback-v1",
        };
      }

      let verdict: TestVerdict = "ACCEPTED";
      if (json.status !== "0") {
        if (json.signal === "SIGKILL" || json.signal === "SIGXCPU") {
          verdict = "TIME_LIMIT_EXCEEDED";
        } else {
          verdict = "RUNTIME_ERROR";
        }
      } else {
        const actual = (json.program_output ?? "").trim();
        if (test.expected !== null) {
          const matched = outputsMatch(actual, test.expected, job.comparator, job.returns);
          verdict = matched ? "ACCEPTED" : "WRONG_ANSWER";
        } else {
          // Custom input run
          verdict = "ACCEPTED";
        }
      }

      testResults.push({
        id: test.id,
        visible: test.visible,
        verdict,
        timeMs,
        stdout: test.visible ? json.program_output : undefined,
        stderr: test.visible ? json.program_error : undefined,
      });
    } catch (err) {
      testResults.push({
        id: test.id,
        visible: test.visible,
        verdict: "INTERNAL_ERROR",
        timeMs: Date.now() - testStart,
        stderr: test.visible ? (err as Error).message : undefined,
      });
    }
  }

  const passed = testResults.filter((t) => t.verdict === "ACCEPTED").length;
  const overallVerdict = summarizeVerdict(testResults);

  return {
    submissionId: job.submissionId,
    verdict: overallVerdict,
    passed,
    total: job.tests.length,
    compileOutput,
    tests: testResults,
    executionTimeMs: Date.now() - started,
    judgeVersion: "cloud-fallback-v1",
  };
}
