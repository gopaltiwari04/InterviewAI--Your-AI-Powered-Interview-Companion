import type { Value } from "@repo/core/problems";
import type { Rng } from "../rng";
import type { ProblemDefinition } from "../types";

export const reverseLinkedList: ProblemDefinition = {
  slug: "reverse-linked-list",
  version: 1,
  title: "Reverse Linked List",
  difficulty: "EASY",
  topics: ["linked-list"],
  statement: "Given the `head` of a singly linked list, reverse the list and return the new head.",
  inputDescription: "`head`: the head of the list (given as its values in order).",
  outputDescription: "The reversed list.",
  constraints: ["0 <= number of nodes <= 5000", "-5000 <= Node.val <= 5000"],
  signature: { functionName: "reverseList", params: [{ name: "head", type: "ListNode" }], returns: "ListNode" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[1, 2, 3, 4, 5]], output: [5, 4, 3, 2, 1] },
    { args: [[1, 2]], output: [2, 1] },
    { args: [[]], output: [] },
  ],
  hiddenTests: (rng) => [[[7]], [[1, 1]], [rng.array(10, -10, 10)], [rng.array(1000, -5000, 5000)], [rng.array(5000, -5000, 5000)], [Array.from({ length: 5000 }, (_, i) => i)]],
  reference: {
    javascript: `function reverseList(head) {
  let prev = null;
  while (head) {
    const next = head.next;
    head.next = prev;
    prev = head;
    head = next;
  }
  return prev;
}`,
    python: `def reverseList(head):
    def go(node, prev):
        if node is None:
            return prev
        nxt = node.next
        node.next = prev
        return go(nxt, node)
    return go(head, None)
`,
  },
  complexity: { time: "O(n)", space: "O(1) iterative, O(n) recursive" },
  followUps: ["Can you write both the iterative and the recursive version?", "What is the space cost of recursion here?"],
};

const sortedList = (rng: Rng, n: number) => rng.array(n, -100, 100).sort((a, b) => a - b);

export const mergeTwoSortedLists: ProblemDefinition = {
  slug: "merge-two-sorted-lists",
  version: 1,
  title: "Merge Two Sorted Lists",
  difficulty: "EASY",
  topics: ["linked-list"],
  statement: "You are given the heads of two sorted linked lists `list1` and `list2`. Merge them into one sorted list by splicing together their nodes, and return its head.",
  inputDescription: "`list1`, `list2`: sorted linked lists (possibly empty).",
  outputDescription: "The merged sorted list.",
  constraints: ["0 <= number of nodes in each list <= 2000", "-100 <= Node.val <= 100", "Both lists are sorted in non-decreasing order."],
  signature: {
    functionName: "mergeTwoLists",
    params: [
      { name: "list1", type: "ListNode" },
      { name: "list2", type: "ListNode" },
    ],
    returns: "ListNode",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: [[1, 2, 4], [1, 3, 4]], output: [1, 1, 2, 3, 4, 4] },
    { args: [[], []], output: [] },
    { args: [[], [0]], output: [0] },
  ],
  hiddenTests: (rng) => [
    [[5], []],
    [[1, 2, 3], [4, 5, 6]],
    [[4, 5, 6], [1, 2, 3]],
    [sortedList(rng, 10), sortedList(rng, 3)],
    [sortedList(rng, 500), sortedList(rng, 700)],
    [sortedList(rng, 2000), sortedList(rng, 2000)],
  ],
  reference: {
    javascript: `function mergeTwoLists(list1, list2) {
  const dummy = new ListNode();
  let tail = dummy;
  while (list1 && list2) {
    if (list1.val <= list2.val) {
      tail.next = list1;
      list1 = list1.next;
    } else {
      tail.next = list2;
      list2 = list2.next;
    }
    tail = tail.next;
  }
  tail.next = list1 || list2;
  return dummy.next;
}`,
    python: `def mergeTwoLists(list1, list2):
    values = []
    for node in (list1, list2):
        while node:
            values.append(node.val)
            node = node.next
    values.sort()
    dummy = ListNode()
    cur = dummy
    for v in values:
        cur.next = ListNode(v)
        cur = cur.next
    return dummy.next
`,
  },
  complexity: { time: "O(m + n)", space: "O(1)" },
  followUps: ["How does a dummy head simplify the code?", "How would you merge k sorted lists?"],
};

