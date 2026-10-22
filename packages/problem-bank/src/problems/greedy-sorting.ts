import type { Value } from "@repo/core/problems";
import type { Rng } from "../rng";
import type { ProblemDefinition } from "../types";

function intervals(rng: Rng, n: number, maxStart: number, maxLen: number): number[][] {
  return Array.from({ length: n }, () => {
    const s = rng.int(0, maxStart);
    return [s, s + rng.int(1, maxLen)];
  });
}

function jumpCase(rng: Rng, n: number, maxJump: number): Value[] {
  return [rng.array(n, 0, maxJump)];
}

export const jumpGame: ProblemDefinition = {
  slug: "jump-game",
  version: 1,
  title: "Jump Game",
  difficulty: "MEDIUM",
  topics: ["greedy", "dynamic-programming"],
  statement:
    "You start at index 0 of an array `nums`, where `nums[i]` is the maximum jump length from index `i`. Return `true` if you can reach the last index, otherwise `false`.",
  inputDescription: "`nums`: maximum jump lengths.",
  outputDescription: "`true` if the last index is reachable.",
  constraints: ["1 <= nums.length <= 10^4", "0 <= nums[i] <= 10^5"],
  signature: { functionName: "canJump", params: [{ name: "nums", type: "int[]" }], returns: "bool" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[2, 3, 1, 1, 4]], output: true },
    { args: [[3, 2, 1, 0, 4]], output: false, explanation: "Every path stops at index 3, whose jump length is 0." },
  ],
  hiddenTests: (rng) => [
    [[0]],
    [[0, 1]],
    [[1, 0]],
    [[2, 0, 0]],
    jumpCase(rng, 100, 3),
    jumpCase(rng, 10000, 2),
    [[...Array.from({ length: 9999 }, () => 1), 0]],
    [[10000, ...Array.from({ length: 9999 }, () => 0)]],
    [[...Array.from({ length: 5000 }, () => 1), 0, ...Array.from({ length: 4999 }, () => 1)]],
  ],
  reference: {
    javascript: `function canJump(nums) {
  let reach = 0;
  for (let i = 0; i < nums.length; i++) {
    if (i > reach) return false;
    reach = Math.max(reach, i + nums[i]);
  }
  return true;
}`,
    python: `def canJump(nums):
    goal = len(nums) - 1
    for i in range(len(nums) - 2, -1, -1):
        if i + nums[i] >= goal:
            goal = i
    return goal == 0
`,
  },
  complexity: { time: "O(n)", space: "O(1)" },
  followUps: ["Prove that tracking the furthest reachable index is enough.", "How would you compute the minimum number of jumps?"],
};

export const nonOverlappingIntervals: ProblemDefinition = {
  slug: "non-overlapping-intervals",
  version: 1,
  title: "Non-overlapping Intervals",
  difficulty: "MEDIUM",
  topics: ["greedy", "sorting-searching"],
  statement:
    "Given an array of intervals `intervals[i] = [start, end]`, return the minimum number of intervals you need to remove so that the rest do not overlap.\n\nIntervals that only touch at a point, such as `[1, 2]` and `[2, 3]`, do not overlap.",
  inputDescription: "`intervals`: pairs `[start, end]` with start < end.",
  outputDescription: "The minimum number of intervals to remove.",
  constraints: ["1 <= intervals.length <= 5000", "-5 * 10^4 <= start < end <= 5 * 10^4"],
  signature: { functionName: "eraseOverlapIntervals", params: [{ name: "intervals", type: "int[][]" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[[1, 2], [2, 3], [3, 4], [1, 3]]], output: 1 },
    { args: [[[1, 2], [1, 2], [1, 2]]], output: 2 },
    { args: [[[1, 2], [2, 3]]], output: 0 },
  ],
  hiddenTests: (rng) => [
    [[[0, 1]]],
    [[[1, 100], [11, 22], [1, 11], [2, 12]]],
    [[[-5, 5], [-3, -1], [1, 3]]],
    [intervals(rng, 20, 50, 10)],
    [intervals(rng, 1000, 50000, 100)],
    [intervals(rng, 4000, 50000, 2000)],
    [Array.from({ length: 5000 }, (_, i) => [i, i + 1])],
  ],
  reference: {
    javascript: `function eraseOverlapIntervals(intervals) {
  const a = [...intervals].sort((x, y) => x[1] - y[1]);
  let kept = 0;
  let end = -Infinity;
  for (const [s, e] of a) {
    if (s >= end) {
      kept++;
      end = e;
    }
  }
  return a.length - kept;
}`,
    python: `def eraseOverlapIntervals(intervals):
    removed = 0
    prev_end = None
    for start, end in sorted(intervals):
        if prev_end is None or start >= prev_end:
            prev_end = end
        else:
            removed += 1
            prev_end = min(prev_end, end)
    return removed
`,
  },
  complexity: { time: "O(n log n)", space: "O(1) besides sorting" },
  followUps: ["Why does keeping the interval that ends first work?", "How does this relate to activity selection?"],
};

