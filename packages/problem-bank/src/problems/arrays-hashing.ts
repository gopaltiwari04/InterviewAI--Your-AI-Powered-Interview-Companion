import type { Value } from "@repo/core/problems";
import type { Rng } from "../rng";
import type { ProblemDefinition } from "../types";

function countPairs(nums: number[], target: number): number {
  let count = 0;
  for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (nums[i]! + nums[j]! === target) count++;
  return count;
}

function twoSumCase(rng: Rng, n: number, lo: number, hi: number): Value[] {
  for (;;) {
    const nums = rng.array(n, lo, hi);
    const i = rng.int(0, n - 2);
    const j = rng.int(i + 1, n - 1);
    const target = nums[i]! + nums[j]!;
    if (countPairs(nums, target) === 1) return [nums, target];
  }
}

export const twoSum: ProblemDefinition = {
  slug: "two-sum",
  version: 1,
  title: "Two Sum",
  difficulty: "EASY",
  topics: ["hashing", "arrays-strings"],
  statement:
    "Given an array of integers `nums` and an integer `target`, return the indices of the two numbers that add up to `target`.\n\nExactly one pair of indices `i != j` satisfies `nums[i] + nums[j] == target`. You may not use the same element twice. Return the two indices in any order.",
  inputDescription: "`nums`: an array of integers. `target`: the required sum.",
  outputDescription: "An array with the two indices, in any order.",
  constraints: ["2 <= nums.length <= 2000", "-5 * 10^8 <= nums[i] <= 5 * 10^8", "-10^9 <= target <= 10^9", "Exactly one valid answer exists."],
  signature: {
    functionName: "twoSum",
    params: [
      { name: "nums", type: "int[]" },
      { name: "target", type: "int" },
    ],
    returns: "int[]",
  },
  comparator: { kind: "unordered" },
  examples: [
    { args: [[2, 7, 11, 15], 9], output: [0, 1], explanation: "nums[0] + nums[1] == 9." },
    { args: [[3, 2, 4], 6], output: [1, 2] },
    { args: [[3, 3], 6], output: [0, 1] },
  ],
  hiddenTests: (rng) => [
    [[1, -1], 0],
    [[0, 4, 3, 0], 0],
    [[-3, 4, 3, 90], 0],
    [[500000000, 499999999, -500000000], 999999999],
    twoSumCase(rng, 10, -20, 20),
    twoSumCase(rng, 100, -1000, 1000),
    twoSumCase(rng, 500, -500000000, 500000000),
    twoSumCase(rng, 2000, -500000000, 500000000),
    twoSumCase(rng, 2000, -500000000, 500000000),
  ],
  reference: {
    javascript: `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return [];
}`,
    python: `def twoSum(nums, target):
    order = sorted(range(len(nums)), key=lambda i: nums[i])
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        s = nums[order[lo]] + nums[order[hi]]
        if s == target:
            return sorted([order[lo], order[hi]])
        if s < target:
            lo += 1
        else:
            hi -= 1
    return []
`,
  },
  complexity: { time: "O(n)", space: "O(n)" },
  followUps: [
    "What is the time and space complexity of your approach?",
    "How would you solve it with O(1) extra space, and what would that cost?",
    "What changes if the array is already sorted?",
  ],
};

export const bestTimeToBuyAndSellStock: ProblemDefinition = {
  slug: "best-time-to-buy-and-sell-stock",
  version: 1,
  title: "Best Time to Buy and Sell Stock",
  difficulty: "EASY",
  topics: ["arrays-strings", "greedy"],
  statement:
    "You are given an array `prices` where `prices[i]` is the price of a stock on day `i`.\n\nChoose a single day to buy one share and a later day to sell it. Return the maximum profit you can achieve. If no profit is possible, return `0`.",
  inputDescription: "`prices`: daily stock prices.",
  outputDescription: "The maximum achievable profit.",
  constraints: ["1 <= prices.length <= 5000", "0 <= prices[i] <= 10^4"],
  signature: { functionName: "maxProfit", params: [{ name: "prices", type: "int[]" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[7, 1, 5, 3, 6, 4]], output: 5, explanation: "Buy on day 1 (price 1) and sell on day 4 (price 6)." },
    { args: [[7, 6, 4, 3, 1]], output: 0, explanation: "Prices only fall, so no transaction is made." },
  ],
  hiddenTests: (rng) => [
    [[5]],
    [[1, 2]],
    [[2, 1]],
    [[3, 3, 3, 3]],
    [[2, 4, 1, 7]],
    [rng.array(50, 0, 100)],
    [rng.array(1000, 0, 10000)],
    [rng.array(5000, 0, 10000)],
    [Array.from({ length: 5000 }, (_, i) => 10000 - (i % 10000))],
  ],
  reference: {
    javascript: `function maxProfit(prices) {
  let best = 0;
  let low = Infinity;
  for (const p of prices) {
    if (p < low) low = p;
    else if (p - low > best) best = p - low;
  }
  return best;
}`,
    python: `def maxProfit(prices):
    best = cur = 0
    for i in range(1, len(prices)):
        cur = max(0, cur + prices[i] - prices[i - 1])
        best = max(best, cur)
    return best
`,
  },
  complexity: { time: "O(n)", space: "O(1)" },
  followUps: [
    "Why is a single pass enough?",
    "How would you change the solution if you could make unlimited transactions?",
  ],
};

