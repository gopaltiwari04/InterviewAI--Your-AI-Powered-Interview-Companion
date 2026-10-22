"use client";

import type { ClientSubmission } from "@repo/core/interview";
import { VERDICT_LABELS } from "@repo/core/judge";
import { CheckCircle2, Clock, Loader2, Lock, XCircle } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";

const verdictTone = (v: string | null): BadgeTone => (v === "ACCEPTED" ? "success" : v === "COMPILATION_ERROR" || v === "INTERNAL_ERROR" ? "warning" : v ? "danger" : "neutral");

export function ResultsPanel({ submission }: { submission: ClientSubmission | null }) {
  if (!submission) {
    return <p className="p-4 text-sm text-muted-foreground">Run your code against the examples, or submit it for evaluation against the hidden tests.</p>;
  }
  const pending = submission.status === "QUEUED" || submission.status === "RUNNING";
  const label = submission.kind === "SUBMIT" ? "Submission" : submission.kind === "CUSTOM" ? "Custom run" : "Sample run";
  return (
    <div className="space-y-3 p-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{label}</span>
        {pending ? (
          <Badge tone="neutral">
            <Loader2 className="size-3 animate-spin" aria-hidden /> {submission.status === "QUEUED" ? "Queued" : "Running"}
          </Badge>
        ) : (
          <Badge tone={verdictTone(submission.verdict)}>{submission.verdict ? VERDICT_LABELS[submission.verdict] : "Failed"}</Badge>
        )}
        {!pending && submission.kind !== "CUSTOM" && submission.totalCount !== null && (
          <span className="text-muted-foreground">
            {submission.passedCount ?? 0}/{submission.totalCount} tests passed
          </span>
        )}
      </div>
      {submission.error && <p className="text-sm text-rose-600">{submission.error}</p>}
      {submission.compileOutput && (
        <details open={submission.verdict === "COMPILATION_ERROR"}>
          <summary className="cursor-pointer text-sm font-medium">{submission.verdict === "COMPILATION_ERROR" ? "Compiler output" : "Compiler warnings"}</summary>
          <pre className="mt-1 max-h-60 overflow-auto rounded bg-zinc-950 p-3 font-mono text-xs text-zinc-100">{submission.compileOutput}</pre>
        </details>
      )}
      <ul className="space-y-2">
        {submission.tests.map((t, i) => {
          const ok = t.verdict === "ACCEPTED" || t.verdict === "EXECUTED";
          return (
            <li key={t.id} className="rounded-lg border">
              <div className="flex items-center gap-2 px-3 py-2 text-sm">
                {ok ? <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> : t.verdict === "SKIPPED" ? <Clock className="size-4 text-muted-foreground" aria-hidden /> : <XCircle className="size-4 text-rose-600" aria-hidden />}
                <span>{t.visible ? (submission.kind === "CUSTOM" ? "Custom input" : `Example ${i + 1}`) : `Hidden test ${i + 1}`}</span>
                {!t.visible && <Lock className="size-3 text-muted-foreground" aria-label="hidden test" />}
                <span className="ml-auto text-xs text-muted-foreground">
                  {VERDICT_LABELS[t.verdict]}
                  {t.timeMs > 0 ? ` · ${t.timeMs} ms` : ""}
                </span>
              </div>
              {t.visible && (t.stdout !== undefined || t.stderr) && (
                <div className="grid gap-2 border-t p-3 font-mono text-xs sm:grid-cols-2">
                  {t.input !== undefined && (
                    <div className="sm:col-span-2">
                      <div className="mb-0.5 font-sans font-medium">Input</div>
                      <pre className="max-h-24 overflow-auto rounded bg-muted p-2">{t.input}</pre>
                    </div>
                  )}
                  {t.expected !== undefined && (
                    <div>
                      <div className="mb-0.5 font-sans font-medium">Expected</div>
                      <pre className="max-h-32 overflow-auto rounded bg-muted p-2">{t.expected}</pre>
                    </div>
                  )}
                  <div className={t.expected === undefined ? "sm:col-span-2" : undefined}>
                    <div className="mb-0.5 font-sans font-medium">Your output</div>
                    <pre className="max-h-32 overflow-auto rounded bg-muted p-2">{t.stdout || "(no output)"}</pre>
                  </div>
                  {t.stderr && (
                    <div className="sm:col-span-2">
                      <div className="mb-0.5 font-sans font-medium">Error output</div>
                      <pre className="max-h-40 overflow-auto rounded bg-rose-50 p-2 text-rose-900 dark:bg-rose-950 dark:text-rose-100">{t.stderr}</pre>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {submission.kind === "SUBMIT" && !pending && <p className="text-xs text-muted-foreground">Hidden test inputs and outputs are never shown, so the evaluation stays fair.</p>}
    </div>
  );
}
