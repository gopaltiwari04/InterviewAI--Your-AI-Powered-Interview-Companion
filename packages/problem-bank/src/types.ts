import type { Comparator, Difficulty, Example, Signature, Topic, Value } from "@repo/core/problems";
import type { Rng } from "./rng";

/**
 * A curated problem as authored in src/problems. Expected outputs for hidden
 * tests are not written by hand: scripts/build-dataset.ts runs two
 * independently written reference solutions (JavaScript and Python) through
 * the real judge harness and only accepts the problem when they agree with
 * each other and with every hand-written example.
 */
export interface ProblemDefinition {
  slug: string;
  /** Bump when the statement, signature or tests change in an incompatible way. */
  version: number;
  title: string;
  difficulty: Difficulty;
  topics: Topic[];
  statement: string;
  inputDescription: string;
  outputDescription: string;
  constraints: string[];
  signature: Signature;
  comparator: Comparator;
  examples: Example[];
  /** Arguments of the hidden tests: hand-picked edge cases plus seeded random cases. */
  hiddenTests: (rng: Rng) => Value[][];
  reference: {
    javascript: string;
    python: string;
  };
  /** Base per-test limit for C/C++; other languages get a multiplier. */
  timeLimitMs?: number;
  complexity: { time: string; space: string };
  /** Seeds for the AI interviewer's follow-up questions. */
  followUps: string[];
}

export interface DatasetTest {
  id: string;
  input: string;
  expected: string;
  visible: boolean;
}

export interface DatasetProblem {
  slug: string;
  version: number;
  tests: DatasetTest[];
}

export interface Dataset {
  datasetVersion: number;
  generatedBy: string;
  problems: Record<string, DatasetProblem>;
}
