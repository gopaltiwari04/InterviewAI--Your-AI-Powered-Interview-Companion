/** Small seeded PRNG (mulberry32) so generated tests are reproducible. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  static fromString(text: string): Rng {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return new Rng(h);
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [lo, hi]. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  array(n: number, lo: number, hi: number): number[] {
    return Array.from({ length: n }, () => this.int(lo, hi));
  }

  /** n distinct integers from [lo, hi]. */
  distinct(n: number, lo: number, hi: number): number[] {
    const seen = new Set<number>();
    while (seen.size < n) seen.add(this.int(lo, hi));
    return this.shuffle([...seen]);
  }

  shuffle<T>(items: T[]): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j] as T, a[i] as T];
    }
    return a;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)] as T;
  }

  string(n: number, alphabet: string): string {
    let s = "";
    for (let i = 0; i < n; i++) s += alphabet[this.int(0, alphabet.length - 1)];
    return s;
  }
}

/** Random binary tree in level-order form with values from the generator. */
export function randomTree(rng: Rng, size: number, value: () => number): (number | null)[] {
  if (size === 0) return [];
  type Node = { val: number; left: Node | null; right: Node | null };
  const root: Node = { val: value(), left: null, right: null };
  const nodes: Node[] = [root];
  while (nodes.length < size) {
    const parent = nodes[rng.int(0, nodes.length - 1)] as Node;
    const side = rng.bool() ? "left" : "right";
    if (parent[side] === null) {
      const child: Node = { val: value(), left: null, right: null };
      parent[side] = child;
      nodes.push(child);
    }
  }
  return toLevelOrder(root);
}

type TreeShape = { val: number; left: TreeShape | null; right: TreeShape | null };

export function toLevelOrder(root: TreeShape | null): (number | null)[] {
  const out: (number | null)[] = [];
  const queue: (TreeShape | null)[] = [root];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (!node) {
      out.push(null);
      continue;
    }
    out.push(node.val);
    queue.push(node.left, node.right);
  }
  while (out.length > 0 && out[out.length - 1] === null) out.pop();
  return out;
}

/** Balanced BST containing the sorted values, in level-order form. */
export function bstFromSorted(values: number[]): (number | null)[] {
  const build = (lo: number, hi: number): TreeShape | null => {
    if (lo > hi) return null;
    const mid = (lo + hi) >> 1;
    return { val: values[mid] as number, left: build(lo, mid - 1), right: build(mid + 1, hi) };
  };
  return toLevelOrder(build(0, values.length - 1));
}

/** Random-shaped BST built by inserting distinct values in random order. */
export function randomBst(rng: Rng, values: number[]): (number | null)[] {
  let root: TreeShape | null = null;
  for (const v of rng.shuffle(values)) {
    const node: TreeShape = { val: v, left: null, right: null };
    if (!root) {
      root = node;
      continue;
    }
    let cur: TreeShape = root;
    for (;;) {
      if (v < cur.val) {
        if (!cur.left) {
          cur.left = node;
          break;
        }
        cur = cur.left;
      } else {
        if (!cur.right) {
          cur.right = node;
          break;
        }
        cur = cur.right;
      }
    }
  }
  return toLevelOrder(root);
}
