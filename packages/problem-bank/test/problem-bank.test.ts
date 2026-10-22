import { DIFFICULTIES, LANGUAGES, TOPICS, encodeOutput, outputsMatch } from "@repo/core/problems";
import { describe, expect, it } from "vitest";
import {
  ALL_PROBLEM_SLUGS,
  countHiddenTests,
  getJudgeTests,
  getProblemDefinition,
  getPublicProblem,
  listProblems,
  selectProblem,
} from "../src/index";

describe("problem bank", () => {
  it("has at least 30 problems covering every topic and difficulty", () => {
    expect(ALL_PROBLEM_SLUGS.length).toBeGreaterThanOrEqual(30);
    const all = listProblems();
    for (const topic of TOPICS) expect(all.some((p) => p.topics.includes(topic)), topic).toBe(true);
    for (const d of DIFFICULTIES) expect(all.some((p) => p.difficulty === d), d).toBe(true);
  });

  it.each(ALL_PROBLEM_SLUGS)("%s has a complete public definition and hidden tests", (slug) => {
    const p = getPublicProblem(slug)!;
    expect(p.title.length).toBeGreaterThan(2);
    expect(p.statement.length).toBeGreaterThan(40);
    expect(p.constraints.length).toBeGreaterThan(0);
    expect(p.examples.length).toBeGreaterThan(0);
    for (const lang of LANGUAGES) expect(p.starterCode[lang]).toContain(p.signature.functionName);
    expect(countHiddenTests(slug)).toBeGreaterThanOrEqual(6);

    const runTests = getJudgeTests(slug, "RUN");
    expect(runTests.every((t) => t.visible)).toBe(true);
    expect(runTests.length).toBe(p.examples.length);
  });

  it.each(ALL_PROBLEM_SLUGS)("%s examples in the dataset match the statement", (slug) => {
    const def = getProblemDefinition(slug)!;
    const visible = getJudgeTests(slug, "RUN");
    def.examples.forEach((ex, i) => {
      expect(outputsMatch(visible[i]!.expected, encodeOutput(def.signature.returns, ex.output), def.comparator, def.signature.returns)).toBe(true);
    });
  });

  it("never exposes hidden tests or reference solutions in the public view", () => {
    for (const slug of ALL_PROBLEM_SLUGS) {
      const json = JSON.stringify(getPublicProblem(slug));
      const def = getProblemDefinition(slug)!;
      expect(json).not.toContain(def.reference.javascript.slice(0, 60));
      expect(json).not.toContain(def.reference.python.slice(0, 60));
      expect(json).not.toMatch(/"(expected|hiddenTests|reference)"/);
      const hidden = getJudgeTests(slug, "SUBMIT").filter((t) => !t.visible);
      // A long hidden input must not appear verbatim in the public payload.
      const longest = hidden.map((t) => t.input).sort((a, b) => b.length - a.length)[0]!;
      if (longest.length > 40) expect(json).not.toContain(longest);
    }
  });

  it("selects problems by difficulty and topic and falls back gracefully", () => {
    const exact = selectProblem({ difficulty: "HARD", topics: ["graphs"], random: () => 0 });
    expect(exact.matched).toBe("exact");
    expect(getProblemDefinition(exact.slug)!.difficulty).toBe("HARD");
    expect(getProblemDefinition(exact.slug)!.topics).toContain("graphs");

    const fallback = selectProblem({ difficulty: "EASY", topics: ["sliding-window"], random: () => 0 });
    expect(fallback.matched).toBe("topic-only");

    const excludeAll = selectProblem({ difficulty: "EASY", exclude: ALL_PROBLEM_SLUGS.slice(1), random: () => 0 });
    expect(excludeAll.slug).toBe(ALL_PROBLEM_SLUGS[0]);
  });

  it("filters the catalogue", () => {
    const easyTrees = listProblems({ difficulty: "EASY", topics: ["trees"] });
    expect(easyTrees.length).toBeGreaterThan(0);
    expect(easyTrees.every((p) => p.difficulty === "EASY" && p.topics.includes("trees"))).toBe(true);
  });
});
