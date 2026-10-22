import type { Difficulty } from "@repo/core/problems";
import type { KeyPoint } from "./technical";

export interface BehavioralQuestion {
  id: string;
  competency: BehavioralCompetency;
  difficulty: Difficulty;
  question: string;
  /** STAR elements the answer should contain; used for adaptive coverage only. */
  keyPoints: KeyPoint[];
  followUps: string[];
}

export const BEHAVIORAL_COMPETENCIES = ["teamwork", "conflict", "ownership", "failure", "leadership", "ambiguity", "communication", "prioritization"] as const;
export type BehavioralCompetency = (typeof BEHAVIORAL_COMPETENCIES)[number];

const star: KeyPoint[] = [
  { point: "Situation/context", keywords: ["when", "project", "team", "situation", "at my", "during"] },
  { point: "Personal actions (I did...)", keywords: ["i decided", "i built", "i proposed", "i talked", "i wrote", "i led", "i created", "i took"] },
  { point: "Outcome or result", keywords: ["result", "outcome", "as a result", "reduced", "improved", "increased", "shipped", "delivered"] },
  { point: "Reflection or learning", keywords: ["learned", "learnt", "next time", "would do", "taught me", "realised", "realized"] },
];

const q = (id: string, competency: BehavioralCompetency, difficulty: Difficulty, question: string, followUps: string[]): BehavioralQuestion => ({
  id,
  competency,
  difficulty,
  question,
  keyPoints: star,
  followUps,
});

export const BEHAVIORAL_QUESTIONS: BehavioralQuestion[] = [
  q("bh-team-project", "teamwork", "EASY", "Tell me about a project you worked on as part of a team. What was your role and what did you contribute?", [
    "How did you divide the work?",
    "What would your teammates say about working with you?",
  ]),
  q("bh-helped-teammate", "teamwork", "MEDIUM", "Describe a time you helped a teammate who was struggling. What did you do and what happened?", [
    "How did you notice they were struggling?",
    "How did you balance helping them with your own work?",
  ]),
  q("bh-disagreement", "conflict", "MEDIUM", "Tell me about a time you disagreed with a teammate or mentor about a technical decision. How did you handle it?", [
    "What was the final decision and why?",
    "Looking back, was your position right?",
  ]),
  q("bh-difficult-person", "conflict", "HARD", "Describe a situation where you had to work with someone whose working style was very different from yours.", [
    "What specifically did you change about how you worked?",
    "How did the relationship develop afterwards?",
  ]),
  q("bh-ownership-bug", "ownership", "EASY", "Tell me about a bug or problem you found and fixed without being asked to.", [
    "How did you find it?",
    "What did you do to prevent it from happening again?",
  ]),
  q("bh-ownership-beyond", "ownership", "MEDIUM", "Describe a time you took responsibility for something outside your assigned work.", [
    "Why did you decide it was worth your time?",
    "How did others react?",
  ]),
  q("bh-failure", "failure", "MEDIUM", "Tell me about a time something you built or planned did not go as expected. What happened?", [
    "What would you do differently now?",
    "How did you communicate the problem to others?",
  ]),
  q("bh-deadline-missed", "failure", "HARD", "Describe a time you missed a deadline or were about to. How did you handle it?", [
    "When did you first realise you were at risk?",
    "What did you learn about estimating work?",
  ]),
  q("bh-lead-initiative", "leadership", "MEDIUM", "Tell me about a time you led an initiative, club activity or project. How did you get others on board?", [
    "How did you handle someone who was not contributing?",
    "How did you measure success?",
  ]),
  q("bh-mentor", "leadership", "HARD", "Describe a time you taught or mentored someone. How did you adapt your approach to them?", [
    "How did you know whether they understood?",
    "What did you learn from teaching?",
  ]),
  q("bh-ambiguous-task", "ambiguity", "MEDIUM", "Tell me about a time you were given an unclear or open-ended task. How did you decide what to do?", [
    "What questions did you ask, and to whom?",
    "How did you know you were on the right track?",
  ]),
  q("bh-new-technology", "ambiguity", "EASY", "Describe a time you had to learn a new technology quickly to finish a task.", [
    "How did you structure your learning?",
    "What was the hardest part?",
  ]),
  q("bh-explain-technical", "communication", "EASY", "Tell me about a time you explained a technical concept to someone without a technical background.", [
    "How did you check they understood?",
    "What analogy or example worked best?",
  ]),
  q("bh-feedback", "communication", "MEDIUM", "Describe a time you received critical feedback. How did you respond?", [
    "What did you change afterwards?",
    "Have you ever disagreed with feedback you received?",
  ]),
  q("bh-priorities", "prioritization", "MEDIUM", "Tell me about a time you had several important tasks at once. How did you prioritise?", [
    "What did you decide not to do?",
    "How did you communicate your priorities?",
  ]),
  q("bh-tradeoff", "prioritization", "HARD", "Describe a time you had to trade off quality against speed. What did you decide and why?", [
    "What risks did you accept?",
    "Did you later go back and address the trade-off?",
  ]),
];