export const mergeIntervals: ProblemDefinition = {
  slug: "merge-intervals",
  version: 1,
  title: "Merge Intervals",
  difficulty: "MEDIUM",
  topics: ["sorting-searching"],
  statement:
    "Given an array of intervals `intervals[i] = [start, end]`, merge all overlapping intervals and return the resulting non-overlapping intervals. Intervals that touch, such as `[1, 4]` and `[4, 5]`, are merged.\n\nThe merged intervals may be returned in any order.",
  inputDescription: "`intervals`: pairs `[start, end]` with start <= end.",
  outputDescription: "The merged intervals, in any order.",
  constraints: ["1 <= intervals.length <= 5000", "0 <= start <= end <= 10^4"],
  signature: { functionName: "merge", params: [{ name: "intervals", type: "int[][]" }], returns: "int[][]" },
  comparator: { kind: "unordered" },
  examples: [
    { args: [[[1, 3], [2, 6], [8, 10], [15, 18]]], output: [[1, 6], [8, 10], [15, 18]] },
    { args: [[[1, 4], [4, 5]]], output: [[1, 5]] },
  ],
  hiddenTests: (rng) => [
    [[[1, 1]]],
    [[[1, 4], [0, 4]]],
    [[[1, 4], [2, 3]]],
    [[[5, 6], [1, 2], [3, 4]]],
    [intervals(rng, 30, 100, 10)],
    [intervals(rng, 2000, 9000, 50)],
    [intervals(rng, 5000, 9900, 5)],
  ],
  reference: {
    javascript: `function merge(intervals) {
  const a = [...intervals].sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [s, e] of a) {
    if (out.length && s <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], e);
    else out.push([s, e]);
  }
  return out;
}`,
    python: `def merge(intervals):
    events = []
    for s, e in intervals:
        events.append((s, 0))
        events.append((e, 1))
    events.sort()
    out = []
    depth = 0
    for x, kind in events:
        if kind == 0:
            if depth == 0:
                if out and out[-1][1] == x:
                    start = out.pop()[0]
                else:
                    start = x
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                out.append([start, x])
    return out
`,
  },
  complexity: { time: "O(n log n)", space: "O(n) for the output" },
  followUps: ["Why sort by start rather than end?", "How would you insert a new interval into an already merged list?"],
};

export const meetingRoomsII: ProblemDefinition = {
  slug: "meeting-rooms-ii",
  version: 1,
  title: "Meeting Rooms II",
  difficulty: "MEDIUM",
  topics: ["heap", "sorting-searching", "greedy"],
  statement:
    "Given an array of meeting time intervals `intervals[i] = [start, end]` (a meeting occupies the half-open range `[start, end)`), return the minimum number of conference rooms required.",
  inputDescription: "`intervals`: meetings as `[start, end]` with start < end.",
  outputDescription: "The minimum number of rooms.",
  constraints: ["1 <= intervals.length <= 5000", "0 <= start < end <= 10^6"],
  signature: { functionName: "minMeetingRooms", params: [{ name: "intervals", type: "int[][]" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[[0, 30], [5, 10], [15, 20]]], output: 2 },
    { args: [[[7, 10], [2, 4]]], output: 1 },
  ],
  hiddenTests: (rng) => [
    [[[1, 5]]],
    [[[1, 5], [5, 10]]],
    [[[1, 10], [2, 9], [3, 8]]],
    [intervals(rng, 30, 100, 20)],
    [intervals(rng, 2000, 1000000, 5000)],
    [intervals(rng, 5000, 10000, 3000)],
    [Array.from({ length: 5000 }, () => [0, 1000000])],
  ],
  reference: {
    javascript: `function minMeetingRooms(intervals) {
  const starts = intervals.map((x) => x[0]).sort((a, b) => a - b);
  const ends = intervals.map((x) => x[1]).sort((a, b) => a - b);
  let rooms = 0;
  let best = 0;
  let j = 0;
  for (let i = 0; i < starts.length; i++) {
    while (j < ends.length && ends[j] <= starts[i]) {
      j++;
      rooms--;
    }
    rooms++;
    best = Math.max(best, rooms);
  }
  return best;
}`,
    python: `def minMeetingRooms(intervals):
    heap = []
    for start, end in sorted(intervals):
        if heap and heap[0] <= start:
            heapq.heapreplace(heap, end)
        else:
            heapq.heappush(heap, end)
    return len(heap)
`,
  },
  complexity: { time: "O(n log n)", space: "O(n)" },
  followUps: ["Compare the heap solution with the two-pointer sweep.", "How do you treat a meeting that ends exactly when another starts?"],
};

export const GREEDY_SORTING = [jumpGame, nonOverlappingIntervals, mergeIntervals, meetingRoomsII];