function removeNthCase(rng: Rng, len: number): Value[] {
  return [rng.array(len, 0, 100), rng.int(1, len)];
}

export const removeNthNodeFromEndOfList: ProblemDefinition = {
  slug: "remove-nth-node-from-end-of-list",
  version: 1,
  title: "Remove Nth Node From End of List",
  difficulty: "MEDIUM",
  topics: ["linked-list", "two-pointers"],
  statement: "Given the `head` of a linked list, remove the `n`-th node from the end of the list and return its head.\n\nTry to do it in one pass.",
  inputDescription: "`head`: a linked list. `n`: the 1-based position counted from the end.",
  outputDescription: "The list with that node removed.",
  constraints: ["1 <= number of nodes <= 3000", "0 <= Node.val <= 100", "1 <= n <= number of nodes"],
  signature: {
    functionName: "removeNthFromEnd",
    params: [
      { name: "head", type: "ListNode" },
      { name: "n", type: "int" },
    ],
    returns: "ListNode",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: [[1, 2, 3, 4, 5], 2], output: [1, 2, 3, 5] },
    { args: [[1], 1], output: [] },
    { args: [[1, 2], 1], output: [1] },
  ],
  hiddenTests: (rng) => [
    [[1, 2], 2],
    [[1, 2, 3], 3],
    [[1, 2, 3], 1],
    removeNthCase(rng, 10),
    removeNthCase(rng, 100),
    [rng.array(3000, 0, 100), 3000],
    [rng.array(3000, 0, 100), 1],
    removeNthCase(rng, 3000),
  ],
  reference: {
    javascript: `function removeNthFromEnd(head, n) {
  const dummy = new ListNode(0, head);
  let fast = dummy;
  let slow = dummy;
  for (let i = 0; i <= n; i++) fast = fast.next;
  while (fast) {
    fast = fast.next;
    slow = slow.next;
  }
  slow.next = slow.next.next;
  return dummy.next;
}`,
    python: `def removeNthFromEnd(head, n):
    nodes = []
    node = head
    while node:
        nodes.append(node)
        node = node.next
    idx = len(nodes) - n
    if idx == 0:
        return head.next
    nodes[idx - 1].next = nodes[idx].next
    return head
`,
  },
  complexity: { time: "O(L)", space: "O(1)" },
  followUps: ["Why does the gap between the two pointers solve it in one pass?", "Which edge case does the dummy node handle?"],
};

function digits(rng: Rng, len: number): number[] {
  const d = rng.array(len, 0, 9);
  if (len > 1 && d[len - 1] === 0) d[len - 1] = rng.int(1, 9);
  return d;
}

export const addTwoNumbers: ProblemDefinition = {
  slug: "add-two-numbers",
  version: 1,
  title: "Add Two Numbers",
  difficulty: "MEDIUM",
  topics: ["linked-list"],
  statement:
    "Two non-negative integers are stored in linked lists in reverse order: each node holds one digit and the head is the least significant digit.\n\nAdd the two numbers and return the sum as a linked list in the same format. The numbers have no leading zeros except the number 0 itself.",
  inputDescription: "`l1`, `l2`: the digits of each number, least significant first.",
  outputDescription: "The digits of the sum, least significant first.",
  constraints: ["1 <= number of nodes in each list <= 200", "0 <= Node.val <= 9", "No leading zeros except for the number 0."],
  signature: {
    functionName: "addTwoNumbers",
    params: [
      { name: "l1", type: "ListNode" },
      { name: "l2", type: "ListNode" },
    ],
    returns: "ListNode",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: [[2, 4, 3], [5, 6, 4]], output: [7, 0, 8], explanation: "342 + 465 = 807." },
    { args: [[0], [0]], output: [0] },
    { args: [[9, 9, 9, 9, 9, 9, 9], [9, 9, 9, 9]], output: [8, 9, 9, 9, 0, 0, 0, 1] },
  ],
  hiddenTests: (rng) => [
    [[5], [5]],
    [[1, 8], [0]],
    [[9], [1, 9, 9]],
    [digits(rng, 10), digits(rng, 10)],
    [digits(rng, 50), digits(rng, 3)],
    [digits(rng, 200), digits(rng, 200)],
    [Array.from({ length: 200 }, () => 9), [1]],
  ],
  reference: {
    javascript: `function addTwoNumbers(l1, l2) {
  const dummy = new ListNode();
  let tail = dummy;
  let carry = 0;
  while (l1 || l2 || carry) {
    const sum = (l1 ? l1.val : 0) + (l2 ? l2.val : 0) + carry;
    carry = Math.floor(sum / 10);
    tail.next = new ListNode(sum % 10);
    tail = tail.next;
    l1 = l1 && l1.next;
    l2 = l2 && l2.next;
  }
  return dummy.next;
}`,
    python: `def addTwoNumbers(l1, l2):
    def to_int(node):
        digits = []
        while node:
            digits.append(str(node.val))
            node = node.next
        return int("".join(reversed(digits)))
    total = to_int(l1) + to_int(l2)
    dummy = ListNode()
    cur = dummy
    for ch in reversed(str(total)):
        cur.next = ListNode(int(ch))
        cur = cur.next
    return dummy.next
`,
  },
  complexity: { time: "O(max(m, n))", space: "O(max(m, n)) for the output" },
  followUps: ["Why can't you convert the lists to integers in most languages?", "How would you handle digits stored most-significant first?"],
};

