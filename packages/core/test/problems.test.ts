import { describe, expect, it } from "vitest";
import {
  CodecError,
  assembleProgram,
  encodeInput,
  encodeOutput,
  formatArgs,
  normalizeOutput,
  outputsMatch,
  starterCode,
  validateValue,
  type Signature,
} from "../src/problems";

const sig: Signature = {
  functionName: "f",
  params: [
    { name: "nums", type: "int[]" },
    { name: "grid", type: "int[][]" },
    { name: "words", type: "string[]" },
    { name: "root", type: "TreeNode" },
    { name: "s", type: "string" },
  ],
  returns: "int",
};

describe("codec", () => {
  it("encodes arguments in the documented line format", () => {
    const input = encodeInput(sig, [[1, 2, 3], [[1], [], [2, 3]], ["a b", ""], [1, null, 2, null], "hello world"]);
    expect(input).toBe("3\n1 2 3\n3\n1 1\n0\n2 2 3\n2\na b\n\n3\n1 null 2\nhello world\n");
  });

  it("encodes empty arrays with an empty values line", () => {
    expect(encodeInput({ functionName: "g", params: [{ name: "a", type: "int[]" }], returns: "int" }, [[]])).toBe("0\n\n");
  });

  it("rejects values that do not match the declared type", () => {
    expect(() => validateValue("int", 1.5)).toThrow(CodecError);
    expect(() => validateValue("int", 2 ** 31)).toThrow(CodecError);
    expect(() => validateValue("string", "a\nb")).toThrow(CodecError);
    expect(() => validateValue("TreeNode", [null, 1])).toThrow(CodecError);
    expect(() => validateValue("int[][]", [[1], ["x"]])).toThrow(CodecError);
    expect(() => encodeInput(sig, [[1]])).toThrow(CodecError);
  });

  it("formats outputs canonically", () => {
    expect(encodeOutput("double", 2.5)).toBe("2.50000\n");
    expect(encodeOutput("bool", false)).toBe("false\n");
    expect(encodeOutput("int[][]", [[1, 2], []])).toBe("2\n1 2\n\n");
    expect(encodeOutput("TreeNode", [1, null, 2, null, null])).toBe("1 null 2\n");
  });

  it("formats human-readable arguments", () => {
    expect(formatArgs(sig.params.slice(0, 1), [[2, 7]])).toBe("nums = [2,7]");
  });
});

describe("output comparison", () => {
  it("ignores trailing whitespace and CRLF", () => {
    expect(normalizeOutput("1 2 \r\n\n\n")).toEqual(["1 2"]);
    expect(outputsMatch("5\r\n", "5\n", { kind: "exact" }, "int")).toBe(true);
    expect(outputsMatch("5 \n\n", "5\n", { kind: "exact" }, "int")).toBe(true);
    expect(outputsMatch("6\n", "5\n", { kind: "exact" }, "int")).toBe(false);
  });

  it("supports unordered arrays and rows", () => {
    expect(outputsMatch("1 0\n", "0 1\n", { kind: "unordered" }, "int[]")).toBe(true);
    expect(outputsMatch("2\n3 2 -1\n1 0 -1\n", "2\n-1 0 1\n-1 -1 2\n", { kind: "unordered", sortInner: true }, "int[][]")).toBe(false);
    expect(outputsMatch("2\n2 -1 -1\n1 0 -1\n", "2\n-1 0 1\n-1 -1 2\n", { kind: "unordered", sortInner: true }, "int[][]")).toBe(true);
    expect(outputsMatch("2\nb\na\n", "2\na\nb\n", { kind: "unordered" }, "string[]")).toBe(true);
    // Order inside a row matters unless sortInner is set.
    expect(outputsMatch("1\n2 1\n", "1\n1 2\n", { kind: "unordered" }, "int[][]")).toBe(false);
    // Extra rows are a mismatch even if the count line is right.
    expect(outputsMatch("1\n1\n2\n", "1\n1\n", { kind: "unordered" }, "int[][]")).toBe(false);
  });

  it("compares floats with tolerance", () => {
    expect(outputsMatch("2.500001\n", "2.50000\n", { kind: "float", tolerance: 1e-5 }, "double")).toBe(true);
    expect(outputsMatch("2.6\n", "2.50000\n", { kind: "float", tolerance: 1e-5 }, "double")).toBe(false);
    expect(outputsMatch("nan\n", "2.50000\n", { kind: "float", tolerance: 1e-5 }, "double")).toBe(false);
  });
});

describe("code generation", () => {
  const twoSum: Signature = {
    functionName: "twoSum",
    params: [
      { name: "nums", type: "int[]" },
      { name: "target", type: "int" },
    ],
    returns: "int[]",
  };

  it("produces idiomatic starter code for each language", () => {
    expect(starterCode("python", twoSum)).toContain("def twoSum(nums: List[int], target: int) -> List[int]:");
    expect(starterCode("javascript", twoSum)).toContain("function twoSum(nums, target)");
    expect(starterCode("cpp", twoSum)).toContain("vector<int> twoSum(vector<int>& nums, int target)");
    expect(starterCode("java", twoSum)).toContain("public int[] twoSum(int[] nums, int target)");
    expect(starterCode("c", twoSum)).toContain("int* twoSum(int* nums, int numsSize, int target, int* returnSize)");
  });

  it("keeps candidate line numbers stable in compiled languages", () => {
    const cpp = assembleProgram("cpp", twoSum, "class Solution {};")["main.cpp"]!;
    expect(cpp).toContain('#line 1 "solution.cpp"\nclass Solution {};');
    const java = assembleProgram("java", twoSum, "class Solution {}")["Main.java"]!;
    // Imports share line 1 with the candidate's code.
    expect(java.split("\n")[0]).toMatch(/^import java\.util\.\*;.*class Solution \{\}$/);
    const c = assembleProgram("c", twoSum, "int x;")["main.c"]!;
    expect(c).toContain('#line 1 "solution.c"\nint x;');
  });

  it("keeps candidate code in a separate file for interpreted languages", () => {
    expect(Object.keys(assembleProgram("python", twoSum, "x"))).toEqual(["solution.py", "main.py"]);
    expect(Object.keys(assembleProgram("javascript", twoSum, "x"))).toEqual(["solution.js", "main.js"]);
  });
});
