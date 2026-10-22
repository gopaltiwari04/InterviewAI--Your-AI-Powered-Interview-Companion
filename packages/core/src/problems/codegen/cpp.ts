import type { Param, Signature, ValueType } from "../types";
import { usesType } from "./shared";

const PARAM_TYPE: Record<ValueType, string> = {
  int: "int",
  long: "long long",
  double: "double",
  bool: "bool",
  string: "string",
  "int[]": "vector<int>&",
  "int[][]": "vector<vector<int>>&",
  "string[]": "vector<string>&",
  ListNode: "ListNode*",
  TreeNode: "TreeNode*",
};

const RETURN_TYPE: Record<ValueType, string> = {
  int: "int",
  long: "long long",
  double: "double",
  bool: "bool",
  string: "string",
  "int[]": "vector<int>",
  "int[][]": "vector<vector<int>>",
  "string[]": "vector<string>",
  ListNode: "ListNode*",
  TreeNode: "TreeNode*",
};

const DEFAULT_RETURN: Record<ValueType, string> = {
  int: "0",
  long: "0",
  double: "0.0",
  bool: "false",
  string: '""',
  "int[]": "{}",
  "int[][]": "{}",
  "string[]": "{}",
  ListNode: "nullptr",
  TreeNode: "nullptr",
};

const READER: Record<ValueType, string> = {
  int: "ia_harness::readInt()",
  long: "ia_harness::readLong()",
  double: "ia_harness::readDouble()",
  bool: "ia_harness::readBool()",
  string: "ia_harness::line()",
  "int[]": "ia_harness::readIntList()",
  "int[][]": "ia_harness::readIntMatrix()",
  "string[]": "ia_harness::readStrList()",
  ListNode: "ia_harness::readListNode()",
  TreeNode: "ia_harness::readTree()",
};

const LOCAL_TYPE: Record<ValueType, string> = { ...RETURN_TYPE };

const STRUCTS = `struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};
struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};`;

export function cppStarter(sig: Signature): string {
  const lines: string[] = ["// The standard library is available (#include <bits/stdc++.h>, using namespace std)."];
  if (usesType(sig, "ListNode")) {
    lines.push(
      "// Definition for singly-linked list (provided by the judge):",
      "// struct ListNode { int val; ListNode *next; ListNode(int x) : val(x), next(nullptr) {} ... };",
    );
  }
  if (usesType(sig, "TreeNode")) {
    lines.push(
      "// Definition for a binary tree node (provided by the judge):",
      "// struct TreeNode { int val; TreeNode *left; TreeNode *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} ... };",
    );
  }
  const params = sig.params.map((p: Param) => `${PARAM_TYPE[p.type]} ${p.name}`).join(", ");
  lines.push(
    "",
    "class Solution {",
    "public:",
    `    ${RETURN_TYPE[sig.returns]} ${sig.functionName}(${params}) {`,
    "        // Write your solution here.",
    `        return ${DEFAULT_RETURN[sig.returns]};`,
    "    }",
    "};",
    "",
  );
  return lines.join("\n");
}

