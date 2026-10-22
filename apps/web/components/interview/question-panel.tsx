"use client";

import type { ClientQuestion } from "@repo/core/interview";
import { TOPIC_LABELS, type Topic } from "@repo/core/problems";
import { Info } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { InlineText, RichText } from "./rich-text";

export const difficultyTone: Record<string, BadgeTone> = { EASY: "success", MEDIUM: "warning", HARD: "danger" };
const SOURCE_LABEL: Record<ClientQuestion["source"], string | null> = {
  BANK: null,
  AI_GENERATED: "AI-generated · sandbox-verified",
  RESUME: "From your resume",
  AI_FALLBACK_BANK: "Verified bank problem",
};

export function QuestionPanel({ question }: { question: ClientQuestion }) {
  const problem = question.problem;
  return (
    <article aria-labelledby="question-title" className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={difficultyTone[question.difficulty]}>{question.difficulty.toLowerCase()}</Badge>
          <Badge tone="neutral">{question.kind === "CODING" ? "Coding" : question.kind === "TECHNICAL" ? "Technical" : "Behavioral"}</Badge>
          {(problem?.topics ?? []).map((t) => (
            <Badge key={t} tone="info">
              {TOPIC_LABELS[t as Topic] ?? t}
            </Badge>
          ))}
          {SOURCE_LABEL[question.source] && <Badge tone="neutral">{SOURCE_LABEL[question.source]}</Badge>}
        </div>
        <h2 id="question-title" className="text-xl font-semibold">
          {problem?.title ?? question.title}
        </h2>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-medium">Why this question:</span> {question.selectionReason}
          </span>
        </p>
      </header>

      {problem ? (
        <>
          <RichText text={problem.statement} className="text-sm" />
          <section>
            <h3 className="mb-1 text-sm font-semibold">Input</h3>
            <p className="text-sm"><InlineText text={problem.inputDescription} /></p>
            <h3 className="mb-1 mt-3 text-sm font-semibold">Output</h3>
            <p className="text-sm"><InlineText text={problem.outputDescription} /></p>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Examples</h3>
            <div className="space-y-3">
              {problem.examples.map((ex, i) => (
                <div key={i} className="rounded-lg border bg-muted/40 p-3 font-mono text-xs">
                  <div>
                    <span className="font-sans font-semibold">Input: </span>
                    {ex.input}
                  </div>
                  <div>
                    <span className="font-sans font-semibold">Output: </span>
                    {ex.output}
                  </div>
                  {ex.explanation && (
                    <div className="mt-1 font-sans text-muted-foreground">
                      <InlineText text={ex.explanation} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3 className="mb-1 text-sm font-semibold">Constraints</h3>
            <ul className="list-disc space-y-0.5 pl-5 text-sm">
              {problem.constraints.map((c) => (
                <li key={c}>
                  <InlineText text={c} />
                </li>
              ))}
            </ul>
          </section>
          <details className="rounded-lg border p-3 text-sm">
            <summary className="cursor-pointer font-medium">How input is passed to your function</summary>
            <p className="mt-2 text-muted-foreground">
              Implement the function in the editor; the judge reads the input, calls your function and compares its return value. For custom runs, input uses this line format (one value per line; arrays are a length line followed by the values):
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 font-mono text-xs">{problem.examples[0]?.stdin}</pre>
          </details>
        </>
      ) : (
        <RichText text={question.prompt} className="text-base" />
      )}
    </article>
  );
}
