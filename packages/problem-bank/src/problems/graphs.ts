import type { Value } from "@repo/core/problems";
import type { Rng } from "../rng";
import type { ProblemDefinition } from "../types";

function gridCase(rng: Rng, rows: number, cols: number, landProbability: number): Value[] {
  return [Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rng.bool(landProbability) ? "1" : "0")).join(""))];
}

export const numberOfIslands: ProblemDefinition = {
  slug: "number-of-islands",
  version: 1,
  title: "Number of Islands",
  difficulty: "MEDIUM",
  topics: ["graphs"],
  statement:
    "Given an `m x n` grid of `'1'` (land) and `'0'` (water), return the number of islands.\n\nAn island is a group of land cells connected horizontally or vertically, surrounded by water. Each row of the grid is given as a string.",
  inputDescription: "`grid`: m rows, each a string of `0` and `1` characters of length n.",
  outputDescription: "The number of islands.",
  constraints: ["1 <= m, n <= 100", "grid[i][j] is '0' or '1'."],
  signature: { functionName: "numIslands", params: [{ name: "grid", type: "string[]" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: [["11110", "11010", "11000", "00000"]], output: 1 },
    { args: [["11000", "11000", "00100", "00011"]], output: 3 },
  ],
  hiddenTests: (rng) => [
    [["0"]],
    [["1"]],
    [["101", "010", "101"]],
    [["111", "101", "111"]],
    gridCase(rng, 10, 10, 0.4),
    gridCase(rng, 60, 80, 0.3),
    gridCase(rng, 100, 100, 0.5),
    gridCase(rng, 100, 100, 0.95),
    [Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? "10".repeat(50) : "01".repeat(50)))],
  ],
  reference: {
    javascript: `function numIslands(grid) {
  const g = grid.map((row) => row.split(""));
  const m = g.length;
  const n = m ? g[0].length : 0;
  let count = 0;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (g[i][j] !== "1") continue;
      count++;
      const queue = [[i, j]];
      g[i][j] = "0";
      for (let q = 0; q < queue.length; q++) {
        const [r, c] = queue[q];
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < m && nc >= 0 && nc < n && g[nr][nc] === "1") {
            g[nr][nc] = "0";
            queue.push([nr, nc]);
          }
        }
      }
    }
  }
  return count;
}`,
    python: `def numIslands(grid):
    m, n = len(grid), len(grid[0])
    parent = list(range(m * n))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    land = 0
    for i in range(m):
        for j in range(n):
            if grid[i][j] != "1":
                continue
            land += 1
            for di, dj in ((1, 0), (0, 1)):
                a, b = i + di, j + dj
                if a < m and b < n and grid[a][b] == "1":
                    ra, rb = find(i * n + j), find(a * n + b)
                    if ra != rb:
                        parent[ra] = rb
                        land -= 1
    return land
`,
  },
  complexity: { time: "O(m * n)", space: "O(m * n) worst case for the queue" },
  followUps: ["What is the worst-case recursion depth of a DFS here?", "How would you solve it with union-find?"],
};

