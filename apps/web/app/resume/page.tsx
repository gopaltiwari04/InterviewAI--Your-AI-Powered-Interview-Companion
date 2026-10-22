import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { ResumeManager, type ResumeView } from "@/components/resume/resume-manager";
import { listResumes } from "@/lib/server/engine";

export const metadata: Metadata = { title: "Resume" };
export const dynamic = "force-dynamic";

export default async function ResumePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/resume");
  const resumes = await listResumes({ userId: session.user.id });
  const views: ResumeView[] = resumes.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    status: r.status,
    summary: r.summary ?? "",
    skills: r.skills,
    projects: (r.projects as ResumeView["projects"]) ?? [],
    experience: (r.experience as ResumeView["experience"]) ?? [],
    confirmed: Boolean(r.confirmedAt),
    notice: r.error,
    createdAt: r.createdAt.toISOString(),
  }));
  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Resume-based questions</h1>
          <p className="text-sm text-muted-foreground">
            Optional. Upload a resume (PDF or text, up to 2 MB) and review what was extracted. Confirmed profiles can be used for technical and behavioral interviews. The file itself is not stored, and nothing in it is treated as verified.
          </p>
        </div>
        <ResumeManager initial={views} />
      </main>
    </>
  );
}
