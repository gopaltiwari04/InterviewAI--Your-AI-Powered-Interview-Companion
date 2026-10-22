import { executionJobSchema } from "@repo/core/judge";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config";
import { judge } from "../../src/judge";
import { LANGUAGES } from "../../src/languages";

const config = { dockerBin: "docker-that-does-not-exist", cpus: 1, pidsLimit: 64, lifetimeSeconds: 60 };

describe("executor configuration", () => {
  it("applies safe defaults and rejects invalid values", () => {
    const c = loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
    expect(c.EXECUTOR_CONCURRENCY).toBe(2);
    expect(c.SANDBOX_PIDS_LIMIT).toBe(128);
    expect(() => loadConfig({ EXECUTOR_CONCURRENCY: "500" } as NodeJS.ProcessEnv)).toThrow(/Invalid/);
  });

  it("pins every sandbox image to a version", () => {
    for (const lang of Object.values(LANGUAGES)) expect(lang.image).not.toMatch(/:latest$|^[^:]+$/);
  });
});

describe("job validation", () => {
  const base = {
    submissionId: "s1",
    roomId: null,
    kind: "RUN",
    language: "python",
    files: { "solution.py": "x", "main.py": "y" },
    returns: "int",
    comparator: { kind: "exact" },
    tests: [{ id: "t", input: "1\n", expected: "1\n", visible: true }],
    limits: { timeMsPerTest: 1000, memoryMb: 256, maxOutputBytes: 65536, totalTimeMs: 10_000 },
  };

  it("accepts well-formed jobs and rejects path traversal and oversized limits", () => {
    expect(executionJobSchema.safeParse(base).success).toBe(true);
    expect(executionJobSchema.safeParse({ ...base, files: { "../etc/passwd": "x" } }).success).toBe(false);
    expect(executionJobSchema.safeParse({ ...base, language: "ruby" }).success).toBe(false);
    expect(executionJobSchema.safeParse({ ...base, limits: { ...base.limits, memoryMb: 100_000 } }).success).toBe(false);
    expect(executionJobSchema.safeParse({ ...base, tests: [] }).success).toBe(false);
  });

  it("refuses files that do not belong to the language before touching Docker", async () => {
    const parsed = executionJobSchema.parse({ ...base, files: { "run.sh": "rm -rf /" } });
    const result = await judge(parsed, config);
    expect(result.verdict).toBe("INTERNAL_ERROR");
    expect(result.tests.every((t) => t.verdict === "SKIPPED")).toBe(true);
  });
});