function courseCase(rng: Rng, n: number, edges: number, cyclic: boolean): Value[] {
  const order = rng.shuffle(Array.from({ length: n }, (_, i) => i));
  const pos = new Map(order.map((c, i) => [c, i]));
  const pairs = new Set<string>();
  const out: number[][] = [];
  while (out.length < edges) {
    const a = rng.int(0, n - 1);
    const b = rng.int(0, n - 1);
    if (a === b) continue;
    // [x, y] means y must be taken before x; acyclic when y comes earlier in `order`.
    const [x, y] = pos.get(a)! > pos.get(b)! ? [a, b] : [b, a];
    const key = `${x},${y}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    out.push([x, y]);
  }
  if (cyclic) {
    const [x, y] = out[rng.int(0, out.length - 1)]!;
    out.push([y!, x!]);
  }
  return [n, rng.shuffle(out)];
}

export const courseSchedule: ProblemDefinition = {
  slug: "course-schedule",
  version: 1,
  title: "Course Schedule",
  difficulty: "MEDIUM",
  topics: ["graphs"],
  statement:
    "There are `numCourses` courses labelled `0` to `numCourses - 1`. Each pair `[a, b]` in `prerequisites` means you must take course `b` before course `a`.\n\nReturn `true` if it is possible to finish every course, otherwise `false`.",
  inputDescription: "`numCourses`: the number of courses. `prerequisites`: pairs `[a, b]`.",
  outputDescription: "`true` if all courses can be finished.",
  constraints: ["1 <= numCourses <= 2000", "0 <= prerequisites.length <= 5000", "All pairs are distinct."],
  signature: {
    functionName: "canFinish",
    params: [
      { name: "numCourses", type: "int" },
      { name: "prerequisites", type: "int[][]" },
    ],
    returns: "bool",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: [2, [[1, 0]]], output: true },
    { args: [2, [[1, 0], [0, 1]]], output: false, explanation: "Each course requires the other." },
  ],
  hiddenTests: (rng) => [
    [1, []],
    [3, [[0, 1], [0, 2], [1, 2]]],
    [3, [[0, 1], [1, 2], [2, 0]]],
    [4, [[1, 0], [2, 1], [3, 2], [1, 3]]],
    courseCase(rng, 10, 15, false),
    courseCase(rng, 10, 15, true),
    courseCase(rng, 2000, 5000, false),
    courseCase(rng, 2000, 4999, true),
    [2000, Array.from({ length: 1999 }, (_, i) => [i + 1, i])],
  ],
  reference: {
    javascript: `function canFinish(numCourses, prerequisites) {
  const indegree = new Array(numCourses).fill(0);
  const adj = Array.from({ length: numCourses }, () => []);
  for (const [a, b] of prerequisites) {
    adj[b].push(a);
    indegree[a]++;
  }
  const queue = [];
  for (let i = 0; i < numCourses; i++) if (indegree[i] === 0) queue.push(i);
  let taken = 0;
  for (let q = 0; q < queue.length; q++) {
    taken++;
    for (const next of adj[queue[q]]) if (--indegree[next] === 0) queue.push(next);
  }
  return taken === numCourses;
}`,
    python: `def canFinish(numCourses, prerequisites):
    adj = defaultdict(list)
    for a, b in prerequisites:
        adj[a].append(b)
    state = [0] * numCourses
    def has_cycle(u):
        state[u] = 1
        for v in adj[u]:
            if state[v] == 1 or (state[v] == 0 and has_cycle(v)):
                return True
        state[u] = 2
        return False
    return not any(state[c] == 0 and has_cycle(c) for c in range(numCourses))
`,
  },
  complexity: { time: "O(V + E)", space: "O(V + E)" },
  followUps: ["Compare Kahn's algorithm with DFS colouring.", "How would you return a valid course order?"],
};

function orangesCase(rng: Rng, rows: number, cols: number, pEmpty: number, pRotten: number): Value[] {
  return [
    Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => {
        const x = rng.next();
        return x < pEmpty ? 0 : x < pEmpty + pRotten ? 2 : 1;
      }),
    ),
  ];
}

export const rottingOranges: ProblemDefinition = {
  slug: "rotting-oranges",
  version: 1,
  title: "Rotting Oranges",
  difficulty: "MEDIUM",
  topics: ["graphs", "stack-queue"],
  statement:
    "In an `m x n` grid each cell is `0` (empty), `1` (fresh orange) or `2` (rotten orange). Every minute, each fresh orange that is 4-directionally adjacent to a rotten orange becomes rotten.\n\nReturn the minimum number of minutes until no fresh orange remains, or `-1` if that is impossible.",
  inputDescription: "`grid`: the m x n grid.",
  outputDescription: "The number of minutes, or -1.",
  constraints: ["1 <= m, n <= 40", "grid[i][j] is 0, 1 or 2."],
  signature: { functionName: "orangesRotting", params: [{ name: "grid", type: "int[][]" }], returns: "int" },
  comparator: { kind: "exact" },
  examples: [
    { args: [[[2, 1, 1], [1, 1, 0], [0, 1, 1]]], output: 4 },
    { args: [[[2, 1, 1], [0, 1, 1], [1, 0, 1]]], output: -1, explanation: "The orange in the bottom-left corner is never reached." },
    { args: [[[0, 2]]], output: 0 },
  ],
  hiddenTests: (rng) => [
    [[[0]]],
    [[[1]]],
    [[[2]]],
    [[[2, 1, 1, 1, 1, 1, 1, 1]]],
    orangesCase(rng, 5, 5, 0.2, 0.1),
    orangesCase(rng, 40, 40, 0.1, 0.01),
    orangesCase(rng, 40, 40, 0.3, 0.05),
    [Array.from({ length: 40 }, (_, i) => Array.from({ length: 40 }, (_, j) => (i === 0 && j === 0 ? 2 : 1)))],
  ],
  reference: {
    javascript: `function orangesRotting(grid) {
  const g = grid.map((r) => [...r]);
  const m = g.length;
  const n = g[0].length;
  let queue = [];
  let fresh = 0;
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++) {
      if (g[i][j] === 2) queue.push([i, j]);
      else if (g[i][j] === 1) fresh++;
    }
  let minutes = 0;
  while (queue.length && fresh > 0) {
    const next = [];
    for (const [r, c] of queue) {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = r + dr;
        const b = c + dc;
        if (a >= 0 && a < m && b >= 0 && b < n && g[a][b] === 1) {
          g[a][b] = 2;
          fresh--;
          next.push([a, b]);
        }
      }
    }
    queue = next;
    minutes++;
  }
  return fresh === 0 ? minutes : -1;
}`,
    python: `def orangesRotting(grid):
    g = [row[:] for row in grid]
    m, n = len(g), len(g[0])
    minutes = 0
    while True:
        to_rot = [(i, j) for i in range(m) for j in range(n) if g[i][j] == 1 and any(
            0 <= i + di < m and 0 <= j + dj < n and g[i + di][j + dj] == 2
            for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        if not to_rot:
            break
        for i, j in to_rot:
            g[i][j] = 2
        minutes += 1
    return -1 if any(1 in row for row in g) else minutes
`,
  },
  complexity: { time: "O(m * n)", space: "O(m * n)" },
  followUps: ["Why does a multi-source BFS give the minimum time?", "How do you detect unreachable oranges?"],
};

function delayCase(rng: Rng, n: number, edges: number): Value[] {
  const seen = new Set<string>();
  const times: number[][] = [];
  while (times.length < edges) {
    const u = rng.int(1, n);
    const v = rng.int(1, n);
    if (u === v || seen.has(`${u},${v}`)) continue;
    seen.add(`${u},${v}`);
    times.push([u, v, rng.int(0, 100)]);
  }
  return [times, n, rng.int(1, n)];
}

export const networkDelayTime: ProblemDefinition = {
  slug: "network-delay-time",
  version: 1,
  title: "Network Delay Time",
  difficulty: "MEDIUM",
  topics: ["graphs", "heap"],
  statement:
    "You are given a network of `n` nodes labelled `1` to `n` and a list of directed travel times `times[i] = [u, v, w]`: a signal takes `w` time to travel from `u` to `v`.\n\nA signal is sent from node `k`. Return the minimum time for all `n` nodes to receive it, or `-1` if some node can never receive it.",
  inputDescription: "`times`: directed weighted edges `[u, v, w]`. `n`: the number of nodes. `k`: the source node.",
  outputDescription: "The time until every node has received the signal, or -1.",
  constraints: ["1 <= k <= n <= 100", "1 <= times.length <= 3000", "0 <= w <= 100", "All (u, v) pairs are distinct and u != v."],
  signature: {
    functionName: "networkDelayTime",
    params: [
      { name: "times", type: "int[][]" },
      { name: "n", type: "int" },
      { name: "k", type: "int" },
    ],
    returns: "int",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: [[[2, 1, 1], [2, 3, 1], [3, 4, 1]], 4, 2], output: 2 },
    { args: [[[1, 2, 1]], 2, 1], output: 1 },
    { args: [[[1, 2, 1]], 2, 2], output: -1 },
  ],
  hiddenTests: (rng) => [
    [[[1, 2, 0]], 2, 1],
    [[[1, 2, 5], [1, 3, 1], [3, 2, 1]], 3, 1],
    [[[1, 2, 1], [2, 3, 2], [1, 3, 4]], 3, 1],
    [[[1, 2, 1]], 3, 1],
    delayCase(rng, 10, 20),
    delayCase(rng, 50, 150),
    delayCase(rng, 100, 3000),
    delayCase(rng, 100, 120),
  ],
  reference: {
    javascript: `function networkDelayTime(times, n, k) {
  const adj = Array.from({ length: n + 1 }, () => []);
  for (const [u, v, w] of times) adj[u].push([v, w]);
  const dist = new Array(n + 1).fill(Infinity);
  const done = new Array(n + 1).fill(false);
  dist[k] = 0;
  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    for (let i = 1; i <= n; i++) if (!done[i] && (u === -1 || dist[i] < dist[u])) u = i;
    if (dist[u] === Infinity) break;
    done[u] = true;
    for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) dist[v] = dist[u] + w;
  }
  let best = 0;
  for (let i = 1; i <= n; i++) best = Math.max(best, dist[i]);
  return best === Infinity ? -1 : best;
}`,
    python: `def networkDelayTime(times, n, k):
    inf = float("inf")
    dist = [inf] * (n + 1)
    dist[k] = 0
    for _ in range(n - 1):
        changed = False
        for u, v, w in times:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                changed = True
        if not changed:
            break
    best = max(dist[1:])
    return -1 if best == inf else best
