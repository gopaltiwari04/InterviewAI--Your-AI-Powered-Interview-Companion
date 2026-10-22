import type { Signature, ValueType } from "../types";
import { usesType } from "./shared";

const HINT: Record<ValueType, string> = {
  int: "int",
  long: "int",
  double: "float",
  bool: "bool",
  string: "str",
  "int[]": "List[int]",
  "int[][]": "List[List[int]]",
  "string[]": "List[str]",
  ListNode: "Optional[ListNode]",
  TreeNode: "Optional[TreeNode]",
};

const READER: Record<ValueType, string> = {
  int: "_read_int()",
  long: "_read_int()",
  double: "_read_float()",
  bool: "_read_bool()",
  string: "_read_str()",
  "int[]": "_read_int_list()",
  "int[][]": "_read_int_matrix()",
  "string[]": "_read_str_list()",
  ListNode: "_read_list_node()",
  TreeNode: "_read_tree()",
};

const FORMATTER: Record<ValueType, string> = {
  int: "_fmt_int",
  long: "_fmt_int",
  double: "_fmt_float",
  bool: "_fmt_bool",
  string: "_fmt_str",
  "int[]": "_fmt_int_list",
  "int[][]": "_fmt_int_matrix",
  "string[]": "_fmt_str_list",
  ListNode: "_fmt_list_node",
  TreeNode: "_fmt_tree",
};

export function pythonStarter(sig: Signature): string {
  const lines: string[] = [
    "# List, Optional, Dict, collections, heapq, bisect, math and functools are already imported.",
  ];
  if (usesType(sig, "ListNode")) {
    lines.push(
      "# Definition for singly-linked list (provided by the judge):",
      "# class ListNode:",
      "#     def __init__(self, val=0, next=None):",
      "#         self.val = val",
      "#         self.next = next",
    );
  }
  if (usesType(sig, "TreeNode")) {
    lines.push(
      "# Definition for a binary tree node (provided by the judge):",
      "# class TreeNode:",
      "#     def __init__(self, val=0, left=None, right=None):",
      "#         self.val = val",
      "#         self.left = left",
      "#         self.right = right",
    );
  }
  const params = sig.params.map((p) => `${p.name}: ${HINT[p.type]}`).join(", ");
  lines.push("", "", `def ${sig.functionName}(${params}) -> ${HINT[sig.returns]}:`, "    # Write your solution here.", "    pass", "");
  return lines.join("\n");
}

/** Builds main.py. The candidate's code is executed from solution.py so tracebacks keep their line numbers. */
export function pythonHarness(sig: Signature): string {
  const reads = sig.params.map((_, i) => `    _a${i} = ${READER[sig.params[i]!.type]}`).join("\n");
  const call = sig.params.map((_, i) => `_a${i}`).join(", ");
  return `import sys, os, math, collections, heapq, bisect, itertools, functools, string, re, threading
from typing import *
from collections import deque, defaultdict, Counter, OrderedDict
from functools import lru_cache, cache, reduce
from heapq import heappush, heappop, heapify
from bisect import bisect_left, bisect_right, insort


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


_lines = sys.stdin.read().split("\\n")
_pos = 0


def _line():
    global _pos
    s = _lines[_pos] if _pos < len(_lines) else ""
    _pos += 1
    return s.rstrip("\\r")


def _read_int():
    return int(_line().strip())


def _read_float():
    return float(_line().strip())


def _read_bool():
    return _line().strip() == "true"


def _read_str():
    return _line()


def _read_int_list():
    n = int(_line().strip())
    return [int(t) for t in _line().split()[:n]]


def _read_int_matrix():
    rows = []
    for _ in range(int(_line().strip())):
        toks = _line().split()
        k = int(toks[0]) if toks else 0
        rows.append([int(t) for t in toks[1:1 + k]])
    return rows


def _read_str_list():
    return [_line() for _ in range(int(_line().strip()))]


def _read_list_node():
    dummy = ListNode()
    cur = dummy
    for v in _read_int_list():
        cur.next = ListNode(v)
        cur = cur.next
    return dummy.next


def _read_tree():
    n = int(_line().strip())
    toks = _line().split()[:n]
    if not toks or toks[0] == "null":
        return None
    root = TreeNode(int(toks[0]))
    queue = collections.deque([root])
    i = 1
    while queue and i < len(toks):
        node = queue.popleft()
        if i < len(toks) and toks[i] != "null":
            node.left = TreeNode(int(toks[i]))
            queue.append(node.left)
        i += 1
        if i < len(toks) and toks[i] != "null":
            node.right = TreeNode(int(toks[i]))
            queue.append(node.right)
        i += 1
    return root


def _fmt_int(v):
    return str(int(v))


def _fmt_float(v):
    return "%.5f" % float(v)


def _fmt_bool(v):
    return "true" if v else "false"


def _fmt_str(v):
    return "" if v is None else str(v)


def _fmt_int_list(v):
    return " ".join(str(int(x)) for x in (v or []))


def _fmt_int_matrix(v):
    v = list(v or [])
    return "\\n".join([str(len(v))] + [" ".join(str(int(x)) for x in row) for row in v])


def _fmt_str_list(v):
    v = list(v or [])
    return "\\n".join([str(len(v))] + [str(x) for x in v])


def _fmt_list_node(head):
    out = []
    while head is not None and len(out) <= 200000:
        out.append(str(head.val))
        head = head.next
    return " ".join(out)


def _fmt_tree(root):
    out = []
    queue = collections.deque([root])
    while queue and len(out) <= 400000:
        node = queue.popleft()
        if node is None:
            out.append("null")
            continue
        out.append(str(node.val))
        queue.append(node.left)
        queue.append(node.right)
    while out and out[-1] == "null":
        out.pop()
    return " ".join(out)


def _run():
    namespace = {k: v for k, v in globals().items() if not k.startswith("_")}
    namespace["__name__"] = "solution"
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "solution.py")) as f:
        source = f.read()
    exec(compile(source, "solution.py", "exec"), namespace)
    fn = namespace.get("${sig.functionName}")
    if not callable(fn):
        sys.stderr.write("Function ${sig.functionName} was not found. Keep the function name from the starter code.\\n")
        os._exit(1)
${reads}
    result = fn(${call})
    sys.stdout.write(${FORMATTER[sig.returns]}(result) + "\\n")
    sys.stdout.flush()


def _thread_main():
    try:
        _run()
    except SystemExit as e:
        sys.stdout.flush()
        if e.code is not None and not isinstance(e.code, int):
            sys.stderr.write(str(e.code) + "\\n")
            sys.stderr.flush()
        os._exit(e.code if isinstance(e.code, int) else (0 if e.code is None else 1))
    except MemoryError:
        sys.stderr.write("MemoryError: memory limit exceeded\\n")
        sys.stderr.flush()
        os._exit(3)
    except BaseException:
        import traceback
        traceback.print_exc()
        sys.stderr.flush()
        os._exit(1)


sys.setrecursionlimit(200000)
threading.stack_size(64 * 1024 * 1024)
_t = threading.Thread(target=_thread_main)
_t.start()
_t.join()
`;
}