function productCase(rng: Rng, n: number, zeros: number): Value[] {
  const nums: number[] = Array.from({ length: n }, () => (rng.bool() ? 1 : -1));
  const big = Math.min(12, n);
  for (let k = 0; k < big; k++) nums[rng.int(0, n - 1)] = rng.pick([-4, -3, -2, 2, 3, 4]);
  for (let k = 0; k < zeros; k++) nums[rng.int(0, n - 1)] = 0;
  return [nums];
}

export const productOfArrayExceptSelf: ProblemDefinition = {
  slug: "product-of-array-except-self",
  version: 1,
  title: "Product of Array Except Self",
  difficulty: "MEDIUM",
  topics: ["arrays-strings"],
  statement:
    "Given an integer array `nums`, return an array `answer` where `answer[i]` is the product of all elements of `nums` except `nums[i]`.\n\nSolve it in O(n) time without using division.",
  inputDescription: "`nums`: an array of integers.",
  outputDescription: "The array of products.",
  constraints: [
    "2 <= nums.length <= 2000",
    "-30 <= nums[i] <= 30",
    "Every prefix and suffix product fits in a 32-bit signed integer.",
  ],
  signature: { functionName: "productExceptSelf", params: [{ name: "nums", type: "int[]" }], returns: "int[]" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[1, 2, 3, 4]], output: [24, 12, 8, 6] },
    { args: [[-1, 1, 0, -3, 3]], output: [0, 0, 9, 0, 0] },
  ],
  hiddenTests: (rng) => [
    [[5, 7]],
    [[0, 0]],
    [[0, 4]],
    [[2, 3, 0, 4]],
    productCase(rng, 10, 0),
    productCase(rng, 100, 0),
    productCase(rng, 100, 1),
    productCase(rng, 2000, 0),
    productCase(rng, 2000, 2),
  ],
  reference: {
    javascript: `function productExceptSelf(nums) {
  const n = nums.length;
  const out = new Array(n).fill(1);
  for (let i = 1; i < n; i++) out[i] = out[i - 1] * nums[i - 1];
  let suffix = 1;
  for (let i = n - 1; i >= 0; i--) {
    out[i] = out[i] * suffix;
    suffix *= nums[i];
  }
  return out.map((x) => (x === 0 ? 0 : x));
}`,
    python: `def productExceptSelf(nums):
    n = len(nums)
    prefix = [1] * (n + 1)
    suffix = [1] * (n + 1)
    for i in range(n):
        prefix[i + 1] = prefix[i] * nums[i]
    for i in range(n - 1, -1, -1):
        suffix[i] = suffix[i + 1] * nums[i]
    return [prefix[i] * suffix[i + 1] for i in range(n)]
`,
  },
  complexity: { time: "O(n)", space: "O(1) extra (output excluded)" },
  followUps: [
    "Why is division a problem here, especially with zeros?",
    "Can you reduce the extra space to O(1) beyond the output array?",
  ],
};

