/**
 * Resume support. Resumes are untrusted input: their text is wrapped as data
 * in every prompt, nothing in them is treated as verified, and the raw file
 * and extracted text are discarded after structuring. Failures here never
 * block a normal interview.
 */
import type { Difficulty } from "@repo/core/problems";
import { z } from "zod";
import { db, logger } from "../infra";
import { getAiClient } from "./client";
import { UNTRUSTED_CONTENT_RULE, generateStructured, untrusted } from "./structured";

export const resumeProfileSchema = z.object({
  summary: z.string().max(1200).default(""),
  skills: z.array(z.string().min(1).max(60)).max(40).default([]),
  projects: z
    .array(z.object({ name: z.string().min(1).max(120), description: z.string().max(600).default(""), technologies: z.array(z.string().max(60)).max(15).default([]) }))
    .max(10)
    .default([]),
  experience: z
    .array(z.object({ role: z.string().max(120), organization: z.string().max(120).default(""), highlights: z.array(z.string().max(300)).max(6).default([]) }))
    .max(10)
    .default([]),
});
export type ResumeProfileData = z.infer<typeof resumeProfileSchema>;

const PROFILE_SHAPE = `{"summary": string, "skills": string[], "projects": [{"name": string, "description": string, "technologies": string[]}], "experience": [{"role": string, "organization": string, "highlights": string[]}]}`;

/** Deterministic fallback when no AI provider is configured: keyword-based skill extraction. */
const KNOWN_SKILLS = [
  "Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "Go", "Rust", "Kotlin", "Swift", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis",
  "React", "Next.js", "Node.js", "Express", "Django", "Flask", "Spring", "Docker", "Kubernetes", "AWS", "GCP", "Azure", "Git", "Linux",
  "GraphQL", "REST", "TensorFlow", "PyTorch", "Machine Learning", "Tailwind", "HTML", "CSS", "Prisma", "Socket.IO",
];

export function heuristicProfile(text: string): ResumeProfileData {
  const lower = text.toLowerCase();
  const skills = KNOWN_SKILLS.filter((s) => {
    const k = s.toLowerCase();
    return k.length <= 2 ? new RegExp(`\\b${k.replace(/[+#.]/g, "\\$&")}\\b`).test(lower) : lower.includes(k);
  });
  return { summary: "", skills, projects: [], experience: [] };
}

export async function structureResume(text: string): Promise<{ profile: ResumeProfileData; method: "ai" | "keywords" }> {
  const client = getAiClient();
  if (!client) return { profile: heuristicProfile(text), method: "keywords" };
  try {
    const result = await generateStructured(client, {
      task: "resume-extract",
      system: `You extract structured information from a resume for interview preparation. Only include facts that are explicitly written in the resume; do not infer or embellish. ${UNTRUSTED_CONTENT_RULE}`,
      prompt: `Extract the candidate's skills, projects and experience.\n\n${untrusted("resume", text, 15_000)}`,
      schema: resumeProfileSchema,
      shapeHint: PROFILE_SHAPE,
      maxOutputTokens: 2048,
      temperature: 0.1,
    });
    return { profile: result.data, method: "ai" };
  } catch (err) {
    logger.warn("resume structuring failed, using keyword fallback", { error: (err as Error).message });
    return { profile: heuristicProfile(text), method: "keywords" };
  }
}

const resumeQuestionSchema = z.object({
  question: z.string().min(20).max(600),
  topic: z.string().max(60).default("experience"),
  keyPoints: z.array(z.object({ point: z.string().max(200), keywords: z.array(z.string().max(40)).max(8) })).max(6).default([]),
  followUps: z.array(z.string().max(300)).max(3).default([]),
  groundedIn: z.string().min(1).max(160),
});
export type ResumeQuestion = z.infer<typeof resumeQuestionSchema>;

export async function generateResumeQuestion(options: {
  resumeProfileId: string;
  userId: string;
  kind: "TECHNICAL" | "BEHAVIORAL";
  difficulty: Difficulty;
}): Promise<ResumeQuestion | null> {
  const client = getAiClient();
  if (!client) return null;
  const profile = await db.resumeProfile.findFirst({ where: { id: options.resumeProfileId, userId: options.userId, status: "READY", confirmedAt: { not: null } } });
  if (!profile) return null;
  const material = JSON.stringify({ summary: profile.summary, skills: profile.skills, projects: profile.projects, experience: profile.experience });
  try {
    const result = await generateStructured(client, {
      task: "resume-question",
      system: `You are a fair technical interviewer. Ask one ${options.kind === "TECHNICAL" ? "technical deep-dive" : "behavioral"} question grounded in a specific project or skill from the candidate's reviewed resume profile. Phrase it as an open question; never imply that a claim is verified or doubted. ${UNTRUSTED_CONTENT_RULE}`,
      prompt: `Difficulty: ${options.difficulty.toLowerCase()}.\n${untrusted("resume-profile", material, 6000)}\nReturn the question, the topic, 3-5 key points a strong answer would cover (with lower-case keywords), follow-up questions and the project/skill name it is grounded in.`,
      schema: resumeQuestionSchema,
      shapeHint: `{"question": string, "topic": string, "keyPoints": [{"point": string, "keywords": string[]}], "followUps": string[], "groundedIn": string}`,
      maxOutputTokens: 1024,
      temperature: 0.6,
    });
    return result.data;
  } catch (err) {
    logger.warn("resume question generation failed", { error: (err as Error).message });
    return null;
  }
}
