import type { Value } from "@repo/core/problems";
import type { Rng } from "../rng";
import type { ProblemDefinition } from "../types";

const sortedDistinct = (rng: Rng, n: number, lo: number, hi: number) => rng.distinct(n, lo, hi).sort((a, b) => a - b);

function searchCase(rng: Rng, n: number, present: boolean): Value[] {
  const nums = sortedDistinct(rng, n, -10000, 10000);
  if (present) return [nums, rng.pick(nums)];
  for (;;) {
    const t = rng.int(-10001, 10001);
    if (!nums.includes(t)) return [nums, t];
  }
}

export const binarySearch: ProblemDefinition = {
  slug: "binary-search",
  version: 1,
  title: "Binary Search",
  difficulty: "EASY",
  topics: ["binary-search"],
  statement:
    "Given an array of distinct integers `nums` sorted in ascending order and an integer `target`, return the index of `target` in `nums`, or `-1` if it is not present.\n\nYour algorithm must run in O(log n) time.",
  inputDescription: "`nums`: a sorted array of distinct integers. `target`: the value to find.",
  outputDescription: "The index of `target`, or `-1`.",
  constraints: ["1 <= nums.length <= 10^4", "-10^4 <= nums[i], target <= 10^4", "All values are distinct and sorted ascending."],
  signature: {
    functionName: "search",
    params: [
      { name: "nums", type: "int[]" },
      { name: "target", type: "int" },
    ],
    returns: "int",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: [[-1, 0, 3, 5, 9, 12], 9], output: 4 },
    { args: [[-1, 0, 3, 5, 9, 12], 2], output: -1 },
  ],
  hiddenTests: (rng) => [
    [[5], 5],
    [[5], -5],
    [[1, 3], 1],
    [[1, 3], 3],
    [[1, 3], 4],
    searchCase(rng, 100, true),
    searchCase(rng, 5000, true),
    searchCase(rng, 5000, false),
    [Array.from({ length: 10000 }, (_, i) => i - 5000), -5000],
    [Array.from({ length: 10000 }, (_, i) => i - 5000), 4999],
  ],
  reference: {
    javascript: `function search(nums, target) {
  let lo = 0;
  let hi = nums.length - 1;
  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] === target) return mid;
    if (nums[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}`,
    python: `def search(nums, target):
    i = bisect.bisect_left(nums, target)
    return i if i < len(nums) and nums[i] == target else -1
`,
  },
  complexity: { time: "O(log n)", space: "O(1)" },
  followUps: ["How do you avoid integer overflow when computing mid?", "How would you find the first occurrence if duplicates were allowed?"],
};

function rotatedCase(rng: Rng, n: number, present: boolean): Value[] {
  const sorted = sortedDistinct(rng, n, -10000, 10000);
  const k = rng.int(0, n - 1);
  const nums = [...sorted.slice(k), ...sorted.slice(0, k)];
  if (present) return [nums, rng.pick(nums)];
  for (;;) {
    const t = rng.int(-10001, 10001);
    if (!nums.includes(t)) return [nums, t];
  }
}

