import type { Value } from "@repo/core/problems";
import type { Rng } from "../rng";
import type { ProblemDefinition } from "../types";

const PRINTABLE = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

function palindromeCase(rng: Rng, half: number, breakIt: boolean): Value[] {
  const letters = "abcdefghijklmnopqrstuvwxyz0123456789";
  const core = rng.string(half, letters);
  let s = core + rng.string(1, letters) + core.split("").reverse().join("");
  if (breakIt) {
    const i = rng.int(0, half - 1);
    const replacement = s[i] === "a" ? "b" : "a";
    s = s.slice(0, i) + replacement + s.slice(i + 1);
  }
  // Sprinkle punctuation and upper case, which the comparison must ignore.
  let decorated = "";
  for (const ch of s) {
    decorated += rng.bool(0.3) ? ch.toUpperCase() : ch;
    if (rng.bool(0.2)) decorated += rng.pick([" ", ",", ".", ":", "!", "-"]);
  }
  return [decorated];
}

export const validPalindrome: ProblemDefinition = {
  slug: "valid-palindrome",
  version: 1,
  title: "Valid Palindrome",
  difficulty: "EASY",
  topics: ["two-pointers", "arrays-strings"],
  statement:
    "A phrase is a palindrome if, after converting all upper-case letters to lower case and removing every non-alphanumeric character, it reads the same forwards and backwards.\n\nGiven a string `s`, return `true` if it is a palindrome and `false` otherwise.",
  inputDescription: "`s`: a line of printable ASCII characters (it may contain spaces).",
  outputDescription: "`true` if `s` is a palindrome, otherwise `false`.",
  constraints: ["1 <= s.length <= 5000", "s consists of printable ASCII characters."],
  signature: { functionName: "isPalindrome", params: [{ name: "s", type: "string" }], returns: "bool" },
  comparator: { kind: "exact" },
  examples: [
    { args: ["A man, a plan, a canal: Panama"], output: true, explanation: '"amanaplanacanalpanama" is a palindrome.' },
    { args: ["race a car"], output: false },
    { args: [" "], output: true, explanation: "After removing non-alphanumerics the string is empty." },
  ],
  hiddenTests: (rng) => [
    ["a"],
    ["ab"],
    ["0P"],
    [".,"],
    ["No 'x' in Nixon"],
    palindromeCase(rng, 20, false),
    palindromeCase(rng, 20, true),
    palindromeCase(rng, 1500, false),
    palindromeCase(rng, 1500, true),
    [rng.string(4000, PRINTABLE)],
  ],
  reference: {
    javascript: `function isPalindrome(s) {
  const ok = (c) => /[a-z0-9]/i.test(c);
  let i = 0;
  let j = s.length - 1;
  while (i < j) {
    if (!ok(s[i])) { i++; continue; }
    if (!ok(s[j])) { j--; continue; }
    if (s[i].toLowerCase() !== s[j].toLowerCase()) return false;
    i++;
    j--;
  }
  return true;
}`,
    python: `def isPalindrome(s):
    cleaned = [c.lower() for c in s if c.isascii() and c.isalnum()]
    return cleaned == cleaned[::-1]
`,
  },
  complexity: { time: "O(n)", space: "O(1) with two pointers" },
  followUps: ["How does your solution avoid allocating a cleaned copy?", "What if you may delete at most one character?"],
};

