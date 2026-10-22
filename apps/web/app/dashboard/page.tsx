import { MODE_INFO, type InterviewMode } from "@repo/core/interview";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { ScoreChart, SkillChart } from "@/components/dashboard/score-chart";
import { difficultyTone } from "@/components/interview/question-panel";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboardStats, interviewHistory } from "@/lib/server/engine";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const statusTone: Record<string, BadgeTone> = { CREATED: "neutral", IN_PROGRESS: "info", COMPLETED: "success", CANCELLED: "neutral" };

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const actor = { userId: session.user.id, name: session.user.name };
  const page = Math.max(1, Number((await searchParams).page ?? 1) || 1);
  const [stats, history] = await Promise.all([dashboardStats(actor), interviewHistory(actor, page, 10)]);
  const pages = Math.max(1, Math.ceil(history.total / history.pageSize));
  const acceptance = stats.totals.codingSubmissions ? Math.round((stats.totals.acceptedSubmissions / stats.totals.codingSubmissions) * 100) : null;

  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Hi {session.user.name?.split(" ")[0] ?? "there"}</h1>
            <p className="text-sm text-muted-foreground">Your progress across practice interviews.</p>
          </div>
          <Button asChild>
            <Link href="/interview/new">Start a new interview</Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Interviews" value={stats.totals.interviews} hint={`${stats.totals.completed} completed`} />
          <Stat label="Average score" value={stats.totals.averageScore ?? "—"} hint="Evaluated interviews" />
          <Stat label="Hidden-test submissions" value={stats.totals.codingSubmissions} />
          <Stat label="Accepted" value={acceptance === null ? "—" : `${acceptance}%`} hint={`${stats.totals.acceptedSubmissions} accepted`} />
        </div>

        {stats.totals.interviews === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No interviews yet</CardTitle>
              <CardDescription>Start a DSA interview to solve a real coding problem against hidden tests, then come back to see your progress here.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild><Link href="/interview/new">Set up your first interview</Link></Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Improvement over time</CardTitle>
                <CardDescription>Scores from completed evaluations (0-100).</CardDescription>
              </CardHeader>
              <CardContent>{stats.trend.length ? <ScoreChart data={stats.trend} /> : <p className="text-sm text-muted-foreground">Finish an interview to see your trend.</p>}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Scores by skill</CardTitle>
                <CardDescription>Average rubric score per dimension, weakest first.</CardDescription>
              </CardHeader>
              <CardContent>{stats.skills.length ? <SkillChart data={stats.skills} /> : <p className="text-sm text-muted-foreground">No evaluated answers yet.</p>}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Topics</CardTitle>
                <CardDescription>Best hidden-test pass rate per coding topic.</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.topics.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No coding questions completed yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {stats.topics.map((t) => (
                      <li key={t.topic}>
                        <div className="flex justify-between text-sm">
                          <span>{t.label}{stats.weakTopics.includes(t.topic) && <Badge tone="warning" className="ml-2">needs practice</Badge>}</span>
                          <span className="text-muted-foreground">{t.averagePassRate}% · {t.attempted} attempted</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <div className="h-full bg-indigo-600" style={{ width: `${t.averagePassRate}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recommended practice</CardTitle>
                <CardDescription>Chosen from your weakest topics and problems you have not tried.</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.recommendations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Complete a coding question to get recommendations.</p>
                ) : (
                  <ul className="space-y-3">
                    {stats.recommendations.map((r) => (
                      <li key={r.slug} className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{r.title} <Badge tone={difficultyTone[r.difficulty]} className="ml-1">{r.difficulty.toLowerCase()}</Badge></div>
                          <div className="text-xs text-muted-foreground">{r.reason}</div>
                        </div>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/interview/new?problem=${encodeURIComponent(r.slug)}`}>Practise</Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Interview history</CardTitle>
          </CardHeader>
          <CardContent>
            {history.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No interviews yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Progress</th>
                      <th className="py-2 pr-3">Score</th>
                      <th className="py-2 pr-3">Signals</th>
                      <th className="py-2 text-right"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.rows.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString()}</td>
                        <td className="py-2 pr-3">
                          {MODE_INFO[r.mode as InterviewMode]?.label ?? r.mode} <Badge tone={difficultyTone[r.difficulty]} className="ml-1">{r.difficulty.toLowerCase()}</Badge>
                        </td>
                        <td className="py-2 pr-3"><Badge tone={statusTone[r.status]}>{r.status.replace("_", " ").toLowerCase()}</Badge>{r.status === "COMPLETED" && r.evaluationStatus !== "COMPLETED" && <span className="ml-1 text-xs text-muted-foreground">({r.evaluationStatus.toLowerCase()})</span>}</td>
                        <td className="py-2 pr-3">{r.answered}/{r.questionCount}</td>
                        <td className="py-2 pr-3 font-medium">{r.overallScore ?? "—"}</td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{r.elevatedSignals > 0 ? `${r.elevatedSignals} to review` : "—"}</td>
                        <td className="py-2 text-right">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={r.status === "COMPLETED" ? `/interview/${r.id}/report` : `/interview/${r.id}`}>{r.status === "COMPLETED" ? "Report" : r.status === "CANCELLED" ? "View" : "Resume"}</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {pages > 1 && (
              <nav aria-label="History pages" className="mt-4 flex items-center justify-between text-sm">
                <Button variant="outline" size="sm" asChild disabled={page <= 1}>
                  <Link href={`/dashboard?page=${Math.max(1, page - 1)}`} aria-disabled={page <= 1}>Previous</Link>
                </Button>
                <span>Page {page} of {pages}</span>
                <Button variant="outline" size="sm" asChild disabled={page >= pages}>
                  <Link href={`/dashboard?page=${Math.min(pages, page + 1)}`} aria-disabled={page >= pages}>Next</Link>
                </Button>
              </nav>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
