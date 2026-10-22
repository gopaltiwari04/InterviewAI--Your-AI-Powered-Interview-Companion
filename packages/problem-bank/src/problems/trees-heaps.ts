import type { Value } from "@repo/core/problems";
import { bstFromSorted, randomBst, randomTree, type Rng } from "../rng";
import type { ProblemDefinition } from "../types";

const chain = (n: number, side: "left" | "right"): (number | null)[] => {
  const out: (number | null)[] = [1];
  for (let i = 2; i <= n; i++) out.push(...(side === "left" ? [i, null] : [null, i]));
  return out;
};

export const maximumDepthOfBinaryTree: ProblemDefinition = {
  slug: "maximum-depth-of-binary-tree",
  version: 1,
  title: "Maximum Depth of Binary Tree",
  difficulty: "EASY",
  topics: ["trees"],
  statement:
    "Given the `root` of a binary tree, return its maximum depth: the number of nodes on the longest path from the root down to a leaf.\n\nTrees are written in level order, with `null` marking a missing child.",
  inputDescription: "`root`: a binary tree in level order.",
  outputDescription: "The maximum depth (0 for an empty tree).",
  constraints: ["0 <= number of nodes <= 3000", "-100 <= Node.val <= 100"],
  signature: { functionName: "maxDepth", params: [{ name: "root", type: "TreeNode" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[3, 9, 20, null, null, 15, 7]], output: 3 },
    { args: [[1, null, 2]], output: 2 },
  ],
  hiddenTests: (rng) => [
    [[]],
    [[0]],
    [[1, 2, 3, 4, 5]],
    [randomTree(rng, 20, () => rng.int(-100, 100))],
    [randomTree(rng, 1000, () => rng.int(-100, 100))],
    [chain(1500, "left").map((v) => (v === null ? null : v % 100))],
    [chain(1500, "right").map((v) => (v === null ? null : v % 100))],
  ],
  reference: {
    javascript: `function maxDepth(root) {
  if (!root) return 0;
  let depth = 0;
  let level = [root];
  while (level.length) {
    depth++;
    const next = [];
    for (const node of level) {
      if (node.left) next.push(node.left);
      if (node.right) next.push(node.right);
    }
    level = next;
  }
  return depth;
}`,
    python: `def maxDepth(root):
    if root is None:
        return 0
    return 1 + max(maxDepth(root.left), maxDepth(root.right))
`,
  },
  complexity: { time: "O(n)", space: "O(h) recursive, O(width) iterative" },
  followUps: ["Compare recursive DFS and BFS for this problem.", "What happens to recursion on a very deep, skewed tree?"],
};

export const invertBinaryTree: ProblemDefinition = {
  slug: "invert-binary-tree",
  version: 1,
  title: "Invert Binary Tree",
  difficulty: "EASY",
  topics: ["trees"],
  statement: "Given the `root` of a binary tree, invert it (mirror it left to right) and return its root.",
  inputDescription: "`root`: a binary tree in level order.",
  outputDescription: "The inverted tree in level order.",
  constraints: ["0 <= number of nodes <= 2000", "-100 <= Node.val <= 100"],
  signature: { functionName: "invertTree", params: [{ name: "root", type: "TreeNode" }], returns: "TreeNode" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[4, 2, 7, 1, 3, 6, 9]], output: [4, 7, 2, 9, 6, 3, 1] },
    { args: [[2, 1, 3]], output: [2, 3, 1] },
    { args: [[]], output: [] },
  ],
  hiddenTests: (rng) => [
    [[1]],
    [[1, 2]],
    [[1, null, 2]],
    [randomTree(rng, 15, () => rng.int(-100, 100))],
    [randomTree(rng, 500, () => rng.int(-100, 100))],
    [randomTree(rng, 2000, () => rng.int(-100, 100))],
  ],
  reference: {
    javascript: `function invertTree(root) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    [node.left, node.right] = [node.right, node.left];
    stack.push(node.left, node.right);
  }
  return root;
}`,
    python: `def invertTree(root):
    if root is not None:
        root.left, root.right = invertTree(root.right), invertTree(root.left)
    return root
`,
  },
  complexity: { time: "O(n)", space: "O(h)" },
  followUps: ["Can you do it iteratively?", "Which traversal orders work for this?"],
};