export const threeSum: ProblemDefinition = {
  slug: "three-sum",
  version: 1,
  title: "3Sum",
  difficulty: "MEDIUM",
  topics: ["two-pointers", "sorting-searching"],
  statement:
    "Given an integer array `nums`, return all unique triplets `[nums[i], nums[j], nums[k]]` with distinct indices `i`, `j`, `k` such that the three values sum to `0`.\n\nThe result must not contain duplicate triplets. Triplets and the values inside each triplet may be returned in any order.",
  inputDescription: "`nums`: an array of integers.",
  outputDescription: "All unique zero-sum triplets, in any order.",
  constraints: ["3 <= nums.length <= 600", "-10^5 <= nums[i] <= 10^5"],
  signature: { functionName: "threeSum", params: [{ name: "nums", type: "int[]" }], returns: "int[][]" },
  comparator: { kind: "unordered", sortInner: true },
  examples: [
    { args: [[-1, 0, 1, 2, -1, -4]], output: [[-1, -1, 2], [-1, 0, 1]] },
    { args: [[0, 1, 1]], output: [] },
    { args: [[0, 0, 0]], output: [[0, 0, 0]] },
  ],
  hiddenTests: (rng) => [
    [[0, 0, 0, 0]],
    [[1, 2, -2, -1]],
    [[-2, 0, 1, 1, 2]],
    [[3, 0, -2, -1, 1, 2]],
    [rng.array(30, -10, 10)],
    [rng.array(150, -20, 20)],
    [rng.array(600, -100000, 100000)],
    [rng.array(600, -50, 50)],
  ],
  reference: {
    javascript: `function threeSum(nums) {
  const a = [...nums].sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i < a.length - 2; i++) {
    if (i > 0 && a[i] === a[i - 1]) continue;
    let lo = i + 1;
    let hi = a.length - 1;
    while (lo < hi) {
      const s = a[i] + a[lo] + a[hi];
      if (s === 0) {
        out.push([a[i], a[lo], a[hi]]);
        while (lo < hi && a[lo] === a[lo + 1]) lo++;
        while (lo < hi && a[hi] === a[hi - 1]) hi--;
        lo++;
        hi--;
      } else if (s < 0) lo++;
      else hi--;
    }
  }
  return out;
}`,
    python: `def threeSum(nums):
    found = set()
    for i in range(len(nums)):
        seen = set()
        for j in range(i + 1, len(nums)):
            need = -nums[i] - nums[j]
            if need in seen:
                found.add(tuple(sorted((nums[i], nums[j], need))))
            seen.add(nums[j])
    return [list(t) for t in found]
`,
  },
  complexity: { time: "O(n^2)", space: "O(1) extra besides sorting" },
  followUps: ["How do you avoid duplicate triplets without a set?", "Why sort first?"],
};

export const containerWithMostWater: ProblemDefinition = {
  slug: "container-with-most-water",
  version: 1,
  title: "Container With Most Water",
  difficulty: "MEDIUM",
  topics: ["two-pointers", "greedy"],
  statement:
    "You are given an array `height` of `n` vertical lines, where line `i` has height `height[i]`. Two lines and the x-axis form a container.\n\nReturn the maximum amount of water a container can store: for lines `i < j` it is `(j - i) * min(height[i], height[j])`.",
  inputDescription: "`height`: line heights.",
  outputDescription: "The maximum area.",
  constraints: ["2 <= height.length <= 5000", "0 <= height[i] <= 10^4"],
  signature: { functionName: "maxArea", params: [{ name: "height", type: "int[]" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[1, 8, 6, 2, 5, 4, 8, 3, 7]], output: 49, explanation: "Lines 1 and 8 (heights 8 and 7) hold 7 * 7 = 49." },
    { args: [[1, 1]], output: 1 },
  ],
  hiddenTests: (rng) => [
    [[0, 0]],
    [[4, 3, 2, 1, 4]],
    [[1, 2, 1]],
    [[2, 3, 10, 5, 7, 8, 9]],
    [rng.array(100, 0, 100)],
    [rng.array(5000, 0, 10000)],
    [Array.from({ length: 5000 }, (_, i) => i % 10001)],
    [Array.from({ length: 5000 }, () => 10000)],
  ],
  reference: {
    javascript: `function maxArea(height) {
  let i = 0;
  let j = height.length - 1;
  let best = 0;
  while (i < j) {
    best = Math.max(best, (j - i) * Math.min(height[i], height[j]));
    if (height[i] < height[j]) i++;
    else j--;
  }
  return best;
}`,
    python: `def maxArea(height):
    best = 0
    left, right = 0, len(height) - 1
    while left < right:
        h = min(height[left], height[right])
        best = max(best, h * (right - left))
        while left < right and height[left] <= h:
            left += 1
        while left < right and height[right] <= h:
            right -= 1
    return best
`,
  },
  complexity: { time: "O(n)", space: "O(1)" },
  followUps: ["Why is it safe to move the pointer at the shorter line?", "What is the brute-force complexity?"],
};

