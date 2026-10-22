/**
 * Verifies the generated harnesses in every language against a real sandbox:
 *  1. an "echo" function for every value type must round-trip edge-case values,
 *  2. every problem's starter code must compile (C, C++, Java) or parse (Python, JS).
 * Run: pnpm --filter code-executor test:docker
 */
import { LANGUAGES as LANGUAGE_IDS, assembleProgram, encodeInput, encodeOutput, starterCode, type Language, type Signature, type Value, type ValueType } from "@repo/core/problems";
import { ALL_PROBLEM_SLUGS, getProblemDefinition } from "@repo/problem-bank";
import { describe, expect, it } from "vitest";
import { judge } from "../../src/judge";
import { LANGUAGES } from "../../src/languages";
import { Sandbox, type SandboxConfig } from "../../src/sandbox";

const config: SandboxConfig = { dockerBin: process.env.DOCKER_BIN || "docker", cpus: 1, pidsLimit: 128, lifetimeSeconds: 600 };

const SAMPLES: Record<ValueType, Value[]> = {
  int: [0, -2147483648, 2147483647],
  long: [9007199254740991, -5],
  double: [2.5, -0.125],
  bool: [true, false],
  string: ["hello world", "", "a,b;c:d"],
  "int[]": [[], [1, -2, 3]],
  "int[][]": [[], [[]], [[1, 2], [], [3]]],
  "string[]": [[], ["a b", "", "c"]],
  ListNode: [[], [1, 2, 3]],
  TreeNode: [[], [1], [1, null, 2, 3], [5, 4, 8, 11, null, 13, 4, 7, 2, null, null, null, 1]],
};

function echoCode(language: Language, sig: Signature): string {
  const starter = starterCode(language, sig);
  const t = sig.returns;
  switch (language) {
    case "python":
      return starter.replace("    pass", "    return x");
    case "javascript":
      return starter.replace("  // Write your solution here.", "  return x;");
    case "cpp":
    case "java":
      return starter.replace(/return [^;]+;/, "return x;");
    case "c": {
      const body =
        t === "int[]" || t === "string[]"
          ? "*returnSize = xSize; return x;"
          : t === "int[][]"
            ? "*returnSize = xSize; *returnColumnSizes = xColSize; return x;"
            : "return x;";
      return starter.replace(/\/\/ Write your solution here\.[\s\S]*?\n}/, `${body}\n}`);
    }
  }
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) await fn(items[next++] as T);
    }),
  );
}

describe("generated harnesses", () => {
  it("round-trip every value type in every language", async () => {
    const cases = LANGUAGE_IDS.flatMap((language) => (Object.keys(SAMPLES) as ValueType[]).map((type) => ({ language, type })));
    const failures: string[] = [];
    await pool(cases, 4, async ({ language, type }) => {
      const sig: Signature = { functionName: "echo", params: [{ name: "x", type }], returns: type };
      const values = SAMPLES[type];
      const result = await judge(
        {
          submissionId: `echo-${language}-${type}`,
          roomId: null,
          kind: "SUBMIT",
          language,
          files: assembleProgram(language, sig, echoCode(language, sig)),
          returns: type,
          comparator: type === "double" ? { kind: "float", tolerance: 1e-6 } : { kind: "exact" },
          tests: values.map((v, i) => ({ id: `v${i}`, input: encodeInput(sig, [v]), expected: encodeOutput(type, v), visible: true })),
          limits: { timeMsPerTest: 3000, memoryMb: 256, maxOutputBytes: 65536, totalTimeMs: 120_000 },
        },
        config,
      );
      if (result.verdict !== "ACCEPTED") {
        const bad = result.tests.find((t) => t.verdict !== "ACCEPTED");
        failures.push(`${language}/${type}: ${result.verdict} ${result.compileOutput ?? ""} ${bad?.stdout ?? ""} ${bad?.stderr ?? ""}`.slice(0, 800));
      }
    });
    expect(failures).toEqual([]);
  });

  it.each(["cpp", "c", "java"] as const)("compile every %s starter", async (language) => {
    const lang = LANGUAGES[language];
    const sandbox = await Sandbox.create(lang.image, lang.minMemoryMb, config);
    const failures: string[] = [];
    try {
      for (const slug of ALL_PROBLEM_SLUGS) {
        const def = getProblemDefinition(slug)!;
        const files = assembleProgram(language, def.signature, starterCode(language, def.signature));
        for (const [name, content] of Object.entries(files)) await sandbox.writeFile(name, content);
        const res = await sandbox.exec(lang.compile!, { timeoutMs: 60_000, maxStdoutBytes: 65536 });
        if (res.exitCode !== 0) failures.push(`${slug}: ${res.stderr.slice(0, 600)}`);
      }
    } finally {
      await sandbox.destroy();
    }
    expect(failures).toEqual([]);
  }, 900_000);

  it.each(["python", "javascript"] as const)("parse every %s starter", async (language) => {
    const lang = LANGUAGES[language];
    const sandbox = await Sandbox.create(lang.image, lang.minMemoryMb, config);
    const failures: string[] = [];
    try {
      for (const slug of ALL_PROBLEM_SLUGS) {
        const def = getProblemDefinition(slug)!;
        const files = assembleProgram(language, def.signature, starterCode(language, def.signature));
        for (const [name, content] of Object.entries(files)) await sandbox.writeFile(name, content);
        const check =
          language === "python"
            ? ["python3", "-c", "import ast,sys; [ast.parse(open(f).read(), f) for f in ('solution.py','main.py')]"]
            : ["sh", "-c", "node --check solution.js && node --check main.js"];
        const res = await sandbox.exec(check, { timeoutMs: 30_000, maxStdoutBytes: 65536 });
        if (res.exitCode !== 0) failures.push(`${slug}: ${res.stderr.slice(0, 600)}`);
      }
    } finally {
      await sandbox.destroy();
    }
    expect(failures).toEqual([]);
  }, 600_000);
});