`,
  },
  complexity: { time: "O(E log V) with a binary heap", space: "O(V + E)" },
  followUps: ["Why does Dijkstra require non-negative weights?", "Compare Dijkstra with Bellman-Ford here."],
};

function ladderCase(rng: Rng, len: number, alphabet: string, size: number): Value[] {
  const words = new Set<string>();
  while (words.size < size) words.add(rng.string(len, alphabet));
  const list = [...words];
  const end = rng.pick(list);
  let begin = rng.string(len, alphabet);
  while (begin === end) begin = rng.string(len, alphabet);
  return [begin, end, rng.shuffle(list)];
}

export const wordLadder: ProblemDefinition = {
  slug: "word-ladder",
  version: 1,
  title: "Word Ladder",
  difficulty: "HARD",
  topics: ["graphs"],
  statement:
    "A transformation sequence from `beginWord` to `endWord` is a sequence `beginWord -> s1 -> ... -> sk` where each adjacent pair differs by exactly one letter, every `si` is in `wordList`, and `sk == endWord`. `beginWord` does not need to be in `wordList`.\n\nReturn the number of words in the shortest transformation sequence, or `0` if none exists.",
  inputDescription: "`beginWord`, `endWord`: words of equal length. `wordList`: the dictionary.",
  outputDescription: "The length of the shortest sequence (counting both ends), or 0.",
  constraints: ["1 <= beginWord.length <= 6", "beginWord != endWord", "1 <= wordList.length <= 2000", "All words have the same length and use lowercase letters.", "Words in wordList are distinct."],
  signature: {
    functionName: "ladderLength",
    params: [
      { name: "beginWord", type: "string" },
      { name: "endWord", type: "string" },
      { name: "wordList", type: "string[]" },
    ],
    returns: "int",
  },
  comparator: { kind: "exact" },
  examples: [
    { args: ["hit", "cog", ["hot", "dot", "dog", "lot", "log", "cog"]], output: 5, explanation: "hit -> hot -> dot -> dog -> cog" },
    { args: ["hit", "cog", ["hot", "dot", "dog", "lot", "log"]], output: 0, explanation: '"cog" is not in the word list.' },
  ],
  hiddenTests: (rng) => [
    ["a", "c", ["a", "b", "c"]],
    ["hot", "dog", ["hot", "dog"]],
    ["hot", "dog", ["hot", "dot", "dog"]],
    ["abc", "abd", ["abd", "xyz"]],
    ladderCase(rng, 3, "abcde", 60),
    ladderCase(rng, 4, "abcdef", 400),
    ladderCase(rng, 4, "abcd", 200),
    ladderCase(rng, 5, "abcdefg", 2000),
  ],
  reference: {
    javascript: `function ladderLength(beginWord, endWord, wordList) {
  const words = new Set(wordList);
  if (!words.has(endWord)) return 0;
  const buckets = new Map();
  const patterns = (w) => Array.from(w, (_, i) => w.slice(0, i) + "*" + w.slice(i + 1));
  for (const w of words) for (const p of patterns(w)) {
    if (!buckets.has(p)) buckets.set(p, []);
    buckets.get(p).push(w);
  }
  const seen = new Set([beginWord]);
  let level = [beginWord];
  let steps = 1;
  while (level.length) {
    const next = [];
    for (const w of level) {
      if (w === endWord) return steps;
      for (const p of patterns(w)) {
        for (const nb of buckets.get(p) || []) {
          if (!seen.has(nb)) {
            seen.add(nb);
            next.push(nb);
          }
        }
      }
    }
    level = next;
    steps++;
  }
  return 0;
}`,
    python: `def ladderLength(beginWord, endWord, wordList):
    words = set(wordList)
    if endWord not in words:
        return 0
    if beginWord == endWord:
        return 1
    front, back = {beginWord}, {endWord}
    words.discard(beginWord)
    words.discard(endWord)
    steps = 1
    letters = string.ascii_lowercase
    while front and back:
        if len(front) > len(back):
            front, back = back, front
        nxt = set()
        for w in front:
            for i in range(len(w)):
                for c in letters:
                    cand = w[:i] + c + w[i + 1:]
                    if cand in back:
                        return steps + 1
                    if cand in words:
                        words.discard(cand)
                        nxt.add(cand)
        front = nxt
        steps += 1
    return 0
`,
  },
  complexity: { time: "O(N * L^2) with wildcard buckets", space: "O(N * L)" },
  followUps: ["Why is BFS the right traversal for shortest sequences?", "How does bidirectional BFS help?"],
};

export const GRAPHS = [numberOfIslands, courseSchedule, rottingOranges, networkDelayTime, wordLadder];
