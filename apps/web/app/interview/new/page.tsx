import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { SetupForm } from "@/components/setup/setup-form";
import { listResumes } from "@/lib/server/engine";
import { getPublicProblem } from "@/lib/server/problems";

export const metadata: Metadata = { title: "New interview" };
export const dynamic = "force-dynamic";

export default async function NewInterviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/interview/new");
  const params = await searchParams;
  const slug = typeof params.problem === "string" ? params.problem : null;
  const practice = slug ? getPublicProblem(slug) : null;
  
  let resumes: Awaited<ReturnType<typeof listResumes>> = [];
  try {
    const fetched = await listResumes({ userId: session.user.id });
    resumes = (fetched || []).filter((r) => r.status === "READY" && r.confirmedAt);
  } catch (err) {
    console.error("Failed to load user resumes:", err);
  }

  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold">Set up your interview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Choose the format. Nothing starts until you press Start in the next step.</p>
        <SetupForm
          practiceProblem={practice ? { slug: practice.slug, title: practice.title, difficulty: practice.difficulty, topics: practice.topics } : null}
          resumes={resumes.map((r) => ({ id: r.id, fileName: r.fileName, skills: r.skills.slice(0, 6) }))}
        />
      </main>
    </>
  );
}