export const searchInRotatedSortedArray: ProblemDefinition = {
  slug: "search-in-rotated-sorted-array",
  version: 1,
  title: "Search in Rotated Sorted Array",
  difficulty: "MEDIUM",
  topics: ["binary-search"],
  statement:
    "An ascending array of distinct integers was rotated at an unknown pivot, e.g. `[0,1,2,4,5,6,7]` may become `[4,5,6,7,0,1,2]`.\n\nGiven the rotated array `nums` and an integer `target`, return the index of `target`, or `-1` if it is not in `nums`. Your algorithm must run in O(log n) time.",
  inputDescription: "`nums`: a rotated sorted array of distinct integers. `target`: the value to find.",
  outputDescription: "The index of `target`, or `-1`.",
  constraints: ["1 <= nums.length <= 5000", "-10^4 <= nums[i], target <= 10^4", "All values are distinct."],
  signature: {
    functionName: "search",
    params: [
      { name: "nums", type: "int[]" },
      { name: "target", type: "int" },
    ],
    returns: "int",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: [[4, 5, 6, 7, 0, 1, 2], 0], output: 4 },
    { args: [[4, 5, 6, 7, 0, 1, 2], 3], output: -1 },
    { args: [[1], 0], output: -1 },
  ],
  hiddenTests: (rng) => [
    [[1], 1],
    [[3, 1], 1],
    [[3, 1], 3],
    [[5, 1, 3], 5],
    [[1, 3, 5], 5],
    rotatedCase(rng, 50, true),
    rotatedCase(rng, 5000, true),
    rotatedCase(rng, 5000, true),
    rotatedCase(rng, 5000, false),
  ],
  reference: {
    javascript: `function search(nums, target) {
  let lo = 0;
  let hi = nums.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (nums[mid] === target) return mid;
    if (nums[lo] <= nums[mid]) {
      if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;
      else lo = mid + 1;
    } else {
      if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;
      else hi = mid - 1;
    }
  }
  return -1;
}`,
    python: `def search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] > nums[hi]:
            lo = mid + 1
        else:
            hi = mid
    pivot = lo
    rotated = nums[pivot:] + nums[:pivot]
    i = bisect.bisect_left(rotated, target)
    if i < len(rotated) and rotated[i] == target:
        return (i + pivot) % len(nums)
    return -1
`,
  },
  complexity: { time: "O(log n)", space: "O(1)" },
  followUps: ["How do you decide which half is sorted?", "What breaks if duplicates are allowed?"],
};

function kokoCase(rng: Rng, n: number, maxPile: number, slack: number): Value[] {
  const piles = rng.array(n, 1, maxPile);
  return [piles, n + rng.int(0, slack)];
}

export const kokoEatingBananas: ProblemDefinition = {
  slug: "koko-eating-bananas",
  version: 1,
  title: "Koko Eating Bananas",
  difficulty: "MEDIUM",
  topics: ["binary-search"],
  statement:
    "There are `n` piles of bananas; pile `i` has `piles[i]` bananas. Koko chooses an eating speed of `k` bananas per hour. Each hour she picks one pile and eats `k` bananas from it; if the pile has fewer than `k` bananas she eats all of them and does nothing else that hour.\n\nReturn the minimum integer `k` that lets her finish all piles within `h` hours.",
  inputDescription: "`piles`: banana counts. `h`: available hours (`h >= piles.length`).",
  outputDescription: "The minimum eating speed.",
  constraints: ["1 <= piles.length <= 5000", "piles.length <= h <= 10^9", "1 <= piles[i] <= 10^9"],
  signature: {
    functionName: "minEatingSpeed",
    params: [
      { name: "piles", type: "int[]" },
      { name: "h", type: "int" },
    ],
    returns: "int",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: [[3, 6, 7, 11], 8], output: 4 },
    { args: [[30, 11, 23, 4, 20], 5], output: 30 },
    { args: [[30, 11, 23, 4, 20], 6], output: 23 },
  ],
  hiddenTests: (rng) => [
    [[1], 1],
    [[1000000000], 2],
    [[1000000000], 1000000000],
    [[312884470], 312884469],
    [[5, 5, 5], 1000000000],
    kokoCase(rng, 10, 100, 10),
    kokoCase(rng, 500, 1000000, 2000),
    kokoCase(rng, 5000, 1000000000, 0),
    kokoCase(rng, 5000, 1000000000, 1000000),
  ],
  reference: {
    javascript: `function minEatingSpeed(piles, h) {
  let lo = 1;
  let hi = Math.max(...piles);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    let hours = 0;
    for (const p of piles) hours += Math.ceil(p / mid);
    if (hours <= h) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}`,
    python: `def minEatingSpeed(piles, h):
    def fits(k):
        return sum((p + k - 1) // k for p in piles) <= h
    return bisect.bisect_left(range(1, max(piles) + 1), True, key=fits) + 1
`,
  },
  complexity: { time: "O(n log max(piles))", space: "O(1)" },
  followUps: ["Why is the answer monotonic in k?", "Where could integer overflow happen in typed languages?"],
};

