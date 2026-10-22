import { route } from "@/lib/server/api";
import { AppError, MAX_RESUME_BYTES, listResumes, uploadResume } from "@/lib/server/engine";

export const maxDuration = 60;

export const GET = route("resumes.list", async ({ actor }) => listResumes(actor));

export const POST = route("resumes.upload", async ({ req, actor }) => {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_RESUME_BYTES + 64 * 1024) throw new AppError(413, "PAYLOAD_TOO_LARGE", "Resumes must be 2 MB or smaller.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new AppError(400, "BAD_REQUEST", "Attach the resume as a file named \"file\".");
  return uploadResume(actor, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
});
