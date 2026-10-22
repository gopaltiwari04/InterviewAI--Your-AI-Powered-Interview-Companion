/**
 * The AI interviewer. Conversation history comes from the database, not the
 * client; prompts contain only data the candidate can already see (statement,
 * visible examples, their own code and judge verdict counts). Hidden tests and
 * reference solutions are never put in a prompt, so they cannot leak.
 */
import { MAX_CHAT_MESSAGE_CHARS, isPastDeadline, type ClientChatMessage } from "@repo/core/interview";
import { MAX_SOURCE_BYTES, VERDICT_LABELS } from "@repo/core/judge";
import type { InterviewQuestion } from "@repo/database";
import { z } from "zod";
import { AiError, getAiClient, type ChatMessage } from "../ai/client";
import { UNTRUSTED_CONTENT_RULE, untrusted } from "../ai/structured";
import { badRequest, conflict, notFound } from "../errors";
import { db, logger } from "../infra";
import { RATE_LIMITS, enforceRateLimit } from "../rate-limit";
import { loadRoomForCandidate, type Actor } from "./access";
import { resolveProblem } from "./problems";
import { hintsOf } from "./questions";

const INTERVIEWER_SYSTEM = `You are InterviewAI's virtual technical interviewer, an AI (never claim to be a human or an employee of a company).
Conduct a realistic, supportive interview:
- Ask one question at a time and keep replies under 120 words.
- For coding problems, never write the solution or full code. Give at most a small hint when the candidate is stuck, and prefer asking guiding questions.
- Probe reasoning: approach, data structures, time and space complexity, edge cases and trade-offs.
- Only state facts about test results that appear in the "Judge results" section; never invent results.
- You do not know the hidden tests and must not guess them.
${UNTRUSTED_CONTENT_RULE}`;