function parenCase(rng: Rng, pairs: number, valid: boolean): Value[] {
  const open = "([{";
  const close: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  let s = "";
  const stack: string[] = [];
  let remaining = pairs;
  while (remaining > 0 || stack.length > 0) {
    if (remaining > 0 && (stack.length === 0 || rng.bool())) {
      const c = rng.pick(open.split(""));
      stack.push(c);
      s += c;
      remaining--;
    } else {
      s += close[stack.pop()!];
    }
  }
  if (!valid) {
    const i = rng.int(0, s.length - 1);
    const all = "()[]{}";
    let replacement = s[i]!;
    while (replacement === s[i]) replacement = rng.pick(all.split(""));
    s = s.slice(0, i) + replacement + s.slice(i + 1);
  }
  return [s];
}

export const validParentheses: ProblemDefinition = {
  slug: "valid-parentheses",
  version: 1,
  title: "Valid Parentheses",
  difficulty: "EASY",
  topics: ["stack-queue"],
  statement:
    "Given a string `s` containing only the characters `()[]{}`, determine whether it is valid.\n\nA string is valid when every opening bracket is closed by the same type of bracket, brackets close in the correct order, and every closing bracket has a matching opening bracket.",
  inputDescription: "`s`: a string of bracket characters.",
  outputDescription: "`true` if `s` is valid, otherwise `false`.",
  constraints: ["1 <= s.length <= 10^4", "s consists only of the characters ()[]{}."],
  signature: { functionName: "isValid", params: [{ name: "s", type: "string" }], returns: "bool" },
  comparator: { kind: "exact" },
  examples: [
    { args: ["()"], output: true },
    { args: ["()[]{}"], output: true },
    { args: ["(]"], output: false },
    { args: ["([])"], output: true },
  ],
  hiddenTests: (rng) => [
    ["("],
    ["]"],
    ["(("],
    ["([)]"],
    ["{[]}"],
    parenCase(rng, 10, true),
    parenCase(rng, 10, false),
    parenCase(rng, 2500, true),
    parenCase(rng, 2500, false),
    ["(".repeat(5000) + ")".repeat(5000)],
  ],
  reference: {
    javascript: `function isValid(s) {
  const pairs = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  for (const c of s) {
    if (c in pairs) {
      if (stack.pop() !== pairs[c]) return false;
    } else stack.push(c);
  }
  return stack.length === 0;
}`,
    python: `def isValid(s):
    prev = None
    while prev != s:
        prev = s
        s = s.replace("()", "").replace("[]", "").replace("{}", "")
    return s == ""
`,
  },
  complexity: { time: "O(n)", space: "O(n)" },
  followUps: ["Why is a stack the natural data structure?", "Which early exits can you add?"],
};

