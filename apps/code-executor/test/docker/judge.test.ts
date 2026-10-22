/**
 * End-to-end judge tests against a real Docker daemon.
 * Run: pnpm --filter code-executor test:docker
 */
import { execFileSync } from "node:child_process";
import type { ExecutionJob } from "@repo/core/judge";
import { assembleProgram, type Language } from "@repo/core/problems";
import { getJudgeTests, getProblemDefinition } from "@repo/problem-bank";
import { beforeAll, describe, expect, it } from "vitest";
import { judge } from "../../src/judge";
import { LANGUAGES } from "../../src/languages";
import { ensureImage, type SandboxConfig } from "../../src/sandbox";

const config: SandboxConfig = { dockerBin: process.env.DOCKER_BIN || "docker", cpus: 1, pidsLimit: 128, lifetimeSeconds: 120 };
const twoSum = getProblemDefinition("two-sum")!;

function job(language: Language, code: string, kind: "RUN" | "SUBMIT" = "SUBMIT", overrides: Partial<ExecutionJob> = {}): ExecutionJob {
  return {
    submissionId: `test-${Math.random().toString(36).slice(2)}`,
    roomId: null,
    kind,
    language,
    files: assembleProgram(language, twoSum.signature, code),
    returns: twoSum.signature.returns,
    comparator: twoSum.comparator,
    tests: getJudgeTests("two-sum", kind),
    limits: { timeMsPerTest: 2000, memoryMb: 256, maxOutputBytes: 64 * 1024, totalTimeMs: 90_000 },
    ...overrides,
  };
}

const SOLUTIONS: Record<Language, string> = {
  python: `def twoSum(nums: List[int], target: int) -> List[int]:
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
    return []
`,
  javascript: `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
    seen.set(nums[i], i);
  }
  return [];
}`,
  cpp: `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < (int)nums.size(); i++) {
            auto it = seen.find(target - nums[i]);
            if (it != seen.end()) return {it->second, i};
            seen[nums[i]] = i;
        }
        return {};
    }
};`,
  java: `class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            Integer j = seen.get(target - nums[i]);
            if (j != null) return new int[] { j, i };
            seen.put(nums[i], i);
        }
        return new int[0];
    }
}`,
  c: `int* twoSum(int* nums, int numsSize, int target, int* returnSize) {
    for (int i = 0; i < numsSize; i++)
        for (int j = i + 1; j < numsSize; j++)
            if (nums[i] + nums[j] == target) {
                int* r = malloc(2 * sizeof(int));
                r[0] = i; r[1] = j; *returnSize = 2;
                return r;
            }
    *returnSize = 0;
    return NULL;
}`,
};

