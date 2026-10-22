import { AUTOMATED_FEEDBACK_NOTICE, type QuestionResult } from "@repo/core/evaluation";
import { MODE_INFO, codingExplanationSchema, type InterviewMode } from "@repo/core/interview";
import { PROCTORING_DISCLAIMER, summarizeProctoring, type ProctoringEventLike } from "@repo/core/proctoring";
import { VERDICT_LABELS, type Verdict } from "@repo/core/judge";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { difficultyTone } from "@/components/interview/question-panel";
import { EvaluationPoller, RetryEvaluationButton, ReviewControls } from "@/components/report/report-actions";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppError, getReport } from "@/lib/server/engine";

export const metadata: Metadata = { title: "Interview report" };
export const dynamic = "force-dynamic";

const fmtDuration = (ms: number | null) => {
  if (ms === null) return "ongoing";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};
const severityTone: Record<string, BadgeTone> = { INFO: "neutral", LOW: "info", MEDIUM: "warning", HIGH: "danger" };
const EVENT_LABELS: Record<string, string> = {
  PROCTORING_STARTED: "Proctoring started",
  PROCTORING_STOPPED: "Proctoring stopped",
  TAB_HIDDEN: "Tab hidden",
  TAB_RETURNED: "Returned to tab",
  WINDOW_BLUR: "Window lost focus",
  FACE_NOT_DETECTED: "No face detected",
  MULTIPLE_FACES_DETECTED: "Multiple faces detected",
  CAMERA_PERMISSION_DENIED: "Camera permission denied",
  CAMERA_INTERRUPTED: "Camera interrupted",
  NETWORK_INTERRUPTED: "Network interrupted",
};

function ScoreTile({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-bold">
        {value ?? "—"}
        {value !== null && <span className="text-base font-medium text-muted-foreground">/100</span>}
      </div>
    </div>
  );
}

