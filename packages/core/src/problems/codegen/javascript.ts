import type { Signature, ValueType } from "../types";
import { usesType } from "./shared";

const JSDOC: Record<ValueType, string> = {
  int: "number",
  long: "number",
  double: "number",
  bool: "boolean",
  string: "string",
  "int[]": "number[]",
  "int[][]": "number[][]",
  "string[]": "string[]",
  ListNode: "ListNode | null",
  TreeNode: "TreeNode | null",
};

const READER: Record<ValueType, string> = {
  int: "__int()",
  long: "__int()",
  double: "__float()",
  bool: "__bool()",
  string: "__line()",
  "int[]": "__intList()",
  "int[][]": "__intMatrix()",
  "string[]": "__strList()",
  ListNode: "__listNode()",
  TreeNode: "__tree()",
};

const FORMATTER: Record<ValueType, string> = {
  int: "__fmtInt",
  long: "__fmtInt",
  double: "__fmtFloat",
  bool: "__fmtBool",
  string: "__fmtStr",
  "int[]": "__fmtIntList",
  "int[][]": "__fmtIntMatrix",
  "string[]": "__fmtStrList",
  ListNode: "__fmtListNode",
  TreeNode: "__fmtTree",
};

export function javascriptStarter(sig: Signature): string {
  const lines: string[] = [];
  if (usesType(sig, "ListNode")) {
    lines.push(
      "// Definition for singly-linked list (provided by the judge):",
      "// class ListNode { constructor(val = 0, next = null) { this.val = val; this.next = next; } }",
      "",
    );
  }
  if (usesType(sig, "TreeNode")) {
    lines.push(
      "// Definition for a binary tree node (provided by the judge):",
      "// class TreeNode { constructor(val = 0, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }",
      "",
    );
  }
  lines.push("/**");
  for (const p of sig.params) lines.push(` * @param {${JSDOC[p.type]}} ${p.name}`);
  lines.push(` * @return {${JSDOC[sig.returns]}}`, " */");
  lines.push(`function ${sig.functionName}(${sig.params.map((p) => p.name).join(", ")}) {`, "  // Write your solution here.", "}", "");
  return lines.join("\n");
}

/** Builds main.js, which loads solution.js with vm so stack traces keep the candidate's line numbers. */
export function javascriptHarness(sig: Signature): string {
  const reads = sig.params.map((p, i) => `const __a${i} = ${READER[p.type]};`).join("\n");
  const call = sig.params.map((_, i) => `__a${i}`).join(", ");
  return `"use strict";
const __fs = require("fs");
const __vm = require("vm");
const __path = require("path");

class ListNode {
  constructor(val = 0, next = null) {
    this.val = val;
    this.next = next;
  }
}
class TreeNode {
  constructor(val = 0, left = null, right = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}
globalThis.ListNode = ListNode;
globalThis.TreeNode = TreeNode;

const __lines = __fs.readFileSync(0, "utf8").split("\\n");
let __pos = 0;
const __line = () => (__pos < __lines.length ? __lines[__pos++] : "").replace(/\\r$/, "");
const __int = () => Number.parseInt(__line().trim(), 10);
const __float = () => Number.parseFloat(__line().trim());
const __bool = () => __line().trim() === "true";
const __tokens = (s) => s.split(/\\s+/).filter(Boolean);
const __intList = () => {
  const n = __int();
  return __tokens(__line()).slice(0, n).map(Number);
};
const __intMatrix = () => {
  const r = __int();
  const rows = [];
  for (let i = 0; i < r; i++) {
    const t = __tokens(__line()).map(Number);
    const k = t.length ? t[0] : 0;
    rows.push(t.slice(1, 1 + k));
  }
  return rows;
};
const __strList = () => {
  const n = __int();
  const out = [];
  for (let i = 0; i < n; i++) out.push(__line());
  return out;
};
const __listNode = () => {
  const dummy = new ListNode();
  let cur = dummy;
  for (const v of __intList()) {
    cur.next = new ListNode(v);
    cur = cur.next;
  }
  return dummy.next;
};
const __tree = () => {
  const n = __int();
  const t = __tokens(__line()).slice(0, n);
  if (t.length === 0 || t[0] === "null") return null;
  const root = new TreeNode(Number(t[0]));
  const queue = [root];
  let head = 0;
  let i = 1;
  while (head < queue.length && i < t.length) {
    const node = queue[head++];
    if (i < t.length && t[i] !== "null") {
      node.left = new TreeNode(Number(t[i]));
      queue.push(node.left);
    }
    i++;
    if (i < t.length && t[i] !== "null") {
      node.right = new TreeNode(Number(t[i]));
      queue.push(node.right);
    }
    i++;
  }
  return root;
};

const __fmtInt = (v) => String(typeof v === "bigint" ? v : Math.trunc(Number(v)));
const __fmtFloat = (v) => Number(v).toFixed(5);
const __fmtBool = (v) => (v ? "true" : "false");
const __fmtStr = (v) => (v === null || v === undefined ? "" : String(v));
const __fmtIntList = (v) => (v || []).map((x) => __fmtInt(x)).join(" ");
const __fmtIntMatrix = (v) => [String((v || []).length), ...(v || []).map((r) => __fmtIntList(r))].join("\\n");
const __fmtStrList = (v) => [String((v || []).length), ...(v || []).map((s) => String(s))].join("\\n");
const __fmtListNode = (head) => {
  const out = [];
  while (head && out.length <= 200000) {
    out.push(String(head.val));
    head = head.next;
  }
  return out.join(" ");
};
const __fmtTree = (root) => {
  const out = [];
  const queue = [root];
  let head = 0;
  while (head < queue.length && out.length <= 400000) {
    const node = queue[head++];
    if (!node) {
      out.push("null");
      continue;
    }
    out.push(String(node.val));
    queue.push(node.left || null, node.right || null);
  }
  while (out.length && out[out.length - 1] === "null") out.pop();
  return out.join(" ");
};

const __source = __fs.readFileSync(__path.join(__dirname, "solution.js"), "utf8");
__vm.runInThisContext(__source, { filename: "solution.js" });
const __fn = __vm.runInThisContext("typeof ${sig.functionName} === 'function' ? ${sig.functionName} : undefined");
if (typeof __fn !== "function") {
  process.stderr.write("Function ${sig.functionName} was not found. Keep the function name from the starter code.\\n");
  process.exit(1);
}
${reads}
const __result = __fn(${call});
process.stdout.write(${FORMATTER[sig.returns]}(__result) + "\\n");
`;
}