export const binaryTreeLevelOrderTraversal: ProblemDefinition = {
  slug: "binary-tree-level-order-traversal",
  version: 1,
  title: "Binary Tree Level Order Traversal",
  difficulty: "MEDIUM",
  topics: ["trees", "graphs"],
  statement: "Given the `root` of a binary tree, return the values of its nodes level by level, from left to right within each level.",
  inputDescription: "`root`: a binary tree in level order.",
  outputDescription: "One array of values per level, top to bottom.",
  constraints: ["0 <= number of nodes <= 2000", "-1000 <= Node.val <= 1000"],
  signature: { functionName: "levelOrder", params: [{ name: "root", type: "TreeNode" }], returns: "int[][]" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[3, 9, 20, null, null, 15, 7]], output: [[3], [9, 20], [15, 7]] },
    { args: [[1]], output: [[1]] },
    { args: [[]], output: [] },
  ],
  hiddenTests: (rng) => [
    [[1, 2, 3, 4, null, null, 5]],
    [[1, null, 2, null, 3]],
    [randomTree(rng, 30, () => rng.int(-1000, 1000))],
    [randomTree(rng, 700, () => rng.int(-1000, 1000))],
    [randomTree(rng, 2000, () => rng.int(-1000, 1000))],
    [bstFromSorted(Array.from({ length: 1023 }, (_, i) => i))],
  ],
  reference: {
    javascript: `function levelOrder(root) {
  const out = [];
  let level = root ? [root] : [];
  while (level.length) {
    out.push(level.map((n) => n.val));
    const next = [];
    for (const n of level) {
      if (n.left) next.push(n.left);
      if (n.right) next.push(n.right);
    }
    level = next;
  }
  return out;
}`,
    python: `def levelOrder(root):
    levels = []
    def dfs(node, depth):
        if node is None:
            return
        if depth == len(levels):
            levels.append([])
        levels[depth].append(node.val)
        dfs(node.left, depth + 1)
        dfs(node.right, depth + 1)
    dfs(root, 0)
    return levels
`,
  },
  complexity: { time: "O(n)", space: "O(width)" },
  followUps: ["How do you know where one level ends?", "How would you return a zigzag order instead?"],
};

function brokenBst(rng: Rng, n: number): Value[] {
  const tree = randomBst(rng, rng.distinct(n, -100000, 100000));
  const positions = tree.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
  const a = rng.pick(positions);
  let b = rng.pick(positions);
  while (b === a) b = rng.pick(positions);
  [tree[a], tree[b]] = [tree[b]!, tree[a]!];
  return [tree];
}

