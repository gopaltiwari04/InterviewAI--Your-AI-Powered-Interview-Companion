import type { Param, Signature, ValueType } from "../types";
import { usesType } from "./shared";

/** C parameters follow the LeetCode convention: arrays are passed with explicit sizes. */
function cParams(p: Param): string {
  switch (p.type) {
    case "int":
      return `int ${p.name}`;
    case "long":
      return `long long ${p.name}`;
    case "double":
      return `double ${p.name}`;
    case "bool":
      return `bool ${p.name}`;
    case "string":
      return `char* ${p.name}`;
    case "int[]":
      return `int* ${p.name}, int ${p.name}Size`;
    case "int[][]":
      return `int** ${p.name}, int ${p.name}Size, int* ${p.name}ColSize`;
    case "string[]":
      return `char** ${p.name}, int ${p.name}Size`;
    case "ListNode":
      return `struct ListNode* ${p.name}`;
    case "TreeNode":
      return `struct TreeNode* ${p.name}`;
  }
}

const RETURN_TYPE: Record<ValueType, string> = {
  int: "int",
  long: "long long",
  double: "double",
  bool: "bool",
  string: "char*",
  "int[]": "int*",
  "int[][]": "int**",
  "string[]": "char**",
  ListNode: "struct ListNode*",
  TreeNode: "struct TreeNode*",
};

function returnExtras(type: ValueType): string[] {
  if (type === "int[]" || type === "string[]") return ["int* returnSize"];
  if (type === "int[][]") return ["int* returnSize", "int** returnColumnSizes"];
  return [];
}

function defaultBody(type: ValueType): string[] {
  switch (type) {
    case "int":
    case "long":
      return ["return 0;"];
    case "double":
      return ["return 0.0;"];
    case "bool":
      return ["return false;"];
    case "string":
      return ['return "";'];
    case "int[]":
    case "string[]":
      return ["*returnSize = 0;", "return NULL;"];
    case "int[][]":
      return ["*returnSize = 0;", "*returnColumnSizes = NULL;", "return NULL;"];
    case "ListNode":
    case "TreeNode":
      return ["return NULL;"];
  }
}

function cSignature(sig: Signature): string {
  const params = [...sig.params.map(cParams), ...returnExtras(sig.returns)].join(", ");
  return `${RETURN_TYPE[sig.returns]} ${sig.functionName}(${params})`;
}

export function cStarter(sig: Signature): string {
  const lines: string[] = ["// stdio.h, stdlib.h, string.h, stdbool.h, limits.h and math.h are already included."];
  if (usesType(sig, "ListNode")) {
    lines.push("// Definition for singly-linked list (provided by the judge):", "// struct ListNode { int val; struct ListNode *next; };");
  }
  if (usesType(sig, "TreeNode")) {
    lines.push(
      "// Definition for a binary tree node (provided by the judge):",
      "// struct TreeNode { int val; struct TreeNode *left; struct TreeNode *right; };",
    );
  }
  if (sig.returns === "int[]" || sig.returns === "string[]" || sig.returns === "int[][]") {
    lines.push("// Return a malloc'ed array and set *returnSize to its length.");
  }
  if (sig.returns === "int[][]") lines.push("// Also set *returnColumnSizes to a malloc'ed array of row lengths.");
  lines.push("", `${cSignature(sig)} {`, "    // Write your solution here.", ...defaultBody(sig.returns).map((l) => `    ${l}`), "}", "");
  return lines.join("\n");
}

const PRELUDE = `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <limits.h>
#include <math.h>
#include <ctype.h>
#include <stdint.h>
struct ListNode { int val; struct ListNode *next; };
struct TreeNode { int val; struct TreeNode *left; struct TreeNode *right; };`;

