import type { Value } from "@repo/core/problems";
import type { Rng } from "../rng";
import type { ProblemDefinition } from "../types";

export const subsets: ProblemDefinition = {
  slug: "subsets",
  version: 1,
  title: "Subsets",
  difficulty: "MEDIUM",
  topics: ["backtracking"],
  statement:
    "Given an integer array `nums` of distinct values, return all possible subsets (the power set).\n\nThe result must not contain duplicate subsets. Subsets, and the values inside each subset, may be returned in any order.",
  inputDescription: "`nums`: distinct integers.",
  outputDescription: "All 2^n subsets, in any order.",
  constraints: ["1 <= nums.length <= 10", "-10 <= nums[i] <= 10", "All values are distinct."],
  signature: { functionName: "subsets", params: [{ name: "nums", type: "int[]" }], returns: "int[][]" },
  comparator: { kind: "unordered", sortInner: true },
  examples: [
    { args: [[1, 2, 3]], output: [[], [1], [2], [1, 2], [3], [1, 3], [2, 3], [1, 2, 3]] },
    { args: [[0]], output: [[], [0]] },
  ],
  hiddenTests: (rng) => [[[5]], [[-1, 1]], [rng.distinct(4, -10, 10)], [rng.distinct(7, -10, 10)], [rng.distinct(9, -10, 10)], [rng.distinct(10, -10, 10)]],
  reference: {
    javascript: `function subsets(nums) {
  const out = [];
  for (let mask = 0; mask < 1 << nums.length; mask++) {
    const s = [];
    for (let i = 0; i < nums.length; i++) if (mask & (1 << i)) s.push(nums[i]);
    out.push(s);
  }
  return out;
}`,
    python: `def subsets(nums):
    out = []
    def go(i, cur):
        if i == len(nums):
            out.append(cur[:])
            return
        go(i + 1, cur)
        cur.append(nums[i])
        go(i + 1, cur)
        cur.pop()
    go(0, [])
    return out
`,
  },
  complexity: { time: "O(n * 2^n)", space: "O(n) recursion besides the output" },
  followUps: ["How does the bitmask approach map to the recursive one?", "How would you handle duplicate values?"],
};

function combinationCase(rng: Rng, count: number, target: number): Value[] {
  return [rng.distinct(count, 2, 40), target];
}