export const validateBinarySearchTree: ProblemDefinition = {
  slug: "validate-binary-search-tree",
  version: 1,
  title: "Validate Binary Search Tree",
  difficulty: "MEDIUM",
  topics: ["trees"],
  statement:
    "Given the `root` of a binary tree, return `true` if it is a valid binary search tree.\n\nIn a valid BST, every node's left subtree contains only values strictly less than the node's value, every right subtree only values strictly greater, and both subtrees are themselves valid BSTs.",
  inputDescription: "`root`: a binary tree in level order.",
  outputDescription: "`true` if the tree is a valid BST, otherwise `false`.",
  constraints: ["1 <= number of nodes <= 3000", "-2^31 <= Node.val <= 2^31 - 1"],
  signature: { functionName: "isValidBST", params: [{ name: "root", type: "TreeNode" }], returns: "bool" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[2, 1, 3]], output: true },
    { args: [[5, 1, 4, null, null, 3, 6]], output: false, explanation: "The root is 5 but its right child is 4." },
  ],
  hiddenTests: (rng) => [
    [[1]],
    [[1, 1]],
    [[2147483647]],
    [[-2147483648, null, 2147483647]],
    [[5, 4, 6, null, null, 3, 7]],
    [[10, 5, 15, null, null, 6, 20]],
    [randomBst(rng, rng.distinct(50, -1000, 1000))],
    [randomBst(rng, rng.distinct(3000, -100000, 100000))],
    brokenBst(rng, 50),
    brokenBst(rng, 3000),
  ],
  reference: {
    javascript: `function isValidBST(root) {
  const stack = [];
  let prev = null;
  let node = root;
  while (node || stack.length) {
    while (node) {
      stack.push(node);
      node = node.left;
    }
    node = stack.pop();
    if (prev !== null && node.val <= prev) return false;
    prev = node.val;
    node = node.right;
  }
  return true;
}`,
    python: `def isValidBST(root):
    def ok(node, lo, hi):
        if node is None:
            return True
        if not (lo < node.val < hi):
            return False
        return ok(node.left, lo, node.val) and ok(node.right, node.val, hi)
    return ok(root, float("-inf"), float("inf"))
`,
  },
  complexity: { time: "O(n)", space: "O(h)" },
  followUps: ["Why is comparing each node only with its children not enough?", "How do you handle values at the 32-bit limits?"],
};

export const binaryTreeMaximumPathSum: ProblemDefinition = {
  slug: "binary-tree-maximum-path-sum",
  version: 1,
  title: "Binary Tree Maximum Path Sum",
  difficulty: "HARD",
  topics: ["trees", "dynamic-programming"],
  statement:
    "A path in a binary tree is a sequence of nodes where each adjacent pair is connected by an edge; a node appears at most once and the path does not need to pass through the root. The path sum is the sum of its node values.\n\nGiven the `root` of a non-empty binary tree, return the maximum path sum of any non-empty path.",
  inputDescription: "`root`: a binary tree in level order.",
  outputDescription: "The maximum path sum.",
  constraints: ["1 <= number of nodes <= 3000", "-1000 <= Node.val <= 1000"],
  signature: { functionName: "maxPathSum", params: [{ name: "root", type: "TreeNode" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[1, 2, 3]], output: 6, explanation: "The path 2 -> 1 -> 3 has sum 6." },
    { args: [[-10, 9, 20, null, null, 15, 7]], output: 42, explanation: "The path 15 -> 20 -> 7 has sum 42." },
  ],
  hiddenTests: (rng) => [
    [[-3]],
    [[-2, -1]],
    [[2, -1]],
    [[5, 4, 8, 11, null, 13, 4, 7, 2, null, null, null, 1]],
    [randomTree(rng, 40, () => rng.int(-1000, 1000))],
    [randomTree(rng, 3000, () => rng.int(-1000, 1000))],
    [randomTree(rng, 3000, () => rng.int(-1000, -1))],
    [chain(1500, "right").map((v) => (v === null ? null : (v % 7) - 3))],
  ],
  reference: {
    javascript: `function maxPathSum(root) {
  const order = [];
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    order.push(n);
    if (n.left) stack.push(n.left);
    if (n.right) stack.push(n.right);
  }
  const gain = new Map();
  let best = -Infinity;
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i];
    const l = Math.max(0, n.left ? gain.get(n.left) : 0);
    const r = Math.max(0, n.right ? gain.get(n.right) : 0);
    best = Math.max(best, n.val + l + r);
    gain.set(n, n.val + Math.max(l, r));
  }
  return best;
}`,
    python: `def maxPathSum(root):
    best = [float("-inf")]
    def down(node):
        if node is None:
            return 0
        left = max(down(node.left), 0)
        right = max(down(node.right), 0)
        best[0] = max(best[0], node.val + left + right)
        return node.val + max(left, right)
    down(root)
    return best[0]
`,
  },
  complexity: { time: "O(n)", space: "O(h)" },
  followUps: ["What is the difference between the value you return upward and the value you record?", "Why clamp negative gains to zero?"],
};

