/**
 * Deterministic stand-in for the AI provider, enabled with AI_PROVIDER=mock
 * (rejected in production). It lets the full interview flow, browser tests and
 * load tests run without network access or API costs. Responses are derived
 * from the prompt so evidence checks and validation paths are still exercised.
 */
import type { CompleteFn, CompletionRequest } from "./client";

function field(text: string, name: string): string | null {
  const match = text.match(new RegExp(`^${name}: (.*)$`, "m"));
  return match ? match[1]!.trim() : null;
}

function firstUntrusted(text: string, source: string): string {
  const match = text.match(new RegExp(`<untrusted source="${source}">\\n([\\s\\S]*?)\\n</untrusted>`));
  return match ? match[1]!.trim() : "";
}

function evaluateQuestion(req: CompletionRequest): string {
  const prompt = req.prompt ?? "";
  const questionId = field(prompt, "QUESTION_ID") ?? "unknown";
  const keys = (field(prompt, "AI_DIMENSIONS") ?? "communication").split(",").map((k) => k.trim()).filter(Boolean);
  let explanation = firstUntrusted(prompt, "explanation");
  try {
    explanation = (JSON.parse(explanation) as { approach?: string }).approach ?? explanation;
  } catch {
    // not JSON
  }
  const answer = firstUntrusted(prompt, "answer") || explanation || firstUntrusted(prompt, "code");
  const quote = answer.split(/\s+/).slice(0, 6).join(" ");
  return JSON.stringify({
    questionId,
    dimensions: keys.map((key, i) => ({
      key,
      score: 6 + (i % 3),
      rationale: `Mock rationale for ${key}: the response was reviewed against the rubric.`,
      evidence: quote ? [quote] : [],
    })),
    summary: "Mock evaluation: a reasonable attempt with room to explain trade-offs in more depth.",
    strengths: ["Clear structure"],
    improvements: ["Discuss edge cases explicitly"],
  });
}

const GENERATED_PROBLEM = {
  title: "Count Even Numbers",
  statement: "Given an integer array `nums`, return how many of its values are even.",
  inputDescription: "`nums`: an array of integers.",
  outputDescription: "The number of even values.",
  constraints: ["1 <= nums.length <= 1000", "-10^6 <= nums[i] <= 10^6"],
  functionName: "countEven",
  params: [{ name: "nums", type: "int[]" }],
  returns: "int",
  comparator: "exact",
  examples: [
    { args: [[1, 2, 3, 4]], output: 2, explanation: "2 and 4 are even." },
    { args: [[7]], output: 0 },
  ],
  tests: [[[0]], [[-2, -3]], [[2, 4, 6, 8]], [[1, 3, 5]], [[10, 11, 12, 13, 14]], [[-1000000, 999999, 1000000]]].map((args) => ({ args })),
  referenceSolutionPython: "def countEven(nums):\n    return sum(1 for x in nums if x % 2 == 0)\n",
  followUps: ["How would you do this in a single pass without extra memory?"],
};

export const mockComplete: CompleteFn = async (req) => {
  await new Promise((r) => setTimeout(r, 5));
  const prompt = req.prompt ?? req.messages?.map((m) => m.content).join("\n") ?? "";
  switch (req.task) {
    case "evaluate-question":
      return evaluateQuestion(req);
    case "evaluate-overall":
      return JSON.stringify({
        summary: "Mock overall summary: the candidate worked through the questions methodically.",
        strengths: ["Methodical approach"],
        improvements: ["State complexity earlier"],
      });
    case "generate-problem":
      return JSON.stringify(GENERATED_PROBLEM);
    case "resume-extract": {
      const text = firstUntrusted(prompt, "resume").toLowerCase();
      const known = ["python", "javascript", "typescript", "react", "node.js", "java", "c++", "sql", "postgresql", "redis", "docker", "aws"];
      return JSON.stringify({
        summary: "Mock summary of the resume.",
        skills: known.filter((k) => text.includes(k)),
        projects: [{ name: "Mock Project", description: "A project mentioned in the resume.", technologies: known.filter((k) => text.includes(k)).slice(0, 3) }],
        experience: [],
      });
    }
    case "resume-question":
      return JSON.stringify({
        question: "In your resume you mention Mock Project. What was the hardest technical decision you made there, and what alternatives did you consider?",
        topic: "system-design",
        keyPoints: [{ point: "Describes a concrete decision", keywords: ["decided", "chose", "decision"] }],
        followUps: ["How would you change it with what you know now?"],
        groundedIn: "Mock Project",
      });
    case "follow-up":
      return "Thanks. Can you walk me through the time and space complexity of your solution, and one edge case you handled?";
    default:
      return `Mock interviewer reply. ${prompt.length > 0 ? "Could you explain your reasoning in a bit more detail?" : "Let's begin."}`;
  }
};