const HARNESS = `namespace ia_harness {
static std::vector<std::string> lines;
static size_t pos = 0;
static std::string line() { return pos < lines.size() ? lines[pos++] : std::string(); }
static std::vector<std::string> tokens(const std::string& s) {
    std::vector<std::string> out; std::istringstream in(s); std::string t;
    while (in >> t) out.push_back(t);
    return out;
}
static int readInt() { return (int)std::stol(line()); }
static long long readLong() { return std::stoll(line()); }
static double readDouble() { return std::stod(line()); }
static bool readBool() { std::string s = line(); return s.find("true") != std::string::npos; }
static std::vector<int> readIntList() {
    int n = readInt(); std::vector<std::string> t = tokens(line()); std::vector<int> out;
    for (int i = 0; i < n && i < (int)t.size(); i++) out.push_back((int)std::stol(t[i]));
    return out;
}
static std::vector<std::vector<int>> readIntMatrix() {
    int r = readInt(); std::vector<std::vector<int>> out;
    for (int i = 0; i < r; i++) {
        std::vector<std::string> t = tokens(line()); std::vector<int> row;
        int k = t.empty() ? 0 : (int)std::stol(t[0]);
        for (int j = 1; j <= k && j < (int)t.size(); j++) row.push_back((int)std::stol(t[j]));
        out.push_back(row);
    }
    return out;
}
static std::vector<std::string> readStrList() {
    int n = readInt(); std::vector<std::string> out;
    for (int i = 0; i < n; i++) out.push_back(line());
    return out;
}
static ListNode* readListNode() {
    std::vector<int> v = readIntList(); ListNode dummy; ListNode* cur = &dummy;
    for (int x : v) { cur->next = new ListNode(x); cur = cur->next; }
    return dummy.next;
}
static TreeNode* readTree() {
    int n = readInt(); std::vector<std::string> t = tokens(line());
    if ((int)t.size() > n) t.resize(n);
    if (t.empty() || t[0] == "null") return nullptr;
    TreeNode* root = new TreeNode(std::stoi(t[0]));
    std::deque<TreeNode*> q; q.push_back(root); size_t i = 1;
    while (!q.empty() && i < t.size()) {
        TreeNode* node = q.front(); q.pop_front();
        if (i < t.size() && t[i] != "null") { node->left = new TreeNode(std::stoi(t[i])); q.push_back(node->left); }
        i++;
        if (i < t.size() && t[i] != "null") { node->right = new TreeNode(std::stoi(t[i])); q.push_back(node->right); }
        i++;
    }
    return root;
}
static std::string fmt(int v) { return std::to_string(v); }
static std::string fmt(long long v) { return std::to_string(v); }
static std::string fmt(double v) { std::ostringstream o; o << std::fixed << std::setprecision(5) << v; return o.str(); }
static std::string fmt(bool v) { return v ? "true" : "false"; }
static std::string fmt(const std::string& v) { return v; }
static std::string fmt(const std::vector<int>& v) {
    std::string s; for (size_t i = 0; i < v.size(); i++) { if (i) s += ' '; s += std::to_string(v[i]); } return s;
}
static std::string fmt(const std::vector<std::vector<int>>& v) {
    std::string s = std::to_string(v.size()); for (const auto& row : v) { s += '\\n'; s += fmt(row); } return s;
}
static std::string fmt(const std::vector<std::string>& v) {
    std::string s = std::to_string(v.size()); for (const auto& x : v) { s += '\\n'; s += x; } return s;
}
static std::string fmt(ListNode* head) {
    std::string s; int count = 0;
    while (head && count <= 200000) { if (count++) s += ' '; s += std::to_string(head->val); head = head->next; }
    return s;
}
static std::string fmt(TreeNode* root) {
    std::vector<std::string> out; std::deque<TreeNode*> q; q.push_back(root);
    while (!q.empty() && out.size() <= 400000) {
        TreeNode* node = q.front(); q.pop_front();
        if (!node) { out.push_back("null"); continue; }
        out.push_back(std::to_string(node->val)); q.push_back(node->left); q.push_back(node->right);
    }
    while (!out.empty() && out.back() == "null") out.pop_back();
    std::string s; for (size_t i = 0; i < out.size(); i++) { if (i) s += ' '; s += out[i]; }
    return s;
}
}  // namespace ia_harness`;

/** Builds main.cpp. #line directives keep compiler errors pointing at the candidate's own lines. */
export function cppProgram(sig: Signature, userCode: string): string {
  const reads = sig.params.map((p, i) => `    ${LOCAL_TYPE[p.type]} a${i} = ${READER[p.type]};`).join("\n");
  const call = sig.params.map((_, i) => `a${i}`).join(", ");
  return `#include <bits/stdc++.h>
using namespace std;
${STRUCTS}
#line 1 "solution.cpp"
${userCode}
#line 1 "harness.cpp"
${HARNESS}
int main() {
    std::ios::sync_with_stdio(false);
    std::string ia_s;
    while (std::getline(std::cin, ia_s)) {
        if (!ia_s.empty() && ia_s.back() == '\\r') ia_s.pop_back();
        ia_harness::lines.push_back(ia_s);
    }
${reads}
    Solution ia_solution;
    ${RETURN_TYPE[sig.returns]} ia_result = ia_solution.${sig.functionName}(${call});
    std::string ia_out = ia_harness::fmt(ia_result);
    ia_out += '\\n';
    std::fwrite(ia_out.data(), 1, ia_out.size(), stdout);
    return 0;
}
`;
}
