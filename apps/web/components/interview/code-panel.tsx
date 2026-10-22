"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import type { ClientQuestion, ClientSubmission } from "@repo/core/interview";
import { LANGUAGES, LANGUAGE_INFO, type Language } from "@repo/core/problems";
import { Play, Send, TerminalSquare } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { ApiError, api, errorText } from "@/lib/client/api";
import { ResultsPanel } from "./results-panel";

interface Props {
  roomId: string;
  question: ClientQuestion;
  defaultLanguage: Language;
  latest: ClientSubmission | null;
  readOnly: boolean;
  /** Live code from the candidate, for an interviewer watching the session. */
  remoteCode?: { code: string; language: string } | null;
  onSubmission: (submission: ClientSubmission) => void;
  onCodeChange?: (code: string, language: Language) => void;
}

export function CodePanel({ roomId, question, defaultLanguage, latest, readOnly, remoteCode, onSubmission, onCodeChange }: Props) {
  const problem = question.problem!;
  const [language, setLanguage] = useState<Language>(question.draftLanguage ?? defaultLanguage);
  const [code, setCode] = useState<string>(question.draftCode ?? problem.starterCode[question.draftLanguage ?? defaultLanguage]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState(problem.examples[0]?.stdin ?? "");
  const [busy, setBusy] = useState<"RUN" | "SUBMIT" | "CUSTOM" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeRef = useRef(code);
  const langRef = useRef(language);
  const resultsRef = useRef<HTMLDivElement>(null);
  const pendingSubmissionRef = useRef(false);
  codeRef.current = code;
  langRef.current = language;

  const shownCode = readOnly && remoteCode ? remoteCode.code : code;
  const shownLanguage = (readOnly && remoteCode ? remoteCode.language : language) as Language;

  const scrollToResults = useCallback(() => {
    if (!resultsRef.current) return;
    resultsRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    if (typeof window !== "undefined") {
      const rect = resultsRef.current.getBoundingClientRect();
      if (rect.bottom > window.innerHeight) {
        window.scrollBy({ top: rect.bottom - window.innerHeight + 24, behavior: "smooth" });
      }
    }
  }, []);

  useEffect(() => {
    if (!latest) return;
    if (pendingSubmissionRef.current || latest.status === "QUEUED" || latest.status === "RUNNING") {
      scrollToResults();
      if (latest.status === "COMPLETED" || latest.status === "FAILED") {
        pendingSubmissionRef.current = false;
        setTimeout(scrollToResults, 120);
      }
    }
  }, [latest, scrollToResults]);

  const saveDraft = useCallback(async () => {
    if (readOnly) return;
    setSaveState("saving");
    try {
      await api(`/api/interviews/${roomId}/questions/${question.id}/draft`, { method: "PUT", body: { code: codeRef.current, language: langRef.current } });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [roomId, question.id, readOnly]);

  const scheduleSave = useCallback(() => {
    setSaveState("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveDraft(), 1500);
  }, [saveDraft]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  function changeCode(value: string | undefined) {
    if (readOnly || value === undefined) return;
    setCode(value);
    onCodeChange?.(value, language);
    scheduleSave();
  }

  function changeLanguage(next: Language) {
    const untouched = code.trim() === problem.starterCode[language].trim();
    if (!untouched && !window.confirm(`Switch to ${LANGUAGE_INFO[next].label}? Your current code will be replaced with the ${LANGUAGE_INFO[next].label} starter code.`)) return;
    setLanguage(next);
    setCode(problem.starterCode[next]);
    langRef.current = next;
    codeRef.current = problem.starterCode[next];
    onCodeChange?.(problem.starterCode[next], next);
    scheduleSave();
  }

  const run = useCallback(
    async (kind: "RUN" | "SUBMIT" | "CUSTOM") => {
      if (readOnly || busy) return;
      setBusy(kind);
      setError(null);
      pendingSubmissionRef.current = true;
      setTimeout(scrollToResults, 50);

      // One key per click: if the network drops and the request is retried, the server
      // returns the original submission instead of judging the code twice.
      const idempotencyKey = crypto.randomUUID();
      const body = {
        questionId: question.id,
        kind,
        language: langRef.current,
        code: codeRef.current,
        customInput: kind === "CUSTOM" ? customInput : undefined,
        idempotencyKey,
      };
      try {
        let submission: ClientSubmission;
        try {
          submission = await api<ClientSubmission>(`/api/interviews/${roomId}/submissions`, { body });
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 0) throw err;
          submission = await api<ClientSubmission>(`/api/interviews/${roomId}/submissions`, { body });
        }
        onSubmission(submission);
        setSaveState("saved");
        setTimeout(scrollToResults, 50);
      } catch (err) {
        setError(errorText(err));
        pendingSubmissionRef.current = false;
      } finally {
        setBusy(null);
      }
    },
    [busy, customInput, onSubmission, question.id, readOnly, roomId, scrollToResults],
  );

  const runRef = useRef(run);
  runRef.current = run;
  const onMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => void runRef.current("RUN"));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => void runRef.current("SUBMIT"));
  };

  const pending = latest && (latest.status === "QUEUED" || latest.status === "RUNNING");

  return (
    <section aria-label="Code editor" className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <label htmlFor="editor-language" className="sr-only">Language</label>
        <select
          id="editor-language"
          value={shownLanguage}
          disabled={readOnly}
          onChange={(e) => changeLanguage(e.target.value as Language)}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_INFO[l].label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">{LANGUAGE_INFO[shownLanguage].fileName}</span>
        {!readOnly && (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved changes" : saveState === "error" ? "Draft not saved" : "Draft saved"}
          </span>
        )}
        {readOnly && <span className="text-xs text-muted-foreground">Read-only: watching the candidate&apos;s editor</span>}
        {!readOnly && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setCustomOpen((v) => !v)} aria-expanded={customOpen}>
              <TerminalSquare aria-hidden /> Custom input
            </Button>
            <Button variant="outline" size="sm" onClick={() => void run("RUN")} disabled={Boolean(busy) || Boolean(pending)} title="Ctrl/Cmd + Enter">
              <Play aria-hidden /> {busy === "RUN" ? "Running…" : "Run examples"}
            </Button>
            <Button size="sm" onClick={() => void run("SUBMIT")} disabled={Boolean(busy) || Boolean(pending)} title="Ctrl/Cmd + Shift + Enter">
              <Send aria-hidden /> {busy === "SUBMIT" ? "Submitting…" : "Submit"}
            </Button>
          </div>
        )}
      </div>

      <div className="min-h-[220px] min-h-0 flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={LANGUAGE_INFO[shownLanguage].monaco}
          theme="vs-dark"
          value={shownCode}
          onChange={changeCode}
          onMount={onMount}
          loading={<div className="p-4 text-sm text-muted-foreground">Loading editor…</div>}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 14,
            tabSize: 4,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 12 },
            accessibilitySupport: "auto",
          }}
        />
      </div>

      {customOpen && !readOnly && (
        <div className="shrink-0 space-y-2 border-t p-3">
          <label htmlFor="custom-input" className="text-sm font-medium">Custom input (same line format as the examples)</label>
          <Textarea id="custom-input" className="min-h-20 font-mono text-xs" value={customInput} onChange={(e) => setCustomInput(e.target.value)} />
          <Button size="sm" variant="secondary" onClick={() => void run("CUSTOM")} disabled={Boolean(busy) || Boolean(pending)}>
            {busy === "CUSTOM" ? "Running…" : "Run with custom input"}
          </Button>
        </div>
      )}

      {error && (
        <Alert tone="danger" className="m-3 shrink-0">
          {error}
        </Alert>
      )}
      <div ref={resultsRef} tabIndex={-1} className="max-h-[50%] min-h-[160px] shrink-0 overflow-y-auto border-t">
        <ResultsPanel submission={latest} />
      </div>
    </section>
  );
}