function leftoverSandboxes(): string[] {
  const out = execFileSync(config.dockerBin, ["ps", "-a", "--filter", "label=interviewai.sandbox=1", "--format", "{{.Names}}"], { encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

beforeAll(async () => {
  for (const image of new Set(Object.values(LANGUAGES).map((l) => l.image))) {
    expect(await ensureImage(config.dockerBin, image), `image ${image}`).toBe(true);
  }
});

describe("judge (Docker)", () => {
  it.each(Object.keys(SOLUTIONS) as Language[])("accepts a correct %s solution on every hidden test", async (language) => {
    const result = await judge(job(language, SOLUTIONS[language]), config);
    expect(result.compileOutput ?? "").not.toMatch(/error/i);
    expect(result.verdict).toBe("ACCEPTED");
    expect(result.passed).toBe(result.total);
    expect(result.total).toBeGreaterThan(5);
  });

  it("reports wrong answers and keeps hidden output private", async () => {
    const result = await judge(job("python", "def twoSum(nums, target):\n    return [0, 1]\n"), config);
    expect(result.verdict).toBe("WRONG_ANSWER");
    expect(result.passed).toBeGreaterThan(0);
    expect(result.passed).toBeLessThan(result.total);
    for (const t of result.tests.filter((x) => !x.visible)) {
      expect(t.stdout).toBeUndefined();
      expect(t.stderr).toBeUndefined();
    }
    expect(result.tests.filter((x) => x.visible).every((x) => typeof x.stdout === "string")).toBe(true);
  });

  it("reports compilation errors with the candidate's own line numbers", async () => {
    const result = await judge(job("cpp", "class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        return undefined_name;\n    }\n};"), config);
    expect(result.verdict).toBe("COMPILATION_ERROR");
    expect(result.compileOutput).toMatch(/solution\.cpp:4/);
    expect(result.tests.every((t) => t.verdict === "COMPILATION_ERROR")).toBe(true);
  });

  it("reports Java compilation errors", async () => {
    const result = await judge(job("java", "class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        return nope;\n    }\n}"), config);
    expect(result.verdict).toBe("COMPILATION_ERROR");
    expect(result.compileOutput).toMatch(/Main\.java:3/);
  });

  it("reports runtime errors and shows the traceback only for visible tests", async () => {
    const result = await judge(job("python", "def twoSum(nums, target):\n    raise ValueError('boom')\n"), config);
    expect(result.verdict).toBe("RUNTIME_ERROR");
    const visible = result.tests.find((t) => t.visible)!;
    expect(visible.stderr).toMatch(/ValueError: boom/);
    expect(visible.stderr).toMatch(/solution\.py", line 2/);
  });

  it("does not leak hidden inputs through stderr", async () => {
    const leak = "import sys\ndef twoSum(nums, target):\n    sys.stderr.write('LEAK ' + str(nums))\n    raise SystemExit(1)\n";
    const result = await judge(job("python", leak), config);
    for (const t of result.tests.filter((x) => !x.visible)) expect(JSON.stringify(t)).not.toContain("LEAK");
  });

  it("enforces the time limit, kills the process and removes the container", async () => {
    const started = Date.now();
    const result = await judge(job("python", "def twoSum(nums, target):\n    while True:\n        pass\n", "RUN", { limits: { timeMsPerTest: 500, memoryMb: 256, maxOutputBytes: 65536, totalTimeMs: 20_000 } }), config);
    expect(result.verdict).toBe("TIME_LIMIT_EXCEEDED");
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(leftoverSandboxes()).toEqual([]);
  });

  it("enforces the memory limit", async () => {
    const result = await judge(job("cpp", "class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        vector<char> big(1500u * 1024 * 1024, 1);\n        return {big[0], big[big.size() - 1]};\n    }\n};", "RUN"), config);
    expect(result.verdict).toBe("MEMORY_LIMIT_EXCEEDED");
  });

  it("enforces the output limit", async () => {
    const result = await judge(job("javascript", "function twoSum() { for (;;) process.stdout.write('x'.repeat(4096)); }", "RUN"), config);
    expect(result.verdict).toBe("OUTPUT_LIMIT_EXCEEDED");
    expect(leftoverSandboxes()).toEqual([]);
  });

  it("blocks network access, host secrets and root filesystem writes", async () => {
    const probe = `import os, socket
def twoSum(nums, target):
    report = []
    try:
        socket.create_connection(("1.1.1.1", 80), timeout=2)
        report.append("NETWORK_OPEN")
    except OSError:
        report.append("network_blocked")
    try:
        open("/etc/pwned", "w").write("x")
        report.append("ROOT_WRITABLE")
    except OSError:
        report.append("root_readonly")
    report.append("uid=%d" % os.getuid())
    host_vars = ("IA_CANARY_SECRET", "REDIS_URL", "DATABASE_URL", "AUTH_SECRET", "GOOGLE_GENERATIVE_AI_API_KEY")
    leaked = [k for k in host_vars if k in os.environ]
    report.append("env_clean" if not leaked else "ENV_LEAK:" + ",".join(leaked))
    raise SystemExit(" ".join(report))
`;
    // A secret in the worker's own environment must never reach the sandbox.
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only canary
    process.env.IA_CANARY_SECRET = "canary-value";
    const result = await judge(job("python", probe, "RUN"), config);
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only canary
    delete process.env.IA_CANARY_SECRET;
    const stderr = result.tests[0]!.stderr ?? "";
    expect(stderr).toContain("network_blocked");
    expect(stderr).toContain("root_readonly");
    expect(stderr).toContain("uid=65534");
    expect(stderr).toContain("env_clean");
  });

  it("survives a fork bomb", async () => {
    const bomb = "import os\ndef twoSum(nums, target):\n    while True:\n        try:\n            os.fork()\n        except OSError:\n            pass\n";
    const result = await judge(job("python", bomb, "RUN", { limits: { timeMsPerTest: 1000, memoryMb: 256, maxOutputBytes: 65536, totalTimeMs: 30_000 } }), config);
    expect(["TIME_LIMIT_EXCEEDED", "RUNTIME_ERROR", "MEMORY_LIMIT_EXCEEDED"]).toContain(result.verdict);
    expect(leftoverSandboxes()).toEqual([]);
  });

  it("runs custom input without a comparison", async () => {
    const result = await judge(
      job("python", SOLUTIONS.python, "RUN", { kind: "CUSTOM", tests: [{ id: "custom", input: "3\n1 5 9\n14\n", expected: null, visible: true }] }),
      config,
    );
    expect(result.verdict).toBe("ACCEPTED");
    expect(result.tests[0]!.verdict).toBe("EXECUTED");
    expect(result.tests[0]!.stdout?.trim()).toBe("1 2");
  });

  it("rejects files that do not belong to the language", async () => {
    const bad = job("python", SOLUTIONS.python);
    bad.files = { "evil.sh": "rm -rf /" };
    const result = await judge(bad, config);
    expect(result.verdict).toBe("INTERNAL_ERROR");
  });
});