export const longestSubstringWithoutRepeatingCharacters: ProblemDefinition = {
  slug: "longest-substring-without-repeating-characters",
  version: 1,
  title: "Longest Substring Without Repeating Characters",
  difficulty: "MEDIUM",
  topics: ["sliding-window", "hashing"],
  statement: "Given a string `s`, return the length of the longest substring that contains no repeated characters.",
  inputDescription: "`s`: a line of printable ASCII characters (may contain spaces, may be empty).",
  outputDescription: "The length of the longest substring without repeating characters.",
  constraints: ["0 <= s.length <= 5000", "s consists of printable ASCII characters."],
  signature: { functionName: "lengthOfLongestSubstring", params: [{ name: "s", type: "string" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: ["abcabcbb"], output: 3, explanation: 'The answer is "abc".' },
    { args: ["bbbbb"], output: 1 },
    { args: ["pwwkew"], output: 3, explanation: 'The answer is "wke".' },
  ],
  hiddenTests: (rng) => [
    [""],
    [" "],
    ["au"],
    ["dvdf"],
    ["abba"],
    ["tmmzuxt"],
    [rng.string(200, "abc")],
    [rng.string(5000, PRINTABLE)],
    [rng.string(5000, "abcdefghijklmnopqrstuvwxyz")],
  ],
  reference: {
    javascript: `function lengthOfLongestSubstring(s) {
  const last = new Map();
  let start = 0;
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    const prev = last.get(s[i]);
    if (prev !== undefined && prev >= start) start = prev + 1;
    last.set(s[i], i);
    best = Math.max(best, i - start + 1);
  }
  return best;
}`,
    python: `def lengthOfLongestSubstring(s):
    window = set()
    left = best = 0
    for right, ch in enumerate(s):
        while ch in window:
            window.remove(s[left])
            left += 1
        window.add(ch)
        best = max(best, right - left + 1)
    return best
`,
  },
  complexity: { time: "O(n)", space: "O(min(n, alphabet))" },
  followUps: ["What invariant does your window maintain?", "How would you return the substring itself?"],
};

/** Returns [minLength, numberOfMinimalWindows] for the minimum-window problem. */
function minWindowStats(s: string, t: string): [number, number] {
  const need = new Map<string, number>();
  for (const c of t) need.set(c, (need.get(c) ?? 0) + 1);
  const covers = (counts: Map<string, number>) => [...need].every(([c, n]) => (counts.get(c) ?? 0) >= n);
  let best = Infinity;
  const counts = new Map<string, number>();
  let left = 0;
  for (let right = 0; right < s.length; right++) {
    counts.set(s[right]!, (counts.get(s[right]!) ?? 0) + 1);
    while (covers(counts)) {
      best = Math.min(best, right - left + 1);
      counts.set(s[left]!, counts.get(s[left]!)! - 1);
      left++;
    }
  }
  if (best === Infinity) return [0, 0];
  let windows = 0;
  for (let i = 0; i + best <= s.length; i++) {
    const c = new Map<string, number>();
    for (let j = i; j < i + best; j++) c.set(s[j]!, (c.get(s[j]!) ?? 0) + 1);
    if (covers(c)) windows++;
  }
  return [best, windows];
}

function minWindowCase(rng: Rng, n: number, m: number, alphabet: string, allowEmpty = false): Value[] {
  for (;;) {
    const s = rng.string(n, alphabet);
    const t = rng.string(m, alphabet);
    const [, windows] = minWindowStats(s, t);
    if (windows === 1 || (allowEmpty && windows === 0)) return [s, t];
  }
}

export const minimumWindowSubstring: ProblemDefinition = {
  slug: "minimum-window-substring",
  version: 1,
  title: "Minimum Window Substring",
  difficulty: "HARD",
  topics: ["sliding-window", "hashing"],
  statement:
    'Given strings `s` and `t`, return the shortest substring of `s` that contains every character of `t`, including duplicates. If no such substring exists, return the empty string `""`.\n\nThe tests guarantee that the shortest window is unique.',
  inputDescription: "`s`: the string to search. `t`: the characters that must be covered.",
  outputDescription: "The minimum window, or an empty line if none exists.",
  constraints: ["1 <= s.length, t.length <= 2000", "s and t consist of English letters.", "The answer is unique."],
  signature: {
    functionName: "minWindow",
    params: [
      { name: "s", type: "string" },
      { name: "t", type: "string" },
    ],
    returns: "string",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: ["ADOBECODEBANC", "ABC"], output: "BANC" },
    { args: ["a", "a"], output: "a" },
    { args: ["a", "aa"], output: "", explanation: "t needs two 'a's but s has only one." },
  ],
  hiddenTests: (rng) => [
    ["ab", "b"],
    ["abc", "cba"],
    ["aa", "aa"],
    ["xyz", "q"],
    minWindowCase(rng, 30, 3, "abcd"),
    minWindowCase(rng, 200, 5, "abcdefgh"),
    minWindowCase(rng, 400, 12, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    minWindowCase(rng, 1200, 20, "abcdefghijklmnopqrstuvwxyz"),
    minWindowCase(rng, 50, 60, "ab", true),
  ],
  reference: {
    javascript: `function minWindow(s, t) {
  const need = new Map();
  for (const c of t) need.set(c, (need.get(c) || 0) + 1);
  let missing = t.length;
  let left = 0;
  let bestStart = 0;
  let bestLen = Infinity;
  for (let right = 0; right < s.length; right++) {
    const c = s[right];
    if (need.has(c)) {
      if (need.get(c) > 0) missing--;
      need.set(c, need.get(c) - 1);
    }
    while (missing === 0) {
      if (right - left + 1 < bestLen) {
        bestLen = right - left + 1;
        bestStart = left;
      }
      const d = s[left++];
      if (need.has(d)) {
        need.set(d, need.get(d) + 1);
        if (need.get(d) > 0) missing++;
      }
    }
  }
  return bestLen === Infinity ? "" : s.slice(bestStart, bestStart + bestLen);
}`,
    python: `def minWindow(s, t):
    need = Counter(t)
    required = len(need)
    window = Counter()
    formed = 0
    best = (float("inf"), 0, 0)
    left = 0
    for right, ch in enumerate(s):
        window[ch] += 1
        if ch in need and window[ch] == need[ch]:
            formed += 1
        while formed == required:
            if right - left + 1 < best[0]:
                best = (right - left + 1, left, right + 1)
            out = s[left]
            window[out] -= 1
            if out in need and window[out] < need[out]:
                formed -= 1
            left += 1
    return "" if best[0] == float("inf") else s[best[1]:best[2]]
`,
  },
  complexity: { time: "O(|s| + |t|)", space: "O(alphabet)" },
  followUps: ["Explain when the window shrinks and why that is safe.", "How do you track whether the window is valid in O(1)?"],
};

export const slidingWindowMaximum: ProblemDefinition = {
  slug: "sliding-window-maximum",
  version: 1,
  title: "Sliding Window Maximum",
  difficulty: "HARD",
  topics: ["sliding-window", "stack-queue"],
  statement:
    "You are given an integer array `nums` and a window size `k`. A window of size `k` slides from the left end of the array to the right end, one position at a time.\n\nReturn an array containing the maximum of each window.",
  inputDescription: "`nums`: an array of integers. `k`: the window size.",
  outputDescription: "The maximum of each of the `n - k + 1` windows.",
  constraints: ["1 <= nums.length <= 5000", "-10^4 <= nums[i] <= 10^4", "1 <= k <= nums.length"],
  signature: {
    functionName: "maxSlidingWindow",
    params: [
      { name: "nums", type: "int[]" },
      { name: "k", type: "int" },
    ],
    returns: "int[]",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: [[1, 3, -1, -3, 5, 3, 6, 7], 3], output: [3, 3, 5, 5, 6, 7] },
    { args: [[1], 1], output: [1] },
  ],
  hiddenTests: (rng) => [
    [[9, 8, 7, 6, 5], 2],
    [[1, 2, 3, 4, 5], 5],
    [[4, -2], 1],
    [[7, 2, 4], 2],
    [rng.array(100, -10, 10), 7],
    [rng.array(5000, -10000, 10000), 1],
    [rng.array(5000, -10000, 10000), 250],
    [rng.array(5000, -10000, 10000), 5000],
    [Array.from({ length: 5000 }, (_, i) => 5000 - i), 100],
  ],
  reference: {
    javascript: `function maxSlidingWindow(nums, k) {
  const dq = [];
  let head = 0;
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    while (dq.length > head && nums[dq[dq.length - 1]] <= nums[i]) dq.pop();
    dq.push(i);
    if (dq[head] <= i - k) head++;
    if (i >= k - 1) out.push(nums[dq[head]]);
  }
  return out;
}`,
    python: `def maxSlidingWindow(nums, k):
    heap = []
    out = []
    for i, x in enumerate(nums):
        heapq.heappush(heap, (-x, i))
        if i >= k - 1:
            while heap[0][1] <= i - k:
                heapq.heappop(heap)
            out.append(-heap[0][0])
    return out
`,
  },
  complexity: { time: "O(n) with a monotonic deque", space: "O(k)" },
  followUps: ["Why does each index enter and leave the deque at most once?", "Compare the deque with a heap-based solution."],
};

export const TWO_POINTERS_WINDOW = [
  validPalindrome,
  threeSum,
  containerWithMostWater,
  longestSubstringWithoutRepeatingCharacters,
  minimumWindowSubstring,
  slidingWindowMaximum,
];
