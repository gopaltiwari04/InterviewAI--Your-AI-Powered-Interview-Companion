import type { Signature, ValueType } from "../types";
import { usesType } from "./shared";

const JAVA_TYPE: Record<ValueType, string> = {
  int: "int",
  long: "long",
  double: "double",
  bool: "boolean",
  string: "String",
  "int[]": "int[]",
  "int[][]": "int[][]",
  "string[]": "String[]",
  ListNode: "ListNode",
  TreeNode: "TreeNode",
};

const DEFAULT_RETURN: Record<ValueType, string> = {
  int: "0",
  long: "0L",
  double: "0.0",
  bool: "false",
  string: '""',
  "int[]": "new int[0]",
  "int[][]": "new int[0][]",
  "string[]": "new String[0]",
  ListNode: "null",
  TreeNode: "null",
};

const READER: Record<ValueType, string> = {
  int: "readInt()",
  long: "readLong()",
  double: "readDouble()",
  bool: "readBool()",
  string: "line()",
  "int[]": "readIntArray()",
  "int[][]": "readIntMatrix()",
  "string[]": "readStrArray()",
  ListNode: "readListNode()",
  TreeNode: "readTree()",
};

/** Imports are placed on line 1 with the candidate's first line, so compiler line numbers stay accurate. */
const IMPORTS = "import java.util.*; import java.util.stream.*; import java.io.*; ";

export function javaStarter(sig: Signature): string {
  const lines: string[] = ["// java.util.*, java.util.stream.* and java.io.* are already imported. Keep the class name Solution."];
  if (usesType(sig, "ListNode")) {
    lines.push(
      "// Definition for singly-linked list (provided by the judge):",
      "// class ListNode { int val; ListNode next; ListNode() {} ListNode(int val) { this.val = val; } ListNode(int val, ListNode next) { ... } }",
    );
  }
  if (usesType(sig, "TreeNode")) {
    lines.push(
      "// Definition for a binary tree node (provided by the judge):",
      "// class TreeNode { int val; TreeNode left; TreeNode right; TreeNode() {} TreeNode(int val) { this.val = val; } ... }",
    );
  }
  const params = sig.params.map((p) => `${JAVA_TYPE[p.type]} ${p.name}`).join(", ");
  lines.push(
    "",
    "class Solution {",
    `    public ${JAVA_TYPE[sig.returns]} ${sig.functionName}(${params}) {`,
    "        // Write your solution here.",
    `        return ${DEFAULT_RETURN[sig.returns]};`,
    "    }",
    "}",
    "",
  );
  return lines.join("\n");
}