export default async function ReportPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=/interview/${roomId}/report`);
  let data;
  try {
    data = await getReport(roomId, { userId: session.user.id, name: session.user.name });
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
  const { room, report, questions, submissions, proctoringEvents, access } = data;
  if (room.status !== "COMPLETED") redirect(`/interview/${roomId}`);

  const status = report?.status ?? room.evaluationStatus;
  const pending = status === "PENDING" || status === "RUNNING" || status === "NOT_STARTED";
  const results = ((report?.dimensionScores ?? []) as unknown as QuestionResult[]) ?? [];
  const integrity = summarizeProctoring(proctoringEvents as unknown as ProctoringEventLike[], room.proctoringEnabled);
  const startMs = room.startedAt?.getTime() ?? room.createdAt.getTime();
  const legacy = questions.length === 0;

  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Interview report</h1>
            <p className="text-sm text-muted-foreground">
              {MODE_INFO[room.mode as InterviewMode].label} · {room.difficulty.toLowerCase()} · {room.durationMinutes} min ·{" "}
              {room.completedAt?.toLocaleString() ?? room.createdAt.toLocaleString()}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>

        <Alert tone="info">{AUTOMATED_FEEDBACK_NOTICE}</Alert>
        <EvaluationPoller active={pending} />
        {status === "FAILED" && (
          <Alert tone="warning" className="space-y-2">
            <p>{report?.error ?? "The AI evaluation did not finish."}</p>
            {access.isCandidate && <RetryEvaluationButton roomId={roomId} />}
          </Alert>
        )}

        {!pending && report && (
          <section aria-labelledby="scores" className="space-y-4">
            <h2 id="scores" className="sr-only">Scores</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <ScoreTile label="Overall" value={report.overallScore} />
              <ScoreTile label="Technical" value={report.techScore} />
              <ScoreTile label="Communication" value={report.commScore} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.aiFeedback.replace(AUTOMATED_FEEDBACK_NOTICE, "").trim() || "No summary available."}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-1 text-sm font-semibold">Strengths</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm">{report.strengths.length ? report.strengths.map((s) => <li key={s}>{s}</li>) : <li className="list-none text-muted-foreground">None recorded.</li>}</ul>
                  </div>
                  <div>
                    <h3 className="mb-1 text-sm font-semibold">Areas to improve</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm">{report.weaknesses.length ? report.weaknesses.map((s) => <li key={s}>{s}</li>) : <li className="list-none text-muted-foreground">None recorded.</li>}</ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {legacy && report && (
          <Card>
            <CardHeader>
              <CardTitle>Earlier interview</CardTitle>
              <CardDescription>This interview was recorded before structured questions existed.</CardDescription>
            </CardHeader>
          </Card>
        )}

        {questions.map((q) => {
          const result = results.find((r) => r.questionId === q.id);
          const subs = submissions.filter((s) => s.questionId === q.id);
          const explanation = q.explanation ? codingExplanationSchema.safeParse(q.explanation) : null;
          return (
            <Card key={q.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={difficultyTone[q.difficulty]}>{q.difficulty.toLowerCase()}</Badge>
                  <Badge>{q.kind.toLowerCase()}</Badge>
                  {q.status === "SKIPPED" && <Badge tone="warning">skipped</Badge>}
                  {result?.score !== undefined && result.score !== null && <span className="ml-auto text-lg font-bold">{result.score}/100</span>}
                </div>
                <CardTitle className="text-lg">
                  Q{q.position + 1}. {q.title === "Technical question" || q.title === "Behavioral question" || q.title === "About your experience" ? q.prompt : q.title}
                </CardTitle>
                <CardDescription>{q.selectionReason}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {q.kind === "CODING" && (
                  <div className="text-sm">
                    <h3 className="mb-1 font-semibold">Code judge</h3>
                    {subs.length === 0 ? (
                      <p className="text-muted-foreground">No solution was submitted for hidden-test evaluation.</p>
                    ) : (
                      <ul className="space-y-1">
                        {subs.map((s) => (
                          <li key={s.id} className="flex flex-wrap gap-2">
                            <Badge tone={s.verdict === "ACCEPTED" ? "success" : "danger"}>{s.verdict ? VERDICT_LABELS[s.verdict as Verdict] : s.status.toLowerCase()}</Badge>
                            <span>{s.passedCount ?? 0}/{s.totalCount ?? 0} tests · {s.language} · {s.createdAt.toLocaleTimeString()}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {result && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">Rubric scores for question {q.position + 1}</caption>
                      <thead className="text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="py-1 pr-3">Dimension</th>
                          <th className="py-1 pr-3">Score</th>
                          <th className="py-1">Rationale and evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.dimensions.map((d) => (
                          <tr key={d.key} className="border-t align-top">
                            <td className="py-2 pr-3 font-medium">
                              {d.label}
                              <div className="mt-0.5"><Badge tone={d.source === "judge" ? "success" : "info"}>{d.source === "judge" ? "from judge" : "AI-assessed"}</Badge></div>
                            </td>
                            <td className="py-2 pr-3 whitespace-nowrap">{d.score === null ? "n/a" : `${d.score}/10`}</td>
                            <td className="py-2">
                              <p>{d.rationale}</p>
                              {d.evidence.length > 0 && (
                                <ul className="mt-1 space-y-1">
                                  {d.evidence.map((e) => (
                                    <li key={e} className="border-l-2 border-indigo-300 pl-2 text-xs italic text-muted-foreground">&ldquo;{e}&rdquo;</li>
                                  ))}
                                </ul>
                              )}
                              {d.removedEvidence > 0 && <p className="mt-1 text-xs text-muted-foreground">{d.removedEvidence} quote(s) removed because they did not match your words.</p>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {result && (result.strengths.length > 0 || result.improvements.length > 0) && (
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    {result.strengths.length > 0 && <div><h4 className="font-semibold">What went well</h4><ul className="list-disc pl-5">{result.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>}
                    {result.improvements.length > 0 && <div><h4 className="font-semibold">What to work on</h4><ul className="list-disc pl-5">{result.improvements.map((s) => <li key={s}>{s}</li>)}</ul></div>}
                  </div>
                )}
                {(q.answer || explanation?.success) && (
                  <details className="rounded-lg border p-3 text-sm">
                    <summary className="cursor-pointer font-medium">Your answer</summary>
                    {q.answer && <p className="mt-2 whitespace-pre-wrap">{q.answer}</p>}
                    {explanation?.success && (
                      <dl className="mt-2 space-y-1">
                        <dt className="font-medium">Approach</dt><dd className="whitespace-pre-wrap">{explanation.data.approach || "—"}</dd>
                        <dt className="font-medium">Complexity</dt><dd>time {explanation.data.timeComplexity || "—"}, space {explanation.data.spaceComplexity || "—"}</dd>
                        <dt className="font-medium">Edge cases</dt><dd className="whitespace-pre-wrap">{explanation.data.edgeCases || "—"}</dd>
                      </dl>
                    )}
                  </details>
                )}
              </CardContent>
            </Card>
          );
        })}

        <Card>
          <CardHeader>
            <CardTitle>Integrity signals</CardTitle>
            <CardDescription>{PROCTORING_DISCLAIMER}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-muted-foreground">Tab switches</dt><dd className="text-lg font-semibold">{integrity.tabSwitches}</dd></div>
              <div><dt className="text-muted-foreground">Time tab hidden</dt><dd className="text-lg font-semibold">{fmtDuration(integrity.totalHiddenMs)}</dd></div>
              <div><dt className="text-muted-foreground">Face not detected</dt><dd className="text-lg font-semibold">{room.proctoringEnabled ? `${integrity.faceAbsences} (${fmtDuration(integrity.faceAbsenceMs)})` : "n/a"}</dd></div>
              <div><dt className="text-muted-foreground">Camera interruptions</dt><dd className="text-lg font-semibold">{room.proctoringEnabled ? integrity.cameraInterruptions : "n/a"}</dd></div>
            </dl>
            <p className="text-sm">{integrity.narrative}</p>
            {proctoringEvents.length > 0 && (
              <ol className="space-y-1 text-sm" aria-label="Timeline of integrity signals">
                {proctoringEvents
                  .filter((e) => e.type !== "TAB_RETURNED")
                  .map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2 border-t py-1.5">
                      <span className="w-16 font-mono text-xs text-muted-foreground">+{fmtDuration(e.startedAt.getTime() - startMs)}</span>
                      <Badge tone={severityTone[e.severity]}>{e.severity.toLowerCase()}</Badge>
                      <span>{EVENT_LABELS[e.type] ?? e.type}</span>
                      {e.durationMs !== null && <span className="text-muted-foreground">for {fmtDuration(e.durationMs)}</span>}
                      {(e.metadata as { recoveredAfterReload?: boolean } | null)?.recoveredAfterReload && <span className="text-xs text-muted-foreground">(closed after a page reload)</span>}
                      {access.role === "INTERVIEWER" ? (
                        <span className="ml-auto"><ReviewControls roomId={roomId} eventId={e.id} status={e.reviewStatus} /></span>
                      ) : (
                        e.reviewStatus !== "UNREVIEWED" && <span className="ml-auto text-xs text-muted-foreground">{e.reviewStatus.toLowerCase()}</span>
                      )}
                    </li>
                  ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {report?.rubricVersion && (
          <p className="text-xs text-muted-foreground">
            Rubric {report.rubricVersion} · model {report.model ?? "n/a"} · attempt {report.attempts}
          </p>
        )}

        <div className="flex justify-center border-t pt-6 pb-8">
          <Button size="lg" asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </main>
    </>
  );
}