export const kthLargestElementInAnArray: ProblemDefinition = {
  slug: "kth-largest-element-in-an-array",
  version: 1,
  title: "Kth Largest Element in an Array",
  difficulty: "MEDIUM",
  topics: ["heap", "sorting-searching"],
  statement:
    "Given an integer array `nums` and an integer `k`, return the `k`-th largest element in sorted order (not the `k`-th distinct element).\n\nCan you solve it without sorting the whole array?",
  inputDescription: "`nums`: an array of integers. `k`: the rank to return.",
  outputDescription: "The k-th largest value.",
  constraints: ["1 <= k <= nums.length <= 10^4", "-10^4 <= nums[i] <= 10^4"],
  signature: {
    functionName: "findKthLargest",
    params: [
      { name: "nums", type: "int[]" },
      { name: "k", type: "int" },
    ],
    returns: "int",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: [[3, 2, 1, 5, 6, 4], 2], output: 5 },
    { args: [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4], output: 4 },
  ],
  hiddenTests: (rng) => [
    [[1], 1],
    [[2, 1], 2],
    [[7, 7, 7, 7], 3],
    [rng.array(100, -50, 50), 17],
    [rng.array(10000, -10000, 10000), 1],
    [rng.array(10000, -10000, 10000), 5000],
    [rng.array(10000, -10000, 10000), 10000],
    [Array.from({ length: 10000 }, (_, i) => i - 5000), 2500],
  ],
  reference: {
    javascript: `function findKthLargest(nums, k) {
  const a = [...nums];
  let target = a.length - k;
  let lo = 0;
  let hi = a.length - 1;
  while (true) {
    const pivot = a[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (a[i] < pivot) i++;
      while (a[j] > pivot) j--;
      if (i <= j) {
        [a[i], a[j]] = [a[j], a[i]];
        i++;
        j--;
      }
    }
    if (target <= j) hi = j;
    else if (target >= i) lo = i;
    else return a[target];
  }
}`,
    python: `def findKthLargest(nums, k):
    heap = []
    for x in nums:
        heapq.heappush(heap, x)
        if len(heap) > k:
            heapq.heappop(heap)
    return heap[0]
`,
  },
  complexity: { time: "O(n log k) with a heap, O(n) average with quickselect", space: "O(k)" },
  followUps: ["Compare a min-heap of size k with quickselect.", "What is the worst case of quickselect and how can you avoid it?"],
};

export const lastStoneWeight: ProblemDefinition = {
  slug: "last-stone-weight",
  version: 1,
  title: "Last Stone Weight",
  difficulty: "EASY",
  topics: ["heap"],
  statement:
    "You have stones with positive integer weights. Each turn, take the two heaviest stones `x <= y` and smash them together: if `x == y` both are destroyed, otherwise the stone of weight `x` is destroyed and the other becomes `y - x`.\n\nReturn the weight of the last remaining stone, or `0` if none are left.",
  inputDescription: "`stones`: stone weights.",
  outputDescription: "The weight of the last stone, or 0.",
  constraints: ["1 <= stones.length <= 1000", "1 <= stones[i] <= 1000"],
  signature: { functionName: "lastStoneWeight", params: [{ name: "stones", type: "int[]" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[2, 7, 4, 1, 8, 1]], output: 1 },
    { args: [[1]], output: 1 },
  ],
  hiddenTests: (rng) => [[[3, 3]], [[10, 4]], [[2, 2, 2]], [rng.array(10, 1, 20)], [rng.array(300, 1, 1000)], [rng.array(1000, 1, 1000)], [Array.from({ length: 1000 }, () => 1000)]],
  reference: {
    javascript: `function lastStoneWeight(stones) {
  const a = [...stones];
  while (a.length > 1) {
    a.sort((x, y) => x - y);
    const y = a.pop();
    const x = a.pop();
    if (y !== x) a.push(y - x);
  }
  return a.length ? a[0] : 0;
}`,
    python: `def lastStoneWeight(stones):
    heap = [-s for s in stones]
    heapq.heapify(heap)
    while len(heap) > 1:
        y = -heapq.heappop(heap)
        x = -heapq.heappop(heap)
        if y != x:
            heapq.heappush(heap, -(y - x))
    return -heap[0] if heap else 0
`,
  },
  complexity: { time: "O(n log n)", space: "O(n)" },
  followUps: ["Why is a max-heap a good fit?", "How do you simulate a max-heap in a language with only a min-heap?"],
};