const HARNESS = `
class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}

class TreeNode {
    int val;
    TreeNode left;
    TreeNode right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; }
}

public class Main {
    static String[] L;
    static int P = 0;
    static String line() { String s = P < L.length ? L[P++] : ""; return s.endsWith("\\r") ? s.substring(0, s.length() - 1) : s; }
    static String[] tokens(String s) { s = s.trim(); return s.isEmpty() ? new String[0] : s.split("\\\\s+"); }
    static int readInt() { return Integer.parseInt(line().trim()); }
    static long readLong() { return Long.parseLong(line().trim()); }
    static double readDouble() { return Double.parseDouble(line().trim()); }
    static boolean readBool() { return line().trim().equals("true"); }
    static int[] readIntArray() {
        int n = readInt(); String[] t = tokens(line()); int[] a = new int[Math.min(n, t.length)];
        for (int i = 0; i < a.length; i++) a[i] = Integer.parseInt(t[i]);
        return a;
    }
    static int[][] readIntMatrix() {
        int r = readInt(); int[][] m = new int[r][];
        for (int i = 0; i < r; i++) {
            String[] t = tokens(line()); int k = t.length == 0 ? 0 : Integer.parseInt(t[0]);
            m[i] = new int[Math.min(k, Math.max(0, t.length - 1))];
            for (int j = 0; j < m[i].length; j++) m[i][j] = Integer.parseInt(t[j + 1]);
        }
        return m;
    }
    static String[] readStrArray() { int n = readInt(); String[] a = new String[n]; for (int i = 0; i < n; i++) a[i] = line(); return a; }
    static ListNode readListNode() {
        ListNode dummy = new ListNode(); ListNode cur = dummy;
        for (int v : readIntArray()) { cur.next = new ListNode(v); cur = cur.next; }
        return dummy.next;
    }
    static TreeNode readTree() {
        int n = readInt(); String[] t = tokens(line());
        if (t.length > n) t = Arrays.copyOf(t, n);
        if (t.length == 0 || t[0].equals("null")) return null;
        TreeNode root = new TreeNode(Integer.parseInt(t[0]));
        ArrayDeque<TreeNode> q = new ArrayDeque<>(); q.add(root); int i = 1;
        while (!q.isEmpty() && i < t.length) {
            TreeNode node = q.poll();
            if (i < t.length && !t[i].equals("null")) { node.left = new TreeNode(Integer.parseInt(t[i])); q.add(node.left); }
            i++;
            if (i < t.length && !t[i].equals("null")) { node.right = new TreeNode(Integer.parseInt(t[i])); q.add(node.right); }
            i++;
        }
        return root;
    }
    static String fmt(int v) { return Integer.toString(v); }
    static String fmt(long v) { return Long.toString(v); }
    static String fmt(double v) { return String.format(Locale.ROOT, "%.5f", v); }
    static String fmt(boolean v) { return v ? "true" : "false"; }
    static String fmt(String v) { return v == null ? "" : v; }
    static String fmt(int[] v) {
        StringBuilder sb = new StringBuilder(); if (v == null) return "";
        for (int i = 0; i < v.length; i++) { if (i > 0) sb.append(' '); sb.append(v[i]); }
        return sb.toString();
    }
    static String fmt(int[][] v) {
        StringBuilder sb = new StringBuilder(); if (v == null) v = new int[0][];
        sb.append(v.length); for (int[] row : v) { sb.append('\\n'); sb.append(fmt(row)); }
        return sb.toString();
    }
    static String fmt(String[] v) {
        StringBuilder sb = new StringBuilder(); if (v == null) v = new String[0];
        sb.append(v.length); for (String s : v) { sb.append('\\n'); sb.append(s); }
        return sb.toString();
    }
    static String fmt(ListNode head) {
        StringBuilder sb = new StringBuilder(); int count = 0;
        while (head != null && count <= 200000) { if (count++ > 0) sb.append(' '); sb.append(head.val); head = head.next; }
        return sb.toString();
    }
    static String fmt(TreeNode root) {
        ArrayList<String> out = new ArrayList<>(); ArrayDeque<Optional<TreeNode>> q = new ArrayDeque<>();
        q.add(Optional.ofNullable(root));
        while (!q.isEmpty() && out.size() <= 400000) {
            Optional<TreeNode> cur = q.poll();
            if (cur.isEmpty()) { out.add("null"); continue; }
            TreeNode node = cur.get(); out.add(Integer.toString(node.val));
            q.add(Optional.ofNullable(node.left)); q.add(Optional.ofNullable(node.right));
        }
        int end = out.size(); while (end > 0 && out.get(end - 1).equals("null")) end--;
        return String.join(" ", out.subList(0, end));
    }
`;

/** Builds Main.java: imports + candidate code on line 1, then judge-provided classes after it. */
export function javaProgram(sig: Signature, userCode: string): string {
  const reads = sig.params.map((p, i) => `        ${JAVA_TYPE[p.type]} a${i} = ${READER[p.type]};`).join("\n");
  const call = sig.params.map((_, i) => `a${i}`).join(", ");
  return `${IMPORTS}${userCode}
${HARNESS}
    public static void main(String[] args) throws Exception {
        L = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8).split("\\n", -1);
${reads}
        ${JAVA_TYPE[sig.returns]} result = new Solution().${sig.functionName}(${call});
        String out = fmt(result) + "\\n";
        PrintStream ps = new PrintStream(new FileOutputStream(FileDescriptor.out), false, "UTF-8");
        ps.print(out);
        ps.flush();
    }
}
`;
}
