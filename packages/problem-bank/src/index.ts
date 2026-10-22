/**
 * SERVER-ONLY. This module contains hidden test cases and reference solutions.
 * Import it from route handlers, server actions and workers, never from a
 * "use client" component. apps/web re-exports it through lib/server/problems.ts,
 * which imports "server-only" so a client import fails the build.
 */
import {
  allStarterCode,
  encodeInput,
  formatArgs,
  formatValue,
  type Difficulty,
  type JudgeTestCase,
  type PublicProblem,
  type Topic,
} from "@repo/core/problems";
import datasetJson from "../generated/dataset.json";
import { PROBLEMS } from "./problems/index";
import type { Dataset, ProblemDefinition } from "./types";

export type { ProblemDefinition, Dataset } from "./types";
export { Rng } from "./rng";

const dataset = datasetJson as Dataset;
export const DATASET_VERSION = dataset.datasetVersion;

const bySlug = new Map<string, ProblemDefinition>(PROBLEMS.map((p) => [p.slug, p]));
const publicCache = new Map<string, PublicProblem>();

export interface ProblemSummary {
  slug: string;
  title: string;
  difficulty: Difficulty;
  topics: Topic[];
}

export function listProblems(filter: { difficulty?: Difficulty; topics?: Topic[] } = {}): ProblemSummary[] {
  return PROBLEMS.filter(
    (p) =>
      (!filter.difficulty || p.difficulty === filter.difficulty) &&
      (!filter.topics || filter.topics.length === 0 || p.topics.some((t) => filter.topics!.includes(t))),
  ).map((p) => ({ slug: p.slug, title: p.title, difficulty: p.difficulty, topics: p.topics }));
}

export function getProblemDefinition(slug: string): ProblemDefinition | undefined {
  return bySlug.get(slug);
}

/** Statement, examples and starter code. Contains no hidden data. */
export function getPublicProblem(slug: string): PublicProblem | undefined {
  const cached = publicCache.get(slug);
  if (cached) return cached;
  const p = bySlug.get(slug);
  if (!p) return undefined;
  const view: PublicProblem = {
    slug: p.slug,
    version: p.version,
    title: p.title,
    difficulty: p.difficulty,
    topics: p.topics,
    statement: p.statement,
    inputDescription: p.inputDescription,
    outputDescription: p.outputDescription,
    constraints: p.constraints,
    examples: p.examples.map((e) => ({
      input: formatArgs(p.signature.params, e.args),
      output: formatValue(e.output),
      stdin: encodeInput(p.signature, e.args),
      explanation: e.explanation,
    })),
    signature: p.signature,
    starterCode: allStarterCode(p.signature),
    timeLimitMs: p.timeLimitMs ?? 2000,
    source: "BANK",
  };
  publicCache.set(slug, view);
  return view;
}

/**
 * Test cases for the judge. RUN uses only the visible examples; SUBMIT uses
 * every test. Hidden cases must only ever be sent to the code executor.
 */
export function getJudgeTests(slug: string, kind: "RUN" | "SUBMIT"): JudgeTestCase[] {
  const entry = dataset.problems[slug];
  if (!entry) throw new Error(`No dataset entry for problem ${slug}`);
  const def = bySlug.get(slug);
  if (def && def.version !== entry.version) {
    throw new Error(`Dataset for ${slug} is version ${entry.version} but the definition is version ${def.version}; rebuild the dataset.`);
  }
  return entry.tests.filter((t) => kind === "SUBMIT" || t.visible).map((t) => ({ ...t }));
}

export function countHiddenTests(slug: string): number {
  return dataset.problems[slug]?.tests.filter((t) => !t.visible).length ?? 0;
}

/**
 * Picks a problem matching the requested difficulty and topics, avoiding
 * already-used slugs. Falls back to any difficulty, then any topic, so an
 * interview can always start.
 */
export function selectProblem(options: {
  difficulty: Difficulty;
  topics?: Topic[];
  exclude?: string[];
  random?: () => number;
}): { slug: string; matched: "exact" | "difficulty-only" | "topic-only" | "any" } {
  const random = options.random ?? Math.random;
  const exclude = new Set(options.exclude ?? []);
  const available = PROBLEMS.filter((p) => !exclude.has(p.slug));
  const topics = options.topics ?? [];
  const topicMatch = (p: ProblemDefinition) => topics.length === 0 || p.topics.some((t) => topics.includes(t));
  const tiers: [ProblemDefinition[], "exact" | "difficulty-only" | "topic-only" | "any"][] = [
    [available.filter((p) => p.difficulty === options.difficulty && topicMatch(p)), "exact"],
    [available.filter((p) => topicMatch(p)), "topic-only"],
    [available.filter((p) => p.difficulty === options.difficulty), "difficulty-only"],
    [available, "any"],
  ];
  for (const [pool, matched] of tiers) {
    if (pool.length > 0) return { slug: pool[Math.floor(random() * pool.length)]!.slug, matched };
  }
  throw new Error("The problem bank is empty");
}

export const ALL_PROBLEM_SLUGS = PROBLEMS.map((p) => p.slug);

// ---------------------------------------------------------------------------
// Technical-knowledge and behavioral question banks
// ---------------------------------------------------------------------------

export { TECHNICAL_QUESTIONS, type TechnicalQuestion, type KeyPoint } from "./questions/technical";
export { BEHAVIORAL_QUESTIONS, BEHAVIORAL_COMPETENCIES, type BehavioralQuestion } from "./questions/behavioral";

import { BEHAVIORAL_QUESTIONS as BEHAVIORAL, type BehavioralQuestion } from "./questions/behavioral";
import { TECHNICAL_QUESTIONS as TECHNICAL, type TechnicalQuestion } from "./questions/technical";

function pickTiered<T extends { id: string; difficulty: Difficulty }>(
  items: T[],
  options: { difficulty: Difficulty; matches: (item: T) => boolean; exclude?: string[]; random?: () => number },
): T {
  const random = options.random ?? Math.random;
  const exclude = new Set(options.exclude ?? []);
  const available = items.filter((q) => !exclude.has(q.id));
  const tiers = [
    available.filter((q) => q.difficulty === options.difficulty && options.matches(q)),
    available.filter((q) => options.matches(q)),
    available.filter((q) => q.difficulty === options.difficulty),
    available,
    items,
  ];
  const pool = tiers.find((t) => t.length > 0)!;
  return pool[Math.floor(random() * pool.length)]!;
}

export function selectTechnicalQuestion(options: { difficulty: Difficulty; topics?: string[]; exclude?: string[]; random?: () => number }): TechnicalQuestion {
  const topics = options.topics ?? [];
  return pickTiered(TECHNICAL, { ...options, matches: (q) => topics.length === 0 || topics.includes(q.topic) });
}

export function selectBehavioralQuestion(options: { difficulty: Difficulty; exclude?: string[]; random?: () => number }): BehavioralQuestion {
  return pickTiered(BEHAVIORAL, { ...options, matches: () => true });
}

export const getTechnicalQuestion = (id: string): TechnicalQuestion | undefined => TECHNICAL.find((q) => q.id === id);
export const getBehavioralQuestion = (id: string): BehavioralQuestion | undefined => BEHAVIORAL.find((q) => q.id === id);