function kListsCase(rng: Rng, k: number, maxLen: number): Value[] {
  return [Array.from({ length: k }, () => rng.array(rng.int(0, maxLen), -10000, 10000).sort((a, b) => a - b))];
}

export const mergeKSortedLists: ProblemDefinition = {
  slug: "merge-k-sorted-lists",
  version: 1,
  title: "Merge k Sorted Lists",
  difficulty: "HARD",
  topics: ["heap", "linked-list"],
  statement:
    "You are given `k` sorted lists, each given as an array in ascending order. Merge all of them into a single sorted array and return it.\n\nAim for O(N log k) time where N is the total number of values.",
  inputDescription: "`lists`: k sorted arrays (some may be empty).",
  outputDescription: "All values in ascending order.",
  constraints: ["0 <= k <= 500", "0 <= lists[i].length <= 500", "Total number of values <= 6000", "-10^4 <= lists[i][j] <= 10^4"],
  signature: { functionName: "mergeKLists", params: [{ name: "lists", type: "int[][]" }], returns: "int[]" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[[1, 4, 5], [1, 3, 4], [2, 6]]], output: [1, 1, 2, 3, 4, 4, 5, 6] },
    { args: [[]], output: [] },
    { args: [[[]]], output: [] },
  ],
  hiddenTests: (rng) => [
    [[[5]]],
    [[[], [1], []]],
    [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]],
    kListsCase(rng, 3, 10),
    kListsCase(rng, 50, 40),
    kListsCase(rng, 500, 12),
    kListsCase(rng, 10, 500),
  ],
  reference: {
    javascript: `function mergeKLists(lists) {
  const merge = (a, b) => {
    const out = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) out.push(a[i] <= b[j] ? a[i++] : b[j++]);
    while (i < a.length) out.push(a[i++]);
    while (j < b.length) out.push(b[j++]);
    return out;
  };
  let current = lists.map((l) => [...l]);
  if (current.length === 0) return [];
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) next.push(i + 1 < current.length ? merge(current[i], current[i + 1]) : current[i]);
    current = next;
  }
  return current[0];
}`,
    python: `def mergeKLists(lists):
    heap = [(lst[0], i, 0) for i, lst in enumerate(lists) if lst]
    heapq.heapify(heap)
    out = []
    while heap:
        value, i, j = heapq.heappop(heap)
        out.append(value)
        if j + 1 < len(lists[i]):
            heapq.heappush(heap, (lists[i][j + 1], i, j + 1))
    return out
`,
  },
  complexity: { time: "O(N log k)", space: "O(k) for the heap" },
  followUps: ["Compare a heap with pairwise divide-and-conquer merging.", "What is the cost of merging the lists one by one?"],
};

export const TREES_HEAPS = [
  maximumDepthOfBinaryTree,
  invertBinaryTree,
  binaryTreeLevelOrderTraversal,
  validateBinarySearchTree,
  binaryTreeMaximumPathSum,
  kthLargestElementInAnArray,
  lastStoneWeight,
  mergeKSortedLists,
];