export const dailyTemperatures: ProblemDefinition = {
  slug: "daily-temperatures",
  version: 1,
  title: "Daily Temperatures",
  difficulty: "MEDIUM",
  topics: ["stack-queue"],
  statement:
    "Given an array `temperatures` of daily temperatures, return an array `answer` where `answer[i]` is the number of days after day `i` until a warmer temperature. If there is no future warmer day, `answer[i]` is `0`.",
  inputDescription: "`temperatures`: daily temperatures.",
  outputDescription: "The number of days to wait for each day.",
  constraints: ["1 <= temperatures.length <= 5000", "30 <= temperatures[i] <= 100"],
  signature: { functionName: "dailyTemperatures", params: [{ name: "temperatures", type: "int[]" }], returns: "int[]" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[73, 74, 75, 71, 69, 72, 76, 73]], output: [1, 1, 4, 2, 1, 1, 0, 0] },
    { args: [[30, 40, 50, 60]], output: [1, 1, 1, 0] },
    { args: [[30, 60, 90]], output: [1, 1, 0] },
  ],
  hiddenTests: (rng) => [
    [[50]],
    [[90, 80, 70]],
    [[70, 70, 70, 71]],
    [rng.array(100, 30, 100)],
    [rng.array(5000, 30, 100)],
    [Array.from({ length: 5000 }, (_, i) => 100 - (i % 71))],
  ],
  reference: {
    javascript: `function dailyTemperatures(temperatures) {
  const out = new Array(temperatures.length).fill(0);
  const stack = [];
  for (let i = 0; i < temperatures.length; i++) {
    while (stack.length && temperatures[stack[stack.length - 1]] < temperatures[i]) {
      const j = stack.pop();
      out[j] = i - j;
    }
    stack.push(i);
  }
  return out;
}`,
    python: `def dailyTemperatures(temperatures):
    n = len(temperatures)
    out = [0] * n
    nxt = [n] * 101
    for i in range(n - 1, -1, -1):
        t = temperatures[i]
        warmer = min(nxt[t + 1:] or [n])
        if warmer < n:
            out[i] = warmer - i
        nxt[t] = i
    return out
`,
  },
  complexity: { time: "O(n)", space: "O(n)" },
  followUps: ["What does the monotonic stack hold?", "Why is the total work linear?"],
};

/** Random RPN expression whose intermediate values stay small and never divide by zero. */
function rpnCase(rng: Rng, operands: number): Value[] {
  type Expr = { tokens: string[]; value: number };
  const leaf = (): Expr => {
    const v = rng.int(-200, 200);
    return { tokens: [String(v)], value: v };
  };
  let items: Expr[] = Array.from({ length: operands }, leaf);
  while (items.length > 1) {
    const i = rng.int(0, items.length - 2);
    const a = items[i]!;
    const b = items[i + 1]!;
    const apply = (op: string) =>
      op === "+" ? a.value + b.value : op === "-" ? a.value - b.value : op === "*" ? a.value * b.value : Math.trunc(a.value / b.value);
    // Keep every intermediate value well inside the 32-bit range.
    const ops = ["+", "-", "*", "/"].filter((op) => (op !== "/" || b.value !== 0) && Math.abs(apply(op)) <= 1e8);
    const op = rng.pick(ops);
    const value = apply(op);
    items = [...items.slice(0, i), { tokens: [...a.tokens, ...b.tokens, op], value }, ...items.slice(i + 2)];
  }
  return [items[0]!.tokens];
}