export const validAnagram: ProblemDefinition = {
  slug: "valid-anagram",
  version: 1,
  title: "Valid Anagram",
  difficulty: "EASY",
  topics: ["hashing", "arrays-strings"],
  statement:
    "Given two strings `s` and `t`, return `true` if `t` is an anagram of `s` (it uses exactly the same letters with the same counts), and `false` otherwise.",
  inputDescription: "`s` and `t`: strings of lowercase English letters.",
  outputDescription: "`true` if `t` is an anagram of `s`, otherwise `false`.",
  constraints: ["1 <= s.length, t.length <= 5000", "s and t consist of lowercase English letters."],
  signature: {
    functionName: "isAnagram",
    params: [
      { name: "s", type: "string" },
      { name: "t", type: "string" },
    ],
    returns: "bool",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: ["anagram", "nagaram"], output: true },
    { args: ["rat", "car"], output: false },
  ],
  hiddenTests: (rng) => {
    const base = rng.string(5000, "abcdefghijklmnopqrstuvwxyz");
    const shuffled = rng.shuffle(base.split("")).join("");
    const changed = shuffled.slice(0, -1) + (shuffled.endsWith("a") ? "b" : "a");
    return [
      ["a", "a"],
      ["a", "b"],
      ["ab", "a"],
      ["aacc", "ccac"],
      ["listen", "silent"],
      [base, shuffled],
      [base, changed],
      [rng.string(3000, "ab"), rng.string(3000, "ab")],
    ];
  },
  reference: {
    javascript: `function isAnagram(s, t) {
  if (s.length !== t.length) return false;
  const counts = new Array(26).fill(0);
  for (let i = 0; i < s.length; i++) {
    counts[s.charCodeAt(i) - 97]++;
    counts[t.charCodeAt(i) - 97]--;
  }
  return counts.every((c) => c === 0);
}`,
    python: `def isAnagram(s, t):
    return sorted(s) == sorted(t)
`,
  },
  complexity: { time: "O(n)", space: "O(1) (26 counters)" },
  followUps: ["How would your solution change for arbitrary Unicode input?", "Compare sorting with counting."],
};

function topKCase(rng: Rng, distinct: number, k: number): Value[] {
  for (;;) {
    const values = rng.distinct(distinct, -10000, 10000);
    const counts = values.map(() => rng.int(1, 40));
    const sorted = [...counts].sort((a, b) => b - a);
    if (k < distinct && sorted[k - 1] === sorted[k]) continue;
    const nums: number[] = [];
    values.forEach((v, i) => {
      for (let c = 0; c < counts[i]!; c++) nums.push(v);
    });
    return [rng.shuffle(nums), k];
  }
}

export const topKFrequentElements: ProblemDefinition = {
  slug: "top-k-frequent-elements",
  version: 1,
  title: "Top K Frequent Elements",
  difficulty: "MEDIUM",
  topics: ["hashing", "heap"],
  statement:
    "Given an integer array `nums` and an integer `k`, return the `k` most frequent elements. You may return the answer in any order.\n\nThe answer is guaranteed to be unique.",
  inputDescription: "`nums`: an array of integers. `k`: how many elements to return.",
  outputDescription: "The `k` most frequent values, in any order.",
  constraints: ["1 <= nums.length <= 5000", "-10^4 <= nums[i] <= 10^4", "1 <= k <= number of distinct values", "The answer is unique."],
  signature: {
    functionName: "topKFrequent",
    params: [
      { name: "nums", type: "int[]" },
      { name: "k", type: "int" },
    ],
    returns: "int[]",
  },
  comparator: { kind: "unordered" },
  examples: [
    { args: [[1, 1, 1, 2, 2, 3], 2], output: [1, 2] },
    { args: [[1], 1], output: [1] },
  ],
  hiddenTests: (rng) => [
    [[4, 4, -1, -1, -1, 2], 1],
    [[5, 6, 7], 3],
    topKCase(rng, 5, 2),
    topKCase(rng, 20, 5),
    topKCase(rng, 60, 10),
    topKCase(rng, 120, 1),
    topKCase(rng, 120, 30),
    topKCase(rng, 120, 120),
  ],
  reference: {
    javascript: `function topKFrequent(nums, k) {
  const freq = new Map();
  for (const x of nums) freq.set(x, (freq.get(x) || 0) + 1);
  const buckets = Array.from({ length: nums.length + 1 }, () => []);
  for (const [value, count] of freq) buckets[count].push(value);
  const out = [];
  for (let c = nums.length; c > 0 && out.length < k; c--) {
    for (const v of buckets[c]) {
      if (out.length < k) out.push(v);
    }
  }
  return out;
}`,
    python: `def topKFrequent(nums, k):
    counts = Counter(nums)
    return [v for v, _ in heapq.nlargest(k, counts.items(), key=lambda item: item[1])]
`,
  },
  complexity: { time: "O(n) with bucket sort, O(n log k) with a heap", space: "O(n)" },
  followUps: ["Compare a heap-based solution with bucket sort.", "How would you handle a stream of numbers?"],
};

