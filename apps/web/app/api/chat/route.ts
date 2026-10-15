import { generateText } from 'ai';
import { db } from '@repo/database';
import {
  FALLBACK_MODEL,
  PRIMARY_MODEL,
  getStatusCode,
  interviewModel,
  isGeminiConfigured,
  isRetryableModelError,
} from '@/lib/ai';

export const maxDuration = 30;

const buildSystemPrompt = (codeContext: string | undefined) => {
  const candidateName = "Candidate";

  return `You are InterviewAI's AI Interviewer.

The candidate's name is ${candidateName}.

Rules:
- You are an AI interviewer, not a human.
- Never claim to be a Staff Engineer, recruiter, manager, or employee.
- Never use placeholders like [Your Name] or [Company Name].
- Introduce yourself as InterviewAI's virtual interviewer in your first reply only; do not repeat the introduction later.
- Evaluate coding ability, communication skills, and problem-solving.
- Be professional and encouraging.
- Ask interview questions one at a time.
- Focus on technical assessment.

The candidate's current code in the editor (it may change between messages):
${codeContext || "// No code"}`;
};

async function askInterviewer(system: string, messages: { role: 'user' | 'assistant'; content: string }[]) {
  try {
    return await generateText({ model: interviewModel(PRIMARY_MODEL), system, messages });
  } catch (error) {
    if (!isRetryableModelError(error) || FALLBACK_MODEL === PRIMARY_MODEL) throw error;
    console.warn(`[CHAT] ${PRIMARY_MODEL} unavailable (HTTP ${getStatusCode(error)}), retrying with ${FALLBACK_MODEL}`);
    return await generateText({ model: interviewModel(FALLBACK_MODEL), system, messages });
  }
}

export async function POST(req: Request) {
  if (!isGeminiConfigured()) {
    console.error("[CHAT] GOOGLE_GENERATIVE_AI_API_KEY is not set");
    return Response.json(
      { content: "⚠️ The AI interviewer is not configured on the server." },
      { status: 500 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ content: "⚠️ Invalid request." }, { status: 400 });
  }

  const { messages, codeContext, roomId } = body ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ content: "⚠️ No messages were sent." }, { status: 400 });
  }

  const cleanMessages = messages
    .filter((m: any) => typeof m?.content === 'string' && m.content.trim())
    .map((m: any) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content as string,
    }));

  if (cleanMessages.length === 0 || cleanMessages[cleanMessages.length - 1]!.role !== 'user') {
    return Response.json({ content: "⚠️ The last message must come from the candidate." }, { status: 400 });
  }

  let fullText: string;
  try {
    const result = await askInterviewer(buildSystemPrompt(codeContext), cleanMessages);
    fullText = result.text;
  } catch (error: any) {
    const status = getStatusCode(error);
    console.error(`[CHAT] Gemini request failed (HTTP ${status ?? 'n/a'}): ${error?.message}`);

    if (status === 429) {
      return Response.json(
        { content: "⚠️ The AI interviewer has hit its usage limit. Please wait a minute and try again." },
        { status: 429 }
      );
    }
    if (status === 503 || status === 500) {
      return Response.json(
        { content: "⚠️ The AI model is overloaded right now. Please send your message again in a moment." },
        { status: 503 }
      );
    }
    if (status === 400 || status === 401 || status === 403) {
      return Response.json(
        { content: "⚠️ The AI interviewer could not authenticate with Gemini. Check the server API key." },
        { status: 502 }
      );
    }
    return Response.json(
      { content: "⚠️ The AI interviewer failed to respond. Please try again." },
      { status: 500 }
    );
  }

  if (!fullText.trim()) {
    return Response.json(
      { content: "⚠️ The AI returned an empty reply. Please rephrase and try again." },
      { status: 502 }
    );
  }

  // Save to Database
  if (roomId) {
    try {
      const lastMessage = cleanMessages[cleanMessages.length - 1]!;

      const room = await db.interviewRoom.findUnique({
        where: { id: roomId },
        select: { id: true },
      });

      if (!room) {
        console.warn(`[CHAT] Room ${roomId} not found; chat messages were not saved.`);
      } else {
        // Two separate inserts so the user message gets the earlier timestamp
        // (reports order events by timestamp).
        await db.interviewEvent.create({
          data: {
            roomId,
            eventType: "AI_CHAT_MESSAGE",
            payload: { role: "user", content: lastMessage.content, codeSnapshot: codeContext },
          },
        });

        await db.interviewEvent.create({
          data: {
            roomId,
            eventType: "AI_CHAT_MESSAGE",
            payload: { role: "assistant", content: fullText },
          },
        });
      }
    } catch (dbError) {
      console.error("[PRISMA ERROR] Failed to save to DB:", dbError);
    }
  }

  return Response.json({ content: fullText });
}
