import type { ProblemDefinition } from "../types";
import { ARRAYS_HASHING } from "./arrays-hashing";
import { BACKTRACKING_DP } from "./backtracking-dp";
import { BINARY_SEARCH } from "./binary-search";
import { GRAPHS } from "./graphs";
import { GREEDY_SORTING } from "./greedy-sorting";
import { LISTS_STACKS } from "./lists-stacks";
import { TREES_HEAPS } from "./trees-heaps";
import { TWO_POINTERS_WINDOW } from "./two-pointers-window";

/** Every curated problem. Order is the default display order. */
export const PROBLEMS: ProblemDefinition[] = [
  ...ARRAYS_HASHING,
  ...TWO_POINTERS_WINDOW,
  ...BINARY_SEARCH,
  ...LISTS_STACKS,
  ...TREES_HEAPS,
  ...GRAPHS,
  ...BACKTRACKING_DP,
  ...GREEDY_SORTING,
];