export const combinationSum: ProblemDefinition = {
  slug: "combination-sum",
  version: 1,
  title: "Combination Sum",
  difficulty: "MEDIUM",
  topics: ["backtracking"],
  statement:
    "Given an array of distinct integers `candidates` and an integer `target`, return all unique combinations of candidates that sum to `target`. The same number may be chosen any number of times.\n\nTwo combinations are the same if they use each number the same number of times. Combinations and their values may be returned in any order.",
  inputDescription: "`candidates`: distinct positive integers. `target`: the required sum.",
  outputDescription: "All unique combinations, in any order.",
  constraints: ["1 <= candidates.length <= 30", "2 <= candidates[i] <= 40", "All candidates are distinct.", "1 <= target <= 40", "The number of combinations is below 500."],
  signature: {
    functionName: "combinationSum",
    params: [
      { name: "candidates", type: "int[]" },
      { name: "target", type: "int" },
    ],
    returns: "int[][]",
  },
  comparator: { kind: "unordered", sortInner: true },
  examples: [
    { args: [[2, 3, 6, 7], 7], output: [[2, 2, 3], [7]] },
    { args: [[2, 3, 5], 8], output: [[2, 2, 2, 2], [2, 3, 3], [3, 5]] },
    { args: [[2], 1], output: [] },
  ],
  hiddenTests: (rng) => [
    [[7], 7],
    [[3, 4], 5],
    [[2, 3], 12],
    combinationCase(rng, 5, 20),
    combinationCase(rng, 10, 30),
    [[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 20],
    combinationCase(rng, 30, 25),
  ],
  reference: {
    javascript: `function combinationSum(candidates, target) {
  const c = [...candidates].sort((a, b) => a - b);
  const out = [];
  const cur = [];
  const go = (start, remaining) => {
    if (remaining === 0) {
      out.push([...cur]);
      return;
    }
    for (let i = start; i < c.length && c[i] <= remaining; i++) {
      cur.push(c[i]);
      go(i, remaining - c[i]);
      cur.pop();
    }
  };
  go(0, target);
  return out;
}`,
    python: `def combinationSum(candidates, target):
    ways = [[] for _ in range(target + 1)]
    ways[0] = [[]]
    for c in sorted(candidates):
        for t in range(c, target + 1):
            for combo in ways[t - c]:
                ways[t].append(combo + [c])
    return ways[target]
`,
  },
  complexity: { time: "Exponential in target / min(candidates)", space: "O(target) recursion depth" },
  followUps: ["How do you avoid generating permutations of the same combination?", "Which pruning does sorting enable?"],
};

export const generateParentheses: ProblemDefinition = {
  slug: "generate-parentheses",
  version: 1,
  title: "Generate Parentheses",
  difficulty: "MEDIUM",
  topics: ["backtracking"],
  statement: "Given `n` pairs of parentheses, return every combination of well-formed parentheses, in any order.",
  inputDescription: "`n`: the number of pairs.",
  outputDescription: "All well-formed strings with n pairs, in any order.",
  constraints: ["1 <= n <= 8"],
  signature: { functionName: "generateParenthesis", params: [{ name: "n", type: "int" }], returns: "string[]" },
  comparator: { kind: "unordered" },
  examples: [
    { args: [3], output: ["((()))", "(()())", "(())()", "()(())", "()()()"] },
    { args: [1], output: ["()"] },
  ],
  hiddenTests: () => [[2], [4], [5], [6], [7], [8]],
  reference: {
    javascript: `function generateParenthesis(n) {
  const out = [];
  const go = (s, open, close) => {
    if (s.length === 2 * n) {
      out.push(s);
      return;
    }
    if (open < n) go(s + "(", open + 1, close);
    if (close < open) go(s + ")", open, close + 1);
  };
  go("", 0, 0);
  return out;
}`,
    python: `def generateParenthesis(n):
    table = [[""]]
    for k in range(1, n + 1):
        table.append([
            "(" + inner + ")" + rest
            for i in range(k)
            for inner in table[i]
            for rest in table[k - 1 - i]
        ])
    return table[n]
`,
  },
  complexity: { time: "O(4^n / sqrt(n)) (the Catalan number of results)", space: "O(n) recursion" },
  followUps: ["Why is checking close < open enough to keep strings valid?", "How many results are there for n pairs?"],
};

export const nQueensII: ProblemDefinition = {
  slug: "n-queens-ii",
  version: 1,
  title: "N-Queens II",
  difficulty: "HARD",
  topics: ["backtracking"],
  statement: "Place `n` queens on an `n x n` chessboard so that no two queens attack each other (same row, column or diagonal).\n\nGiven `n`, return the number of distinct solutions.",
  inputDescription: "`n`: the board size.",
  outputDescription: "The number of distinct placements.",
  constraints: ["1 <= n <= 10"],
  signature: { functionName: "totalNQueens", params: [{ name: "n", type: "int" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: [4], output: 2 },
    { args: [1], output: 1 },
  ],
  hiddenTests: () => [[2], [3], [5], [6], [7], [8], [9], [10]],
  reference: {
    javascript: `function totalNQueens(n) {
  const full = (1 << n) - 1;
  const go = (cols, d1, d2) => {
    if (cols === full) return 1;
    let count = 0;
    let free = full & ~(cols | d1 | d2);
    while (free) {
      const bit = free & -free;
      free -= bit;
      count += go(cols | bit, ((d1 | bit) << 1) & full, (d2 | bit) >> 1);
    }
    return count;
  };
  return go(0, 0, 0);
}`,
    python: `def totalNQueens(n):
    cols, diag, anti = set(), set(), set()
    def place(r):
        if r == n:
            return 1
        total = 0
        for c in range(n):
            if c in cols or r - c in diag or r + c in anti:
                continue
            cols.add(c); diag.add(r - c); anti.add(r + c)
            total += place(r + 1)
            cols.remove(c); diag.remove(r - c); anti.remove(r + c)
        return total
    return place(0)
`,
  },
  complexity: { time: "O(n!) worst case, heavily pruned", space: "O(n)" },
  followUps: ["How do you identify the two diagonals of a cell in O(1)?", "How could bitmasks speed this up?"],
};

export const climbingStairs: ProblemDefinition = {
  slug: "climbing-stairs",
  version: 1,
  title: "Climbing Stairs",
  difficulty: "EASY",
  topics: ["dynamic-programming"],
  statement: "You are climbing a staircase with `n` steps. Each time you can climb 1 or 2 steps. In how many distinct ways can you reach the top?",
  inputDescription: "`n`: the number of steps.",
  outputDescription: "The number of distinct ways.",
  constraints: ["1 <= n <= 45"],
  signature: { functionName: "climbStairs", params: [{ name: "n", type: "int" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: [2], output: 2, explanation: "1 + 1 or 2." },
    { args: [3], output: 3, explanation: "1 + 1 + 1, 1 + 2 or 2 + 1." },
  ],
  hiddenTests: () => [[1], [4], [10], [30], [40], [44], [45]],
  reference: {
    javascript: `function climbStairs(n) {
  let a = 1;
  let b = 1;
  for (let i = 2; i <= n; i++) [a, b] = [b, a + b];
  return b;
}`,
    python: `def climbStairs(n):
    @lru_cache(maxsize=None)
    def ways(k):
        return 1 if k <= 1 else ways(k - 1) + ways(k - 2)
    return ways(n)
`,
  },
  complexity: { time: "O(n)", space: "O(1)" },
  followUps: ["What is the complexity of the naive recursive solution?", "How is this related to the Fibonacci sequence?"],
};

export const houseRobber: ProblemDefinition = {
  slug: "house-robber",
  version: 1,
  title: "House Robber",
  difficulty: "MEDIUM",
  topics: ["dynamic-programming"],
  statement:
    "Houses along a street hold `nums[i]` money each. Adjacent houses have connected alarms, so you cannot rob two adjacent houses.\n\nReturn the maximum amount you can rob.",
  inputDescription: "`nums`: money in each house.",
  outputDescription: "The maximum amount without robbing adjacent houses.",
  constraints: ["1 <= nums.length <= 5000", "0 <= nums[i] <= 400"],
  signature: { functionName: "rob", params: [{ name: "nums", type: "int[]" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[1, 2, 3, 1]], output: 4, explanation: "Rob houses 0 and 2: 1 + 3 = 4." },
    { args: [[2, 7, 9, 3, 1]], output: 12 },
  ],
  hiddenTests: (rng) => [[[5]], [[1, 2]], [[2, 1, 1, 2]], [[0, 0, 0]], [rng.array(30, 0, 400)], [rng.array(1000, 0, 400)], [rng.array(5000, 0, 400)]],
  reference: {
    javascript: `function rob(nums) {
  let take = 0;
  let skip = 0;
  for (const x of nums) [take, skip] = [skip + x, Math.max(take, skip)];
  return Math.max(take, skip);
}`,
    python: `def rob(nums):
    n = len(nums)
    dp = [0] * (n + 1)
    dp[1] = nums[0]
    for i in range(2, n + 1):
        dp[i] = max(dp[i - 1], dp[i - 2] + nums[i - 1])
    return dp[n]
`,
  },
  complexity: { time: "O(n)", space: "O(1)" },
  followUps: ["State your recurrence precisely.", "How would you handle houses arranged in a circle?"],
};

function coinCase(rng: Rng, count: number, maxCoin: number, amount: number): Value[] {
  return [rng.distinct(count, 1, maxCoin), amount];
}

export const coinChange: ProblemDefinition = {
  slug: "coin-change",
  version: 1,
  title: "Coin Change",
  difficulty: "MEDIUM",
  topics: ["dynamic-programming"],
  statement:
    "You are given coin denominations `coins` and a total `amount`. Return the fewest number of coins needed to make up `amount`, or `-1` if it cannot be made. You have an unlimited supply of every coin.",
  inputDescription: "`coins`: distinct coin values. `amount`: the target amount.",
  outputDescription: "The minimum number of coins, or -1.",
  constraints: ["1 <= coins.length <= 12", "1 <= coins[i] <= 10^4", "0 <= amount <= 10^4"],
  signature: {
    functionName: "coinChange",
    params: [
      { name: "coins", type: "int[]" },
      { name: "amount", type: "int" },
    ],
    returns: "int",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: [[1, 2, 5], 11], output: 3, explanation: "11 = 5 + 5 + 1" },
    { args: [[2], 3], output: -1 },
    { args: [[1], 0], output: 0 },
  ],
  hiddenTests: (rng) => [
    [[1], 1],
    [[2, 5, 10, 1], 27],
    [[186, 419, 83, 408], 6249],
    [[3, 7], 5],
    [[1, 3, 4], 6],
    coinCase(rng, 3, 50, 1000),
    coinCase(rng, 12, 10000, 10000),
    coinCase(rng, 6, 300, 9999),
    [[7, 11], 10000],
  ],
  reference: {
    javascript: `function coinChange(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity);
  dp[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const c of coins) if (c <= a && dp[a - c] + 1 < dp[a]) dp[a] = dp[a - c] + 1;
  }
  return dp[amount] === Infinity ? -1 : dp[amount];
}`,
    python: `def coinChange(coins, amount):
    if amount == 0:
        return 0
    seen = {0}
    frontier = [0]
    steps = 0
    while frontier:
        steps += 1
        nxt = []
        for value in frontier:
            for c in coins:
                total = value + c
                if total == amount:
                    return steps
                if total < amount and total not in seen:
                    seen.add(total)
                    nxt.append(total)
        frontier = nxt
    return -1
`,
  },
  complexity: { time: "O(amount * coins)", space: "O(amount)" },
  followUps: ["Why does a greedy choice of the largest coin fail?", "Explain your DP state and transition."],
};

export const longestIncreasingSubsequence: ProblemDefinition = {
  slug: "longest-increasing-subsequence",
  version: 1,
  title: "Longest Increasing Subsequence",
  difficulty: "MEDIUM",
  topics: ["dynamic-programming", "binary-search"],
  statement: "Given an integer array `nums`, return the length of the longest strictly increasing subsequence.",
  inputDescription: "`nums`: an array of integers.",
  outputDescription: "The length of the longest strictly increasing subsequence.",
  constraints: ["1 <= nums.length <= 2500", "-10^4 <= nums[i] <= 10^4"],
  signature: { functionName: "lengthOfLIS", params: [{ name: "nums", type: "int[]" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[10, 9, 2, 5, 3, 7, 101, 18]], output: 4, explanation: "One longest subsequence is [2, 3, 7, 101]." },
    { args: [[0, 1, 0, 3, 2, 3]], output: 4 },
    { args: [[7, 7, 7, 7, 7, 7, 7]], output: 1 },
  ],
  hiddenTests: (rng) => [
    [[1]],
    [[2, 1]],
    [[1, 3, 6, 7, 9, 4, 10, 5, 6]],
    [rng.array(50, -100, 100)],
    [rng.array(1500, -10000, 10000)],
    [Array.from({ length: 2000 }, (_, i) => i)],
    [Array.from({ length: 2000 }, (_, i) => -i)],
  ],
  reference: {
    javascript: `function lengthOfLIS(nums) {
  const tails = [];
  for (const x of nums) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
  }
  return tails.length;
}`,
    python: `def lengthOfLIS(nums):
    best = [1] * len(nums)
    for i in range(len(nums)):
        x = nums[i]
        for j in range(i):
            if nums[j] < x and best[j] + 1 > best[i]:
                best[i] = best[j] + 1
    return max(best)
`,
  },
  complexity: { time: "O(n log n) with patience sorting, O(n^2) DP", space: "O(n)" },
  followUps: ["What does the tails array represent?", "How would you reconstruct the subsequence itself?"],
};

function wordBreakCase(rng: Rng, breakable: boolean): Value[] {
  const dict = new Set<string>();
  while (dict.size < 30) dict.add(rng.string(rng.int(1, 5), "abc"));
  const words = [...dict];
  let s = "";
  while (s.length < 120) s += rng.pick(words);
  if (!breakable) s += "d";
  return [s, words];
}

export const wordBreak: ProblemDefinition = {
  slug: "word-break",
  version: 1,
  title: "Word Break",
  difficulty: "MEDIUM",
  topics: ["dynamic-programming"],
  statement:
    "Given a string `s` and a dictionary `wordDict`, return `true` if `s` can be split into a space-separated sequence of one or more dictionary words. A word may be reused any number of times.",
  inputDescription: "`s`: the string to split. `wordDict`: the dictionary words.",
  outputDescription: "`true` if s can be segmented, otherwise `false`.",
  constraints: ["1 <= s.length <= 300", "1 <= wordDict.length <= 1000", "1 <= wordDict[i].length <= 20", "All strings use lowercase letters."],
  signature: {
    functionName: "wordBreak",
    params: [
      { name: "s", type: "string" },
      { name: "wordDict", type: "string[]" },
    ],
    returns: "bool",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: ["leetcode", ["leet", "code"]], output: true },
    { args: ["applepenapple", ["apple", "pen"]], output: true },
    { args: ["catsandog", ["cats", "dog", "sand", "and", "cat"]], output: false },
  ],
  hiddenTests: (rng) => [
    ["a", ["a"]],
    ["ab", ["a"]],
    ["aaaaaaa", ["aaaa", "aaa"]],
    ["a".repeat(150) + "b", ["a", "aa", "aaa", "aaaa", "aaaaa", "aaaaaa", "aaaaaaa", "aaaaaaaa", "aaaaaaaaa", "aaaaaaaaaa"]],
    wordBreakCase(rng, true),
    wordBreakCase(rng, false),
    wordBreakCase(rng, true),
    ["ab".repeat(150), ["a", "b", "ab", "ba"]],
  ],
  reference: {
    javascript: `function wordBreak(s, wordDict) {
  const words = new Set(wordDict);
  const ok = new Array(s.length + 1).fill(false);
  ok[0] = true;
  for (let i = 1; i <= s.length; i++) {
    for (let j = Math.max(0, i - 20); j < i && !ok[i]; j++) {
      if (ok[j] && words.has(s.slice(j, i))) ok[i] = true;
    }
  }
  return ok[s.length];
}`,
    python: `def wordBreak(s, wordDict):
    words = sorted(set(wordDict))
    n = len(s)
    can = [False] * (n + 1)
    can[n] = True
    for i in range(n - 1, -1, -1):
        can[i] = any(s.startswith(w, i) and can[i + len(w)] for w in words)
    return can[0]
`,
  },
  complexity: { time: "O(n * L) substring checks with L the max word length", space: "O(n)" },
  followUps: ["Why does plain recursion blow up on inputs like 'aaaa...ab'?", "How does bounding by the longest word length help?"],
};

function editCase(rng: Rng, m: number, n: number, alphabet: string): Value[] {
  return [rng.string(m, alphabet), rng.string(n, alphabet)];
}

export const editDistance: ProblemDefinition = {
  slug: "edit-distance",
  version: 1,
  title: "Edit Distance",
  difficulty: "HARD",
  topics: ["dynamic-programming"],
  statement:
    "Given two strings `word1` and `word2`, return the minimum number of operations needed to convert `word1` into `word2`. The allowed operations are inserting a character, deleting a character and replacing a character.",
  inputDescription: "`word1`, `word2`: lowercase strings (either may be empty).",
  outputDescription: "The minimum number of edits.",
  constraints: ["0 <= word1.length, word2.length <= 400", "Both strings use lowercase English letters."],
  signature: {
    functionName: "minDistance",
    params: [
      { name: "word1", type: "string" },
      { name: "word2", type: "string" },
    ],
    returns: "int",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: ["horse", "ros"], output: 3, explanation: "horse -> rorse -> rose -> ros" },
    { args: ["intention", "execution"], output: 5 },
  ],
  hiddenTests: (rng) => [
    ["", ""],
    ["", "abc"],
    ["abc", ""],
    ["same", "same"],
    ["kitten", "sitting"],
    editCase(rng, 20, 25, "abc"),
    editCase(rng, 400, 400, "abcdefghijklmnopqrstuvwxyz"),
    editCase(rng, 400, 350, "ab"),
  ],
  reference: {
    javascript: `function minDistance(word1, word2) {
  const m = word1.length;
  const n = word2.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = word1[i - 1] === word2[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}`,
    python: `def minDistance(word1, word2):
    @lru_cache(maxsize=None)
    def d(i, j):
        if i == 0:
            return j
        if j == 0:
            return i
        if word1[i - 1] == word2[j - 1]:
            return d(i - 1, j - 1)
        return 1 + min(d(i - 1, j - 1), d(i - 1, j), d(i, j - 1))
    for i in range(len(word1) + 1):
        d(i, len(word2))
    return d(len(word1), len(word2))
`,
  },
  complexity: { time: "O(m * n)", space: "O(min(m, n)) with a rolling row" },
  followUps: ["Explain what dp[i][j] means.", "How do you reduce memory to one row?"],
};

export const BACKTRACKING_DP = [
  subsets,
  combinationSum,
  generateParentheses,
  nQueensII,
  climbingStairs,
  houseRobber,
  coinChange,
  longestIncreasingSubsequence,
  wordBreak,
  editDistance,
];