export const longestConsecutiveSequence: ProblemDefinition = {
  slug: "longest-consecutive-sequence",
  version: 1,
  title: "Longest Consecutive Sequence",
  difficulty: "MEDIUM",
  topics: ["hashing"],
  statement:
    "Given an unsorted array of integers `nums`, return the length of the longest run of consecutive integers (`x, x+1, x+2, ...`) whose values all appear in `nums`.\n\nAim for O(n) time.",
  inputDescription: "`nums`: an unsorted array of integers (may contain duplicates).",
  outputDescription: "The length of the longest consecutive sequence.",
  constraints: ["0 <= nums.length <= 5000", "-10^9 <= nums[i] <= 10^9"],
  signature: { functionName: "longestConsecutive", params: [{ name: "nums", type: "int[]" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[100, 4, 200, 1, 3, 2]], output: 4, explanation: "The longest run is [1, 2, 3, 4]." },
    { args: [[0, 3, 7, 2, 5, 8, 4, 6, 0, 1]], output: 9 },
  ],
  hiddenTests: (rng) => [
    [[]],
    [[7]],
    [[1, 1, 1]],
    [[-1, 0, 1, 1000000000, -1000000000]],
    [rng.shuffle(Array.from({ length: 3000 }, (_, i) => i - 1500))],
    [rng.array(5000, -3000, 3000)],
    [rng.array(5000, -1000000000, 1000000000)],
    [rng.shuffle([...Array.from({ length: 50 }, (_, i) => i * 2), ...Array.from({ length: 40 }, (_, i) => 1000 + i)])],
  ],
  reference: {
    javascript: `function longestConsecutive(nums) {
  const set = new Set(nums);
  let best = 0;
  for (const x of set) {
    if (set.has(x - 1)) continue;
    let len = 1;
    while (set.has(x + len)) len++;
    if (len > best) best = len;
  }
  return best;
}`,
    python: `def longestConsecutive(nums):
    values = sorted(set(nums))
    best = 0
    run = 0
    for i, v in enumerate(values):
        run = run + 1 if i > 0 and v == values[i - 1] + 1 else 1
        best = max(best, run)
    return best
`,
  },
  complexity: { time: "O(n)", space: "O(n)" },
  followUps: ["Why is the hash-set solution O(n) even though it has a nested loop?", "When would sorting be preferable?"],
};

export const subarraySumEqualsK: ProblemDefinition = {
  slug: "subarray-sum-equals-k",
  version: 1,
  title: "Subarray Sum Equals K",
  difficulty: "MEDIUM",
  topics: ["hashing", "arrays-strings"],
  statement:
    "Given an array of integers `nums` and an integer `k`, return the number of non-empty contiguous subarrays whose elements sum to `k`.",
  inputDescription: "`nums`: an array of integers (may be negative). `k`: the target sum.",
  outputDescription: "The number of subarrays that sum to `k`.",
  constraints: ["1 <= nums.length <= 5000", "-1000 <= nums[i] <= 1000", "-10^7 <= k <= 10^7"],
  signature: {
    functionName: "subarraySum",
    params: [
      { name: "nums", type: "int[]" },
      { name: "k", type: "int" },
    ],
    returns: "int",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: [[1, 1, 1], 2], output: 2 },
    { args: [[1, 2, 3], 3], output: 2 },
  ],
  hiddenTests: (rng) => [
    [[0], 0],
    [[5], 3],
    [[0, 0, 0, 0], 0],
    [[1, -1, 1, -1], 0],
    [[-1, -1, 1], 0],
    [rng.array(100, -10, 10), 5],
    [rng.array(2000, -3, 3), 0],
    [rng.array(5000, -1000, 1000), 1000],
    [Array.from({ length: 5000 }, () => 0), 0],
  ],
  reference: {
    javascript: `function subarraySum(nums, k) {
  const seen = new Map([[0, 1]]);
  let sum = 0;
  let count = 0;
  for (const x of nums) {
    sum += x;
    count += seen.get(sum - k) || 0;
    seen.set(sum, (seen.get(sum) || 0) + 1);
  }
  return count;
}`,
    python: `def subarraySum(nums, k):
    prefix = [0]
    for x in nums:
        prefix.append(prefix[-1] + x)
    counts = defaultdict(int)
    total = 0
    for p in prefix:
        total += counts[p - k]
        counts[p] += 1
    return total
`,
  },
  complexity: { time: "O(n)", space: "O(n)" },
  followUps: ["Why does a sliding window not work when values can be negative?", "What does the hash map store and why initialise it with 0?"],
};

export const ARRAYS_HASHING = [
  twoSum,
  bestTimeToBuyAndSellStock,
  productOfArrayExceptSelf,
  validAnagram,
  topKFrequentElements,
  longestConsecutiveSequence,
  subarraySumEqualsK,
];