function medianCase(rng: Rng, m: number, n: number): Value[] {
  const a = rng.array(m, -1000000, 1000000).sort((x, y) => x - y);
  const b = rng.array(n, -1000000, 1000000).sort((x, y) => x - y);
  return [a, b];
}

export const medianOfTwoSortedArrays: ProblemDefinition = {
  slug: "median-of-two-sorted-arrays",
  version: 1,
  title: "Median of Two Sorted Arrays",
  difficulty: "HARD",
  topics: ["binary-search"],
  statement:
    "Given two sorted arrays `nums1` and `nums2` of sizes `m` and `n`, return the median of the combined values.\n\nThe overall run time should be O(log (m + n)). Answers within 10^-5 of the expected value are accepted.",
  inputDescription: "`nums1`, `nums2`: arrays sorted in ascending order (either may be empty, not both).",
  outputDescription: "The median as a floating-point number.",
  constraints: ["0 <= m, n <= 3000", "1 <= m + n", "-10^6 <= nums1[i], nums2[i] <= 10^6"],
  signature: {
    functionName: "findMedianSortedArrays",
    params: [
      { name: "nums1", type: "int[]" },
      { name: "nums2", type: "int[]" },
    ],
    returns: "double",
  },
  comparator: { kind: "float", tolerance: 1e-5 },
  examples: [
    { args: [[1, 3], [2]], output: 2, explanation: "The merged array is [1,2,3]." },
    { args: [[1, 2], [3, 4]], output: 2.5, explanation: "The merged array is [1,2,3,4], so (2 + 3) / 2 = 2.5." },
  ],
  hiddenTests: (rng) => [
    [[], [1]],
    [[2], []],
    [[1, 1], [1, 1]],
    [[1, 2], [-1, 3]],
    [[-1000000], [1000000]],
    medianCase(rng, 10, 0),
    medianCase(rng, 7, 8),
    medianCase(rng, 1, 3000),
    medianCase(rng, 3000, 2999),
  ],
  reference: {
    javascript: `function findMedianSortedArrays(nums1, nums2) {
  if (nums1.length > nums2.length) return findMedianSortedArrays(nums2, nums1);
  const m = nums1.length;
  const n = nums2.length;
  const half = (m + n + 1) >> 1;
  let lo = 0;
  let hi = m;
  while (lo <= hi) {
    const i = (lo + hi) >> 1;
    const j = half - i;
    const aLeft = i === 0 ? -Infinity : nums1[i - 1];
    const aRight = i === m ? Infinity : nums1[i];
    const bLeft = j === 0 ? -Infinity : nums2[j - 1];
    const bRight = j === n ? Infinity : nums2[j];
    if (aLeft <= bRight && bLeft <= aRight) {
      const leftMax = Math.max(aLeft, bLeft);
      if ((m + n) % 2 === 1) return leftMax;
      return (leftMax + Math.min(aRight, bRight)) / 2;
    }
    if (aLeft > bRight) hi = i - 1;
    else lo = i + 1;
  }
  return 0;
}`,
    python: `def findMedianSortedArrays(nums1, nums2):
    merged = sorted(nums1 + nums2)
    n = len(merged)
    if n % 2:
        return float(merged[n // 2])
    return (merged[n // 2 - 1] + merged[n // 2]) / 2
`,
  },
  complexity: { time: "O(log min(m, n))", space: "O(1)" },
  followUps: ["Explain the partition invariant.", "Why binary search over the smaller array?"],
};

export const BINARY_SEARCH = [binarySearch, searchInRotatedSortedArray, kokoEatingBananas, medianOfTwoSortedArrays];
