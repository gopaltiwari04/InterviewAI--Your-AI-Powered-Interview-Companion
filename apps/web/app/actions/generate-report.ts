"use server";

import { db } from "@repo/database";
import { google } from "@ai-sdk/google";
import { generateObject, jsonSchema } from 'ai';
// Avoid requiring 'zod' at runtime; use a plain JSON Schema compatible with generateObject
const reportSchema = {
  type: "object",
  properties: {
    techScore: { type: "number", minimum: 0, maximum: 100 },
    commScore: { type: "number", minimum: 0, maximum: 100 },
    overallScore: { type: "number", minimum: 0, maximum: 100 },
    strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } },
    aiFeedback: { type: "string" }
  },
  required: ["techScore", "commScore", "overallScore", "strengths", "weaknesses", "aiFeedback"]
} as const;

export async function generateReport(roomId: string) {
  // 1. Fetch the entire interview timeline
  const events = await db.interviewEvent.findMany({
    where: { roomId },
    orderBy: { timestamp: "asc" }
  });

  if (events.length === 0) {
    throw new Error("No events found for this room. Cannot generate a report.");
  }

  // 2. Condense the events into a format Gemini can easily read
  const timelineSummary = events.map((e: any) => 
    `[${e.eventType}] - ${JSON.stringify(e.payload)}`
  ).join("\n");

  // 3. Force Gemini to output a strict JSON structure matching our Prisma model
  const { object } = await generateObject({
    model: google("gemini-2.5-flash"), // You can swap to gemini-1.5-flash if you prefer
    // Use JSON schema to avoid zod dependency
    schema: jsonSchema(reportSchema as any), 
    prompt: `
      You are an elite Engineering Manager. Review the following timeline of a technical interview.
      Analyze the candidate's code submissions, execution results, and conversational problem-solving.
      Generate a highly accurate, structured performance report.

      Interview Timeline:
      ${timelineSummary}
    `
  });

  // Helper type for the generated report object
  type ReportData = {
    techScore: number;
    commScore: number;
    overallScore: number;
    strengths: string[];
    weaknesses: string[];
    aiFeedback: string;
  };

  const reportData = object as unknown as ReportData;

  // 4. Save the generated report to the PostgreSQL database
  const savedReport = await db.interviewReport.create({
    data: {
      roomId,
      techScore: reportData.techScore,
      commScore: reportData.commScore,
      overallScore: reportData.overallScore,
      strengths: reportData.strengths,
      weaknesses: reportData.weaknesses,
      aiFeedback: reportData.aiFeedback,
    }
  });

  // 5. Update the room status so it shows as "COMPLETED" on the dashboard
  await db.interviewRoom.update({
    where: { id: roomId },
    data: { status: "COMPLETED" }
  });

  return savedReport;
}