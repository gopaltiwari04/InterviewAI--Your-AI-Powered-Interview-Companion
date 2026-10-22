import Link from "next/link";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";

/** Shared top bar for signed-in pages. */
export async function AppHeader() {
  const session = await auth();
  return (
    <header className="border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/dashboard" className="text-lg font-bold text-indigo-600">
          InterviewAI
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-sm">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/resume">Resume</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/interview/new">
              New<span className="hidden sm:inline">&nbsp;interview</span>
            </Link>
          </Button>
          {session?.user && (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button variant="outline" size="sm" type="submit">
                Log out
              </Button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}
