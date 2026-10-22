import type { Param, Signature, Value, ValueType } from "./types";

/**
 * Text encoding used between the judge and the generated harnesses.
 *
 * Arguments are written to stdin one after another:
 *   int / long / double / bool   one line
 *   string                       one line (raw, may contain spaces)
 *   int[] / ListNode             a line with n, then a line with n values
 *   int[][]                      a line with r, then r lines "k v1 .. vk"
 *   string[]                     a line with n, then n lines
 *   TreeNode                     a line with n, then n level-order tokens ("null" for gaps)
 *
 * Return values are printed in the same shape without the leading count for
 * one-line types: int[] / ListNode / TreeNode print a single line, int[][] and
 * string[] print a count line followed by one row per line.
 */

export class CodecError extends Error {}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

function assertIntArray(v: unknown, what: string): asserts v is number[] {
  if (!Array.isArray(v) || !v.every(isInt)) throw new CodecError(`${what} must be an array of integers`);
}

/** Checks that a JSON value matches a declared type. Used for curated and AI-generated tests. */
export function validateValue(type: ValueType, value: unknown, what = "value"): void {
  switch (type) {
    case "int":
      if (!isInt(value) || value < -2147483648 || value > 2147483647) throw new CodecError(`${what} must be a 32-bit integer`);
      return;
    case "long":
      if (!isInt(value) || !Number.isSafeInteger(value)) throw new CodecError(`${what} must be a safe integer`);
      return;
    case "double":
      if (typeof value !== "number" || !Number.isFinite(value)) throw new CodecError(`${what} must be a finite number`);
      return;
    case "bool":
      if (typeof value !== "boolean") throw new CodecError(`${what} must be a boolean`);
      return;
    case "string":
      if (typeof value !== "string" || /[\r\n]/.test(value)) throw new CodecError(`${what} must be a single-line string`);
      return;
    case "int[]":
    case "ListNode":
      assertIntArray(value, what);
      return;
    case "int[][]":
      if (!Array.isArray(value)) throw new CodecError(`${what} must be an array of integer arrays`);
      value.forEach((row, i) => assertIntArray(row, `${what}[${i}]`));
      return;
    case "string[]":
      if (!Array.isArray(value) || !value.every((s) => typeof s === "string" && !/[\r\n]/.test(s)))
        throw new CodecError(`${what} must be an array of single-line strings`);
      return;
    case "TreeNode":
      if (!Array.isArray(value) || !value.every((t) => t === null || isInt(t)))
        throw new CodecError(`${what} must be a level-order array of integers and nulls`);
      if (value.length > 0 && value[0] === null) throw new CodecError(`${what} must not start with null`);
      return;
  }
}

function encodeArgLines(type: ValueType, value: Value): string[] {
  switch (type) {
    case "int":
    case "long":
    case "double":
      return [String(value)];
    case "bool":
      return [value ? "true" : "false"];
    case "string":
      return [String(value)];
    case "int[]":
    case "ListNode": {
      const arr = value as number[];
      return [String(arr.length), arr.join(" ")];
    }
    case "int[][]": {
      const rows = value as number[][];
      return [String(rows.length), ...rows.map((r) => [r.length, ...r].join(" "))];
    }
    case "string[]": {
      const arr = value as string[];
      return [String(arr.length), ...arr];
    }
    case "TreeNode": {
      const tokens = trimTree(value as (number | null)[]);
      return [String(tokens.length), tokens.map((t) => (t === null ? "null" : String(t))).join(" ")];
    }
  }
}

export function encodeInput(signature: Signature, args: Value[]): string {
  if (args.length !== signature.params.length) {
    throw new CodecError(`expected ${signature.params.length} arguments, got ${args.length}`);
  }
  const lines = signature.params.flatMap((p: Param, i: number) => {
    const arg = args[i] as Value;
    validateValue(p.type, arg, p.name);
    return encodeArgLines(p.type, arg);
  });
  return lines.join("\n") + "\n";
}

function trimTree(tokens: (number | null)[]): (number | null)[] {
  let end = tokens.length;
  while (end > 0 && tokens[end - 1] === null) end--;
  return tokens.slice(0, end);
}

export function encodeOutput(type: ValueType, value: Value): string {
  validateValue(type, value, "return value");
  let lines: string[];
  switch (type) {
    case "int":
    case "long":
      lines = [String(value)];
      break;
    case "double":
      lines = [(value as number).toFixed(5)];
      break;
    case "bool":
      lines = [value ? "true" : "false"];
      break;
    case "string":
      lines = [String(value)];
      break;
    case "int[]":
    case "ListNode":
      lines = [(value as number[]).join(" ")];
      break;
    case "int[][]": {
      const rows = value as number[][];
      lines = [String(rows.length), ...rows.map((r) => r.join(" "))];
      break;
    }
    case "string[]": {
      const arr = value as string[];
      lines = [String(arr.length), ...arr];
      break;
    }
    case "TreeNode":
      lines = [trimTree(value as (number | null)[]).map((t) => (t === null ? "null" : String(t))).join(" ")];
      break;
  }
  return lines.join("\n") + "\n";
}

/** JSON-like rendering for problem statements, e.g. `[2,7,11,15]` or `"abc"`. */
export function formatValue(value: Value): string {
  return JSON.stringify(value);
}

export function formatArgs(params: Param[], args: Value[]): string {
  return params.map((p, i) => `${p.name} = ${formatValue(args[i] as Value)}`).join(", ");
}
