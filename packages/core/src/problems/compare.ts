import type { Comparator, ValueType } from "./types";

/** Normalises line endings, trailing spaces and trailing blank lines. */
export function normalizeOutput(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+$/, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

const tokens = (line: string): string[] => line.split(/\s+/).filter(Boolean);

function canonicalUnordered(lines: string[], returns: ValueType, sortInner: boolean): string[] {
  if (returns === "int[]" || returns === "ListNode") {
    return [tokens(lines[0] ?? "").sort().join(" ")];
  }
  if (returns === "int[][]" || returns === "string[]") {
    const count = Number.parseInt(lines[0] ?? "0", 10);
    const rows: string[] = [];
    for (let i = 0; i < (Number.isFinite(count) ? count : 0); i++) {
      const row = lines[i + 1] ?? "";
      rows.push(sortInner && returns === "int[][]" ? tokens(row).sort().join(" ") : row);
    }
    // Lines beyond the declared count are kept so extra output is still a mismatch.
    const extra = lines.slice(rows.length + 1);
    return [String(count), ...rows.sort(), ...extra];
  }
  return lines;
}

function floatEqual(a: string, b: string, tolerance: number): boolean {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return a === b;
  return Math.abs(x - y) <= tolerance * Math.max(1, Math.abs(y));
}

/**
 * Compares a program's stdout with the expected output. Runs inside the
 * judge, so it must stay deterministic and dependency-free.
 */
export function outputsMatch(actual: string, expected: string, comparator: Comparator, returns: ValueType): boolean {
  const a = normalizeOutput(actual);
  const e = normalizeOutput(expected);

  if (comparator.kind === "float") {
    if (a.length !== e.length) return false;
    return a.every((line, i) => {
      const at = tokens(line);
      const et = tokens(e[i] ?? "");
      return at.length === et.length && at.every((t, j) => floatEqual(t, et[j] ?? "", comparator.tolerance));
    });
  }

  const left = comparator.kind === "unordered" ? canonicalUnordered(a, returns, Boolean(comparator.sortInner)) : a;
  const right = comparator.kind === "unordered" ? canonicalUnordered(e, returns, Boolean(comparator.sortInner)) : e;
  return left.length === right.length && left.every((line, i) => line === right[i]);
}
