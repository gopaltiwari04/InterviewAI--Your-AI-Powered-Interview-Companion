import { streamText } from 'ai';
import { google } from '@ai-sdk/google';
import { db } from '@repo/database';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages, codeContext, roomId } = await req.json();
    console.log("ROOM ID RECEIVED:", roomId);

    const cleanMessages = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    // THE BYPASS: Inject the system context directly into the latest user message
    // This entirely avoids Google's strict "system" parameter validation rules.
    const lastIndex = cleanMessages.length - 1;
    if (lastIndex >= 0 && cleanMessages[lastIndex].role === 'user') {
      const originalMessage = cleanMessages[lastIndex].content;
      const candidateName = "Candidate";

cleanMessages[lastIndex].content =
`[System Context:

You are InterviewAI's AI Interviewer.

The candidate's name is ${candidateName}.

Rules:
- You are an AI interviewer, not a human.
- Never claim to be a Staff Engineer, recruiter, manager, or employee.
- Never use placeholders like [Your Name] or [Company Name].
- Always introduce yourself as InterviewAI's virtual interviewer.
- Evaluate coding ability, communication skills, and problem-solving.
- Be professional and encouraging.
- Ask interview questions one at a time.
- Focus on technical assessment.

Candidate code:
${codeContext || "// No code"}

]

Candidate says:
${originalMessage}`;
    }

    // Call the model using streamText WITHOUT the system parameter
    const result = await streamText({
      model: google('gemini-2.5-flash'),
      messages: cleanMessages,
    });

    // Wait for the stream to finish resolving
    const fullText = await result.text;

    // Save to Database
    if (roomId) {
      try {
        const lastMessage = messages[messages.length - 1]; // Use original message for DB
        
        const room = await db.interviewRoom.findUnique({
  where: { id: roomId }
});

console.log("ROOM FOUND:", room);

        await db.interviewEvent.create({
          data: {
            roomId: roomId,
            eventType: "AI_CHAT_MESSAGE",
            payload: { role: "user", content: lastMessage.content, codeSnapshot: codeContext }
          }
        });

        await db.interviewEvent.create({
          data: {
            roomId: roomId,
            eventType: "AI_CHAT_MESSAGE",
            payload: { role: "assistant", content: fullText }
          }
        });
      } catch (dbError) {
        console.error("[PRISMA ERROR] Failed to save to DB:", dbError);
      }
    }

    return Response.json({ content: fullText });

  } catch (error: any) {
    console.error("[CRITICAL BACKEND CRASH]:", error);
    return Response.json({ 
      content: `⚠️ SERVER ERROR: ${error.message}` 
    });
  }
}