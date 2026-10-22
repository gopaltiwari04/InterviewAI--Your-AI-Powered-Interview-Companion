"use client";

import { DURATIONS, MODE_INFO, TECHNICAL_TOPICS, TECHNICAL_TOPIC_LABELS, questionPlan, type InterviewMode } from "@repo/core/interview";
import { DIFFICULTIES, LANGUAGES, LANGUAGE_INFO, TOPICS, TOPIC_LABELS, type Difficulty, type Language, type Topic } from "@repo/core/problems";
import { Brain, Code2, Layers, MessagesSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api, errorText } from "@/lib/client/api";
import { cn } from "@/lib/utils";

const MODE_ICONS = { DSA: Code2, TECHNICAL: Brain, BEHAVIORAL: MessagesSquare, MIXED: Layers } as const;

interface Props {
  practiceProblem: { slug: string; title: string; difficulty: Difficulty; topics: Topic[] } | null;
  resumes: { id: string; fileName: string; skills: string[] }[];
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "border-indigo-600 bg-indigo-600 text-white" : "bg-background hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{title}</legend>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}

export function SetupForm({ practiceProblem, resumes }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<InterviewMode>("DSA");
  const [language, setLanguage] = useState<Language>("python");
  const [difficulty, setDifficulty] = useState<Difficulty>(practiceProblem?.difficulty ?? "MEDIUM");
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(45);
  const [topics, setTopics] = useState<Topic[]>(practiceProblem?.topics.slice(0, 1) ?? []);
  const [techTopics, setTechTopics] = useState<string[]>([]);
  const [adaptive, setAdaptive] = useState(true);
  const [useAi, setUseAi] = useState(false);
  const [proctoring, setProctoring] = useState(false);
  const [resumeId, setResumeId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCoding = mode === "DSA" || mode === "MIXED";
  const hasTechnical = mode === "TECHNICAL" || mode === "MIXED";
  const plan = questionPlan(mode, duration);

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ id: string }>("/api/interviews", {
        body: {
          mode,
          language,
          difficulty,
          durationMinutes: duration,
          topics: hasCoding ? topics : [],
          technicalTopics: hasTechnical ? techTopics : [],
          adaptive,
          useAiQuestions: hasCoding && useAi,
          proctoring,
          resumeProfileId: resumeId || null,
          problemSlug: hasCoding ? (practiceProblem?.slug ?? null) : null,
        },
      });
      router.push(`/interview/${res.id}`);
    } catch (err) {
      setError(errorText(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-8">
      {practiceProblem && (
        <Alert tone="info">
          Practice problem: <strong>{practiceProblem.title}</strong> will be your first coding question.
        </Alert>
      )}

      <Section title="Interview type">
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Interview type">
          {(Object.keys(MODE_INFO) as InterviewMode[]).map((m) => {
            const Icon = MODE_ICONS[m];
            const selected = m === mode;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(m)}
                className={cn(
                  "flex gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40" : "bg-background hover:bg-muted",
                )}
              >
                <Icon className={cn("mt-0.5 size-5 shrink-0", selected ? "text-indigo-600" : "text-muted-foreground")} aria-hidden />
                <span>
                  <span className="block font-semibold">{MODE_INFO[m].label}</span>
                  <span className="block text-sm text-muted-foreground">{MODE_INFO[m].description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <div className="grid gap-6 sm:grid-cols-2">
        <Section title="Starting difficulty" hint={adaptive ? "Adaptive mode adjusts later questions to your results." : undefined}>
          <div className="flex flex-wrap gap-2">
            {DIFFICULTIES.map((d) => (
              <Chip key={d} selected={d === difficulty} onClick={() => setDifficulty(d)}>
                {d.charAt(0) + d.slice(1).toLowerCase()}
              </Chip>
            ))}
          </div>
        </Section>
        <Section title="Duration" hint={`${plan.length} question${plan.length === 1 ? "" : "s"}: ${plan.map((k) => k.toLowerCase()).join(", ")}`}>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <Chip key={d} selected={d === duration} onClick={() => setDuration(d)}>
                {d} min
              </Chip>
            ))}
          </div>
        </Section>
      </div>

      {hasCoding && (
        <>
          <Section title="Programming language">
            <label htmlFor="language" className="sr-only">Programming language</label>
            <select id="language" value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="rounded-lg border bg-background px-3 py-2 text-sm">
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_INFO[l].label}
                </option>
              ))}
            </select>
          </Section>
          <Section title="DSA topics" hint="Leave empty for a mix of topics.">
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((t) => (
                <Chip key={t} selected={topics.includes(t)} onClick={() => setTopics(toggle(topics, t))}>
                  {TOPIC_LABELS[t]}
                </Chip>
              ))}
            </div>
          </Section>
        </>
      )}

      {hasTechnical && (
        <Section title="Technical topics" hint="Leave empty for a mix of topics.">
          <div className="flex flex-wrap gap-2">
            {TECHNICAL_TOPICS.map((t) => (
              <Chip key={t} selected={techTopics.includes(t)} onClick={() => setTechTopics(toggle(techTopics, t))}>
                {TECHNICAL_TOPIC_LABELS[t]}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      <Section title="Options">
        <div className="space-y-3 rounded-xl border bg-background p-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 size-4" checked={adaptive} onChange={(e) => setAdaptive(e.target.checked)} />
            <span>
              <span className="block text-sm font-medium">Adaptive difficulty</span>
              <span className="block text-xs text-muted-foreground">Transparent rules: pass every hidden test to move up, score below 50% to move down. The reason is shown with each question.</span>
            </span>
          </label>
          {hasCoding && (
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 size-4" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
              <span>
                <span className="block text-sm font-medium">Try AI-generated coding problems</span>
                <span className="block text-xs text-muted-foreground">A generated problem is only used if its reference solution passes its own tests in the sandbox; otherwise a verified bank problem is used.</span>
              </span>
            </label>
          )}
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 size-4" checked={proctoring} onChange={(e) => setProctoring(e.target.checked)} />
            <span>
              <span className="block text-sm font-medium">Camera proctoring (optional)</span>
              <span className="block text-xs text-muted-foreground">
                You will be asked for consent first. Face presence is checked in your browser; no video is uploaded or recorded. Tab switches are recorded for every interview.
              </span>
            </span>
          </label>
          {resumes.length > 0 && (mode === "TECHNICAL" || mode === "BEHAVIORAL" || mode === "MIXED") && (
            <div className="flex flex-col gap-1">
              <label htmlFor="resume" className="text-sm font-medium">Resume-based questions</label>
              <select id="resume" value={resumeId} onChange={(e) => setResumeId(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">
                <option value="">Do not use my resume</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fileName} {r.skills.length ? `(${r.skills.join(", ")})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Section>

      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? "Creating…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
