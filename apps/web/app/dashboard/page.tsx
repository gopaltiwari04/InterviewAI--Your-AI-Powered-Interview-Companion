import { db } from "@repo/database";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ScoreChart } from "@/components/dashboard/score-chart";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signOut } from "@/auth";

// 2. Minimal local type for InterviewRoom with report to avoid Prisma type helper
type DashboardInterviewRoom = {
  id: string;
  createdAt: string | Date;
  report: { techScore: number; commScore: number; overallScore: number } | null;
};

export default async function DashboardPage() {
  const session = await auth();

console.log(
  "SESSION_DEBUG",
  JSON.stringify(session, null, 2)
);

if (!session?.user?.id) {
  redirect("/login");
}

  const userInterviews = await db.interviewRoom.findMany({
    where: {
      participants: {
        some: { userId: session.user.id }
      },
      status: "COMPLETED" 
    },
    include: {
      report: true,
    },
    orderBy: { createdAt: 'asc' } 
  });

  // 3. Explicitly type the 'room' parameter
  const chartData = userInterviews
    .filter((room: DashboardInterviewRoom) => room.report !== null)
    .map((room: DashboardInterviewRoom) => ({
      date: new Date(room.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      techScore: room.report!.techScore,
      commScore: room.report!.commScore,
      overallScore: room.report!.overallScore,
    }));

  return (
    <main className="max-w-6xl mx-auto p-8 space-y-8 bg-zinc-50 dark:bg-zinc-950 min-h-screen text-zinc-900 dark:text-zinc-100">
      <div className="flex justify-between items-center">
  <div>
  <div className="text-indigo-600 text-2xl font-bold">
    InterviewAI - Your AI-Powered Interview Companion
  </div>

  <h1 className="text-3xl font-bold mt-4">
    Hi {session.user.name?.split(" ")[0]} 👋
  </h1>

  <p className="text-zinc-500 mt-1">
    Welcome back. Track your progress and start a new interview.
  </p>
</div>

  <div className="flex gap-2">
    <Button asChild>
      <Link href="/interview/new">
        Start New Interview
      </Link>
    </Button>

    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <Button variant="outline" type="submit">
        Log Out
      </Button>
    </form>
  </div>
</div>

      {/* Analytics Chart */}
      <ScoreChart data={chartData} />

      {/* Interview History Table */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950">
          <h2 className="font-semibold">Interview History</h2>
        </div>
        
        {userInterviews.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-sm">No completed interviews found.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-950/50">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Room ID</th>
                <th className="px-6 py-3">Overall Score</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* 4. Use a spread operator to avoid mutating the array, and type 'room' */}
              {[...userInterviews].reverse().map((room: DashboardInterviewRoom) => (
                <tr key={room.id} className="border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-6 py-4">{new Date(room.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4 font-mono text-xs">{room.id}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        room.report && room.report.overallScore > 75
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      }`}
                    >
                      {room.report?.overallScore || "N/A"}/100
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/interview/${room.id}/report`}>View Report</Link>
                    </Button>
                    <Button variant="secondary" size="sm" asChild>
                      <Link href={`/interview/${room.id}/replay`}>Replay</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}