const HARNESS = `static char **ia_lines;
static int ia_count, ia_pos;
static char ia_empty[1] = "";
static void ia_read_all(void) {
    size_t cap = 1 << 16, len = 0, r;
    char *buf = malloc(cap);
    while ((r = fread(buf + len, 1, cap - len - 1, stdin)) > 0) {
        len += r;
        if (cap - len <= 1) { cap *= 2; buf = realloc(buf, cap); }
    }
    buf[len] = 0;
    int lines = 1;
    for (size_t i = 0; i < len; i++) if (buf[i] == '\\n') lines++;
    ia_lines = malloc(sizeof(char*) * lines);
    char *start = buf;
    for (size_t i = 0; i <= len; i++) {
        if (i == len || buf[i] == '\\n') {
            buf[i] = 0;
            size_t l = strlen(start);
            if (l > 0 && start[l - 1] == '\\r') start[l - 1] = 0;
            ia_lines[ia_count++] = start;
            start = buf + i + 1;
        }
    }
}
static char* ia_line(void) { return ia_pos < ia_count ? ia_lines[ia_pos++] : ia_empty; }
static int ia_read_int(void) { return (int)strtol(ia_line(), NULL, 10); }
static long long ia_read_long(void) { return strtoll(ia_line(), NULL, 10); }
static double ia_read_double(void) { return strtod(ia_line(), NULL); }
static bool ia_read_bool(void) { return strstr(ia_line(), "true") != NULL; }
static char* ia_read_str(void) { char *s = ia_line(); char *c = malloc(strlen(s) + 1); strcpy(c, s); return c; }
static int* ia_read_int_array(int *size) {
    int n = ia_read_int(); char *p = ia_line();
    int *a = malloc(sizeof(int) * (n > 0 ? n : 1));
    for (int i = 0; i < n; i++) a[i] = (int)strtol(p, &p, 10);
    *size = n; return a;
}
static int** ia_read_int_matrix(int *rows, int **cols) {
    int r = ia_read_int();
    int **m = malloc(sizeof(int*) * (r > 0 ? r : 1));
    int *cs = malloc(sizeof(int) * (r > 0 ? r : 1));
    for (int i = 0; i < r; i++) {
        char *p = ia_line(); int k = (int)strtol(p, &p, 10);
        m[i] = malloc(sizeof(int) * (k > 0 ? k : 1));
        for (int j = 0; j < k; j++) m[i][j] = (int)strtol(p, &p, 10);
        cs[i] = k;
    }
    *rows = r; *cols = cs; return m;
}
static char** ia_read_str_array(int *size) {
    int n = ia_read_int(); char **a = malloc(sizeof(char*) * (n > 0 ? n : 1));
    for (int i = 0; i < n; i++) a[i] = ia_read_str();
    *size = n; return a;
}
static struct ListNode* ia_read_list(void) {
    int n; int *a = ia_read_int_array(&n);
    struct ListNode dummy; dummy.next = NULL; struct ListNode *cur = &dummy;
    for (int i = 0; i < n; i++) {
        struct ListNode *node = malloc(sizeof(struct ListNode));
        node->val = a[i]; node->next = NULL; cur->next = node; cur = node;
    }
    return dummy.next;
}
static struct TreeNode* ia_read_tree(void) {
    int n = ia_read_int(); char *p = ia_line();
    if (n <= 0) return NULL;
    struct TreeNode **nodes = malloc(sizeof(struct TreeNode*) * n);
    int count = 0;
    char *tok = strtok(p, " \\t");
    while (tok && count < n) {
        if (strcmp(tok, "null") == 0) nodes[count++] = NULL;
        else {
            struct TreeNode *node = malloc(sizeof(struct TreeNode));
            node->val = (int)strtol(tok, NULL, 10); node->left = node->right = NULL; nodes[count++] = node;
        }
        tok = strtok(NULL, " \\t");
    }
    if (count == 0 || !nodes[0]) return NULL;
    struct TreeNode **queue = malloc(sizeof(struct TreeNode*) * count);
    int head = 0, tail = 0, i = 1;
    queue[tail++] = nodes[0];
    while (head < tail && i < count) {
        struct TreeNode *node = queue[head++];
        if (i < count) { node->left = nodes[i]; if (nodes[i]) queue[tail++] = nodes[i]; i++; }
        if (i < count) { node->right = nodes[i]; if (nodes[i]) queue[tail++] = nodes[i]; i++; }
    }
    return nodes[0];
}
static void ia_print_int_row(const int *a, int n) {
    for (int i = 0; i < n; i++) printf(i ? " %d" : "%d", a[i]);
    putchar('\\n');
}
static void ia_print_list(struct ListNode *head) {
    int count = 0;
    while (head && count <= 200000) { printf(count++ ? " %d" : "%d", head->val); head = head->next; }
    putchar('\\n');
}
static void ia_print_tree(struct TreeNode *root) {
    int cap = 1024, size = 0, head = 0;
    struct TreeNode **q = malloc(sizeof(struct TreeNode*) * cap);
    q[size++] = root;
    while (head < size && size <= 400000) {
        struct TreeNode *node = q[head++];
        if (!node) continue;
        if (size + 2 > cap) { cap *= 2; q = realloc(q, sizeof(struct TreeNode*) * cap); }
        q[size++] = node->left; q[size++] = node->right;
    }
    int end = size;
    while (end > 0 && !q[end - 1]) end--;
    for (int i = 0; i < end; i++) {
        if (i) putchar(' ');
        if (q[i]) printf("%d", q[i]->val); else fputs("null", stdout);
    }
    putchar('\\n');
}`;

