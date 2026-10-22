/**
 * Problem model shared by the web app, the problem bank and the judge.
 *
 * Every coding problem has a typed function signature. The judge never parses
 * candidate output with an LLM: a generated harness reads the arguments from
 * stdin, calls the candidate's function and prints the return value in a
 * canonical text form, which is compared with the expected text.
 */

export const LANGUAGES = ["python", "javascript", "cpp", "java", "c"] as const;
export type Language = (typeof LANGUAGES)[number];

export const VALUE_TYPES = [
  "int",
  "long",
  "double",
  "bool",
  "string",
  "int[]",
  "int[][]",
  "string[]",
  "ListNode",
  "TreeNode",
] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const TOPICS = [
  "arrays-strings",
  "hashing",
  "two-pointers",
  "sliding-window",
  "binary-search",
  "linked-list",
  "stack-queue",
  "trees",
  "heap",
  "graphs",
  "backtracking",
  "dynamic-programming",
  "greedy",
  "sorting-searching",
] as const;
export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABELS: Record<Topic, string> = {
  "arrays-strings": "Arrays & Strings",
  hashing: "Hash Maps & Sets",
  "two-pointers": "Two Pointers",
  "sliding-window": "Sliding Window",
  "binary-search": "Binary Search",
  "linked-list": "Linked Lists",
  "stack-queue": "Stacks & Queues",
  trees: "Trees & BSTs",
  heap: "Heaps & Priority Queues",
  graphs: "Graphs, BFS & DFS",
  backtracking: "Recursion & Backtracking",
  "dynamic-programming": "Dynamic Programming",
  greedy: "Greedy",
  "sorting-searching": "Sorting & Searching",
};

export interface Param {
  name: string;
  type: ValueType;
}

export interface Signature {
  functionName: string;
  params: Param[];
  returns: ValueType;
}

/**
 * How candidate output is compared with the expected output.
 * - exact: line-by-line equality (trailing whitespace ignored).
 * - unordered: the answer may be returned in any order. For `int[]` the
 *   values are compared as a multiset; for `int[][]` / `string[]` the rows are
 *   compared as a multiset, and `sortInner` also ignores order within a row.
 * - float: numeric comparison with an absolute/relative tolerance.
 */
export type Comparator =
  | { kind: "exact" }
  | { kind: "unordered"; sortInner?: boolean }
  | { kind: "float"; tolerance: number };

/** A JSON value used as a function argument or return value. */
export type Value = number | boolean | string | null | Value[];

export interface Example {
  args: Value[];
  output: Value;
  explanation?: string;
}

/** The part of a problem that is safe to send to the browser. */
export interface PublicProblem {
  slug: string;
  version: number;
  title: string;
  difficulty: Difficulty;
  topics: Topic[];
  statement: string;
  inputDescription: string;
  outputDescription: string;
  constraints: string[];
  examples: PublicExample[];
  signature: Signature;
  starterCode: Record<Language, string>;
  timeLimitMs: number;
  source: "BANK" | "AI_GENERATED";
}

export interface PublicExample {
  /** Human-readable arguments, e.g. `nums = [2,7,11,15], target = 9`. */
  input: string;
  /** Human-readable expected return value. */
  output: string;
  /** The exact stdin the harness reads, useful for custom runs. */
  stdin: string;
  explanation?: string;
}

/** A judged test case. Hidden cases never leave the server. */
export interface JudgeTestCase {
  id: string;
  input: string;
  expected: string;
  visible: boolean;
}
