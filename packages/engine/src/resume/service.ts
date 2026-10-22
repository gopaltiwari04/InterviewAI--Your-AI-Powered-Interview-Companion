/**
 * Resume upload and review. Accepts PDF or plain text up to 2 MB, checks the
 * file signature (not just the extension or MIME type), extracts text,
 * structures it, then discards the file and raw text. The candidate reviews
 * and confirms the profile before it can be used in an interview.
 */
import { z } from "zod";
import { resumeProfileSchema, structureResume } from "../ai/resume";
import { badRequest, notFound, tooLarge } from "../errors";
import { db, logger, withTimeout } from "../infra";
import type { Actor } from "../interviews/access";
import { RATE_LIMITS, enforceRateLimit } from "../rate-limit";

export const MAX_RESUME_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 30_000;

type Kind = "pdf" | "text";

export function detectResumeType(bytes: Uint8Array, fileName: string): Kind {
  const header = Buffer.from(bytes.slice(0, 5)).toString("latin1");
  if (header === "%PDF-") return "pdf";
  if (/\.(txt|md)$/i.test(fileName)) {
    // Plain text must decode as UTF-8 without NUL bytes (rejects binaries renamed to .txt).
    const sample = Buffer.from(bytes.slice(0, 4096));
    if (sample.includes(0)) throw badRequest("The file does not look like text.");
    return "text";
  }
  throw badRequest("Upload a PDF or a .txt/.md file.");
}

async function extractText(bytes: Uint8Array, kind: Kind): Promise<string> {
  if (kind === "text") return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  if (pdf.numPages > 10) throw badRequest("Resumes longer than 10 pages are not supported.");
  const { text } = await pdfText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

export async function uploadResume(actor: Actor, file: { name: string; bytes: Uint8Array }) {
  await enforceRateLimit(RATE_LIMITS.resumeUpload, actor.userId);
  if (file.bytes.byteLength === 0) throw badRequest("The file is empty.");
  if (file.bytes.byteLength > MAX_RESUME_BYTES) throw tooLarge("Resumes must be 2 MB or smaller.");
  const fileName = file.name.replace(/[^\w .()-]/g, "_").slice(0, 120) || "resume";
  const kind = detectResumeType(file.bytes, fileName);

  const profile = await db.resumeProfile.create({ data: { userId: actor.userId, fileName, fileSizeBytes: file.bytes.byteLength, status: "PROCESSING" } });
  try {
    const raw = await withTimeout(extractText(file.bytes, kind), 20_000, "resume text extraction");
    const text = raw.split(String.fromCharCode(0)).join("").replace(/[ \t]+/g, " ").trim().slice(0, MAX_TEXT_CHARS);
    if (text.length < 50) throw badRequest("Not enough text could be extracted. Scanned (image-only) PDFs are not supported.");
    const { profile: data, method } = await structureResume(text);
    return await db.resumeProfile.update({
      where: { id: profile.id },
      data: {
        status: "READY",
        summary: data.summary,
        skills: data.skills,
        projects: data.projects,
        experience: data.experience,
        error: method === "keywords" ? "AI extraction was unavailable; skills were detected by keyword matching. Please review them." : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error && "status" in err ? err.message : "The resume could not be processed.";
    logger.warn("resume processing failed", { profileId: profile.id, error: (err as Error).message });
    await db.resumeProfile.update({ where: { id: profile.id }, data: { status: "FAILED", error: message } });
    throw badRequest(message);
  }
}

export async function listResumes(actor: Actor) {
  return db.resumeProfile.findMany({ where: { userId: actor.userId }, orderBy: { createdAt: "desc" }, take: 10 });
}

const reviewSchema = resumeProfileSchema.extend({ confirm: z.boolean().default(true) });

export async function reviewResume(actor: Actor, id: string, input: unknown) {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) throw badRequest("Invalid resume profile.", { issues: parsed.error.issues.slice(0, 5).map((i) => i.message) });
  const existing = await db.resumeProfile.findFirst({ where: { id, userId: actor.userId } });
  if (!existing) throw notFound("Resume");
  if (existing.status !== "READY") throw badRequest("This resume could not be processed.");
  const { confirm, ...data } = parsed.data;
  return db.resumeProfile.update({
    where: { id },
    data: { summary: data.summary, skills: data.skills, projects: data.projects, experience: data.experience, confirmedAt: confirm ? new Date() : null },
  });
}

export async function deleteResume(actor: Actor, id: string): Promise<void> {
  const deleted = await db.resumeProfile.deleteMany({ where: { id, userId: actor.userId } });
  if (deleted.count === 0) throw notFound("Resume");
}