async function questionContext(question: InterviewQuestion, codeSnapshot: string | null): Promise<string> {
  const parts: string[] = [`Question (${question.kind.toLowerCase()}, ${question.difficulty.toLowerCase()}): ${question.title}`];
  if (question.kind === "CODING") {
    const problem = await resolveProblem(question);
    if (problem) {
      parts.push(`Statement: ${problem.publicView.statement}`, `Constraints: ${problem.publicView.constraints.join("; ")}`);
      if (problem.complexity) parts.push(`(Interviewer note: a good solution is ${problem.complexity.time} time, ${problem.complexity.space} space. Do not reveal this unless the candidate has already reached it.)`);
    }
    const subs = await db.submission.findMany({ where: { questionId: question.id, kind: { in: ["RUN", "SUBMIT"] }, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 3 });
    parts.push(
      subs.length
        ? `Judge results (most recent first): ${subs.map((s) => `${s.kind} in ${s.language}: ${VERDICT_LABELS[s.verdict ?? "INTERNAL_ERROR"]}, ${s.passedCount ?? 0}/${s.totalCount ?? 0} tests passed`).join("; ")}`
        : "Judge results: the candidate has not run code yet.",
    );
    const code = codeSnapshot ?? question.draftCode;
    if (code) parts.push(`Candidate's current code (${question.draftLanguage ?? "unknown language"}):\n${untrusted("code", code, 12_000)}`);
    if (question.explanation) parts.push(`Candidate's written explanation:\n${untrusted("explanation", JSON.stringify(question.explanation), 4000)}`);
  } else {
    parts.push(`Question text: ${question.prompt}`);
    if (question.answer) parts.push(`Candidate's written answer:\n${untrusted("answer", question.answer, 8000)}`);
  }
  return parts.join("\n\n");
}

async function history(roomId: string, questionId: string): Promise<ChatMessage[]> {
  const events = await db.interviewEvent.findMany({
    where: { roomId, questionId, eventType: { in: ["AI_CHAT_MESSAGE", "FOLLOW_UP_ASKED"] } },
    orderBy: { timestamp: "desc" },
    take: 20,
  });
  return events
    .reverse()
    .map((e) => e.payload as { role?: string; content?: string })
    .filter((p) => typeof p.content === "string" && p.content.trim())
    .map((p) => ({ role: p.role === "user" ? ("user" as const) : ("assistant" as const), content: p.content! }));
}

function toMessage(e: { id: string; questionId: string | null; timestamp: Date; eventType: string; payload: unknown }): ClientChatMessage {
  const p = e.payload as { role?: string; content?: string; kind?: string };
  return {
    id: e.id,
    role: p.role === "user" ? "user" : "assistant",
    content: p.content ?? "",
    questionId: e.questionId,
    kind: e.eventType === "FOLLOW_UP_ASKED" ? "follow-up" : p.kind === "system" ? "system" : "chat",
    createdAt: e.timestamp.toISOString(),
  };
}

const chatSchema = z.object({
  questionId: z.string().min(1).max(64),
  message: z.string().trim().min(1, "Type a message first.").max(MAX_CHAT_MESSAGE_CHARS),
  codeSnapshot: z.string().max(MAX_SOURCE_BYTES).nullable().optional(),
});

export interface ChatResult {
  messages: ClientChatMessage[];
  aiAvailable: boolean;
}

export async function sendChatMessage(roomId: string, actor: Actor, input: unknown): Promise<ChatResult> {
  const parsed = chatSchema.safeParse(input);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid message.");
  const { room } = await loadRoomForCandidate(roomId, actor);
  if (room.status !== "IN_PROGRESS" || isPastDeadline(room.endsAt)) throw conflict("This interview is not in progress.");
  const question = await db.interviewQuestion.findFirst({ where: { id: parsed.data.questionId, roomId } });
  if (!question) throw notFound("Question");
  await enforceRateLimit(RATE_LIMITS.chat, actor.userId);

  const userEvent = await db.interviewEvent.create({
    data: { roomId, questionId: question.id, userId: actor.userId, eventType: "AI_CHAT_MESSAGE", payload: { role: "user", content: parsed.data.message } },
  });

  const client = getAiClient();
  let reply: string;
  let aiAvailable = true;
  if (!client) {
    aiAvailable = false;
    reply = "The AI interviewer is not configured on this server, so I can't reply right now. Your message is saved and the rest of the interview (questions, code runs and the report) still works.";
  } else {
    try {
      const context = await questionContext(question, parsed.data.codeSnapshot ?? null);
      const msgs = await history(roomId, question.id);
      const completion = await client.complete({
        task: "interviewer-chat",
        system: `${INTERVIEWER_SYSTEM}\n\nCurrent question context:\n${context}`,
        // The latest user message is already in the history (it was saved above).
        messages: msgs.length ? msgs : [{ role: "user", content: parsed.data.message }],
        maxOutputTokens: 600,
        temperature: 0.5,
      });
      reply = completion.text.trim();
    } catch (err) {
      aiAvailable = false;
      const code = err instanceof AiError ? err.code : "UNKNOWN";
      logger.warn("interviewer reply failed", { roomId, code });
      reply =
        code === "RATE_LIMITED"
          ? "I'm getting a lot of requests right now. Please wait a minute and send your message again."
          : "I couldn't reply just now because the AI service is unavailable. Please try again in a moment; your progress is saved.";
    }
  }
  const assistantEvent = await db.interviewEvent.create({
    data: { roomId, questionId: question.id, eventType: "AI_CHAT_MESSAGE", payload: { role: "assistant", content: reply, kind: aiAvailable ? "chat" : "system" } },
  });
  return { messages: [toMessage(userEvent), toMessage(assistantEvent)], aiAvailable };
}

const followUpSchema = z.object({
  questionId: z.string().min(1).max(64),
  trigger: z.enum(["submission", "answer"]),
  submissionId: z.string().max(64).optional(),
});

/**
 * Generates one follow-up per trigger (a completed submission or a written
 * answer). Idempotent: a repeat call returns the existing follow-up. Falls
 * back to curated follow-ups when the AI is unavailable.
 */
export async function generateFollowUp(roomId: string, actor: Actor, input: unknown): Promise<ClientChatMessage | null> {
  const parsed = followUpSchema.safeParse(input);
  if (!parsed.success) throw badRequest("Invalid follow-up request.");
  const { room } = await loadRoomForCandidate(roomId, actor);
  if (room.status !== "IN_PROGRESS") return null;
  const question = await db.interviewQuestion.findFirst({ where: { id: parsed.data.questionId, roomId } });
  if (!question) throw notFound("Question");

  let key: string;
  let situation: string;
  if (parsed.data.trigger === "submission") {
    const sub = await db.submission.findFirst({ where: { id: parsed.data.submissionId ?? "", questionId: question.id, kind: "SUBMIT" } });
    if (!sub || sub.status !== "COMPLETED") return null;
    key = `submission:${sub.id}`;
    situation = `The candidate just submitted for hidden-test evaluation. The judge reported: ${VERDICT_LABELS[sub.verdict ?? "INTERNAL_ERROR"]}, ${sub.passedCount}/${sub.totalCount} tests passed. Ask one follow-up question about their solution: if it passed, probe complexity, trade-offs or an alternative approach; if it failed, help them reason about which kind of input could break it without revealing any test.`;
  } else {
    if (!question.answer && !question.explanation) return null;
    key = `answer:${question.answeredAt?.getTime() ?? "explanation"}`;
    situation = "The candidate just submitted a written answer. Ask exactly one follow-up question that probes a gap or asks for more depth, grounded in what they actually wrote.";
  }

  const existing = await db.interviewEvent.findFirst({ where: { roomId, questionId: question.id, eventType: "FOLLOW_UP_ASKED", payload: { path: ["key"], equals: key } } });
  if (existing) return toMessage(existing);

  const seeds = hintsOf(question).followUps ?? [];
  let content: string | null = null;
  const client = getAiClient();
  if (client) {
    try {
      const context = await questionContext(question, null);
      const completion = await client.complete({
        task: "follow-up",
        system: `${INTERVIEWER_SYSTEM}\n\nCurrent question context:\n${context}`,
        prompt: `${situation}\nSuggested angles (optional): ${seeds.join(" | ") || "none"}\nReply with the follow-up question only.`,
        maxOutputTokens: 300,
        temperature: 0.5,
      });
      content = completion.text.trim();
    } catch (err) {
      logger.warn("follow-up generation failed, using curated follow-up", { roomId, error: (err as Error).message });
    }
  }
  if (!content) {
    const asked = await db.interviewEvent.count({ where: { roomId, questionId: question.id, eventType: "FOLLOW_UP_ASKED" } });
    content = seeds[asked % Math.max(1, seeds.length)] ?? "Can you walk me through the time and space complexity of your approach and one edge case you considered?";
  }
  try {
    const event = await db.interviewEvent.create({
      data: { roomId, questionId: question.id, eventType: "FOLLOW_UP_ASKED", payload: { role: "assistant", content, key } },
    });
    return toMessage(event);
  } catch {
    return null;
  }
}