function readStatement(p: Param, i: number): string {
  switch (p.type) {
    case "int":
      return `    int a${i} = ia_read_int();`;
    case "long":
      return `    long long a${i} = ia_read_long();`;
    case "double":
      return `    double a${i} = ia_read_double();`;
    case "bool":
      return `    bool a${i} = ia_read_bool();`;
    case "string":
      return `    char* a${i} = ia_read_str();`;
    case "int[]":
      return `    int a${i}Size; int* a${i} = ia_read_int_array(&a${i}Size);`;
    case "int[][]":
      return `    int a${i}Size; int* a${i}Cols; int** a${i} = ia_read_int_matrix(&a${i}Size, &a${i}Cols);`;
    case "string[]":
      return `    int a${i}Size; char** a${i} = ia_read_str_array(&a${i}Size);`;
    case "ListNode":
      return `    struct ListNode* a${i} = ia_read_list();`;
    case "TreeNode":
      return `    struct TreeNode* a${i} = ia_read_tree();`;
  }
}

function callArgs(p: Param, i: number): string {
  if (p.type === "int[]" || p.type === "string[]") return `a${i}, a${i}Size`;
  if (p.type === "int[][]") return `a${i}, a${i}Size, a${i}Cols`;
  return `a${i}`;
}

/** Appends the C out-parameters (e.g. `&rs`) to a call expression like `f(a0, a1)`. */
function withOut(call: string, extra: string): string {
  return call.endsWith("()") ? `${call.slice(0, -1)}${extra})` : `${call.slice(0, -1)}, ${extra})`;
}

function printResult(type: ValueType, call: string): string {
  switch (type) {
    case "int":
      return `    printf("%d\\n", ${call});`;
    case "long":
      return `    printf("%lld\\n", ${call});`;
    case "double":
      return `    printf("%.5f\\n", ${call});`;
    case "bool":
      return `    puts(${call} ? "true" : "false");`;
    case "string":
      return `    { char* r = ${call}; printf("%s\\n", r ? r : ""); }`;
    case "int[]":
      return `    { int rs = 0; int* r = ${withOut(call, "&rs")}; ia_print_int_row(r, rs); }`;
    case "string[]":
      return `    { int rs = 0; char** r = ${withOut(call, "&rs")}; printf("%d\\n", rs); for (int i = 0; i < rs; i++) printf("%s\\n", r[i] ? r[i] : ""); }`;
    case "int[][]":
      return `    { int rs = 0; int* rc = NULL; int** r = ${withOut(call, "&rs, &rc")}; printf("%d\\n", rs); for (int i = 0; i < rs; i++) ia_print_int_row(r[i], rc ? rc[i] : 0); }`;
    case "ListNode":
      return `    ia_print_list(${call});`;
    case "TreeNode":
      return `    ia_print_tree(${call});`;
  }
}

/** Builds main.c with #line directives so compiler errors refer to the candidate's own lines. */
export function cProgram(sig: Signature, userCode: string): string {
  const reads = sig.params.map(readStatement).join("\n");
  const call = `${sig.functionName}(${sig.params.map(callArgs).join(", ")})`;
  return `${PRELUDE}
#line 1 "solution.c"
${userCode}
#line 1 "harness.c"
${HARNESS}
int main(void) {
    ia_read_all();
${reads}
${printResult(sig.returns, call)}
    fflush(stdout);
    return 0;
}
`;
}