export const evaluateReversePolishNotation: ProblemDefinition = {
  slug: "evaluate-reverse-polish-notation",
  version: 1,
  title: "Evaluate Reverse Polish Notation",
  difficulty: "MEDIUM",
  topics: ["stack-queue"],
  statement:
    "You are given an array of strings `tokens` representing an arithmetic expression in Reverse Polish Notation. Evaluate it and return the result.\n\nThe operators are `+`, `-`, `*` and `/`. Division truncates toward zero. The expression is always valid, never divides by zero, and every intermediate value fits in a 32-bit integer.",
  inputDescription: "`tokens`: one token per line, either an integer or an operator.",
  outputDescription: "The value of the expression.",
  constraints: ["1 <= tokens.length <= 3999", "Each token is an operator or an integer in [-200, 200]."],
  signature: { functionName: "evalRPN", params: [{ name: "tokens", type: "string[]" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: [["2", "1", "+", "3", "*"]], output: 9, explanation: "((2 + 1) * 3) = 9" },
    { args: [["4", "13", "5", "/", "+"]], output: 6, explanation: "(4 + (13 / 5)) = 6" },
    { args: [["10", "6", "9", "3", "+", "-11", "*", "/", "*", "17", "+", "5", "+"]], output: 22 },
  ],
  hiddenTests: (rng) => [[["42"]], [["-7", "2", "/"]], [["7", "-2", "/"]], [["3", "-4", "-"]], rpnCase(rng, 5), rpnCase(rng, 50), rpnCase(rng, 500), rpnCase(rng, 2000)],
  reference: {
    javascript: `function evalRPN(tokens) {
  const stack = [];
  for (const t of tokens) {
    if (t === "+" || t === "-" || t === "*" || t === "/") {
      const b = stack.pop();
      const a = stack.pop();
      stack.push(t === "+" ? a + b : t === "-" ? a - b : t === "*" ? a * b : Math.trunc(a / b));
    } else stack.push(Number(t));
  }
  return stack[0];
}`,
    python: `def evalRPN(tokens):
    def div(a, b):
        q = abs(a) // abs(b)
        return q if (a >= 0) == (b > 0) else -q
    ops = {"+": lambda a, b: a + b, "-": lambda a, b: a - b, "*": lambda a, b: a * b, "/": div}
    stack = []
    for t in tokens:
        if t in ops:
            b = stack.pop()
            a = stack.pop()
            stack.append(ops[t](a, b))
        else:
            stack.append(int(t))
    return stack[0]
`,
  },
  complexity: { time: "O(n)", space: "O(n)" },
  followUps: ["How does your language's integer division round negative numbers?", "How would you evaluate an infix expression?"],
};

export const largestRectangleInHistogram: ProblemDefinition = {
  slug: "largest-rectangle-in-histogram",
  version: 1,
  title: "Largest Rectangle in Histogram",
  difficulty: "HARD",
  topics: ["stack-queue"],
  statement: "Given an array `heights` of bar heights in a histogram where each bar has width 1, return the area of the largest rectangle in the histogram.",
  inputDescription: "`heights`: bar heights.",
  outputDescription: "The largest rectangle area.",
  constraints: ["1 <= heights.length <= 5000", "0 <= heights[i] <= 10^4"],
  signature: { functionName: "largestRectangleArea", params: [{ name: "heights", type: "int[]" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[2, 1, 5, 6, 2, 3]], output: 10, explanation: "Bars 5 and 6 form a 5 * 2 rectangle." },
    { args: [[2, 4]], output: 4 },
  ],
  hiddenTests: (rng) => [
    [[0]],
    [[7]],
    [[1, 1, 1, 1]],
    [[6, 2, 5, 4, 5, 1, 6]],
    [rng.array(100, 0, 20)],
    [rng.array(5000, 0, 10000)],
    [Array.from({ length: 5000 }, (_, i) => i + 1)],
    [Array.from({ length: 5000 }, (_, i) => 5000 - i)],
  ],
  reference: {
    javascript: `function largestRectangleArea(heights) {
  const stack = [];
  let best = 0;
  for (let i = 0; i <= heights.length; i++) {
    const h = i === heights.length ? 0 : heights[i];
    while (stack.length && heights[stack[stack.length - 1]] >= h) {
      const height = heights[stack.pop()];
      const left = stack.length ? stack[stack.length - 1] + 1 : 0;
      best = Math.max(best, height * (i - left));
    }
    stack.push(i);
  }
  return best;
}`,
    python: `def largestRectangleArea(heights):
    n = len(heights)
    left = [0] * n
    right = [n] * n
    stack = []
    for i in range(n):
        while stack and heights[stack[-1]] >= heights[i]:
            stack.pop()
        left[i] = stack[-1] + 1 if stack else 0
        stack.append(i)
    stack = []
    for i in range(n - 1, -1, -1):
        while stack and heights[stack[-1]] >= heights[i]:
            stack.pop()
        right[i] = stack[-1] if stack else n
        stack.append(i)
    return max(heights[i] * (right[i] - left[i]) for i in range(n))
`,
  },
  complexity: { time: "O(n)", space: "O(n)" },
  followUps: ["What does each stack entry represent?", "Why do we append a sentinel bar of height 0?"],
};

export const LISTS_STACKS = [
  reverseLinkedList,
  mergeTwoSortedLists,
  removeNthNodeFromEndOfList,
  addTwoNumbers,
  validParentheses,
  dailyTemperatures,
  evaluateReversePolishNotation,
  largestRectangleInHistogram,
];
