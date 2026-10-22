"use client";

import type { ClientChatMessage, ClientInterview, ClientQuestion, ClientSubmission } from "@repo/core/interview";
import type { InterviewBroadcast } from "@repo/core/realtime";
import type { Language } from "@repo/core/problems";
import { Clock, SkipForward, Users, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraPreview, CameraStatusBadge } from "@/components/proctoring/camera-status";
import { useFaceMonitor } from "@/components/proctoring/use-face-monitor";
import { useTabMonitor } from "@/components/proctoring/use-tab-monitor";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, errorText } from "@/lib/client/api";
import { ProctoringQueue } from "@/lib/client/proctoring-queue";
import { useInterviewSocket, type CodeSync } from "@/lib/client/use-interview-socket";
import { cn } from "@/lib/utils";
import { AnswerForm, ExplanationForm } from "./answer-forms";
import { ChatPanel } from "./chat-panel";
import { CodePanel } from "./code-panel";
import { Lobby } from "./lobby";
import { QuestionPanel } from "./question-panel";

interface Initial {
  interview: ClientInterview;
  chat: ClientChatMessage[];
  submissions: ClientSubmission[];
}

const isPending = (s: ClientSubmission) => s.status === "QUEUED" || s.status === "RUNNING";

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function InterviewRoom({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [interview, setInterview] = useState(initial.interview);
  const [chat, setChat] = useState(initial.chat);
  const [submissions, setSubmissions] = useState(initial.submissions);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"start" | "advance" | "finish" | null>(null);
  const [tab, setTab] = useState<"problem" | "chat">("problem");
  const [remoteCode, setRemoteCode] = useState<CodeSync | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Set after hydration so tests (and slow devices) know event listeners are attached.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const versionRef = useRef(initial.interview.version);
  const followUpsAsked = useRef(new Set<string>());
  const codeRef = useRef<{ code: string; language: Language } | null>(null);
  const seqRef = useRef(0);
  const roomId = interview.id;

  const inProgress = interview.status === "IN_PROGRESS";
  const isCandidate = interview.isCandidate;

  // ---- authoritative state from the API (used on load, reconnect and as a polling fallback) ----
  const refresh = useCallback(async () => {
    try {
      const data = await api<Initial>(`/api/interviews/${roomId}`);
      if (data.interview.version >= versionRef.current) {
        versionRef.current = data.interview.version;
        setInterview(data.interview);
      }
      setChat(data.chat);
      setSubmissions(data.submissions);
    } catch {
      // Keep the current state; the next poll or reconnect will try again.
    }
  }, [roomId]);

  const refreshSubmission = useCallback(
    async (id: string) => {
      try {
        const sub = await api<ClientSubmission>(`/api/interviews/${roomId}/submissions/${id}`);
        setSubmissions((list) => [sub, ...list.filter((s) => s.id !== sub.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      } catch {
        // ignore; polling retries
      }
    },
    [roomId],
  );

  const socket = useInterviewSocket(roomId, interview.status !== "COMPLETED" && interview.status !== "CANCELLED", {
    onInterviewEvent: (event: InterviewBroadcast) => {
      // Events can arrive late or twice; only newer versions trigger a refetch.
      if (event.type === "submission") void refreshSubmission(event.submissionId);
      else if (event.version > versionRef.current || event.type === "evaluation") void refresh();
    },
    onSubmissionUpdate: (id) => void refreshSubmission(id),
    onCodeSync: (sync) => setRemoteCode((prev) => (prev && prev.questionId === sync.questionId && prev.seq >= sync.seq ? prev : sync)),
    onReconnect: () => void refresh(),
  });

  // Poll pending submissions (covers a missing or disconnected socket).
  const pendingIds = submissions.filter(isPending).map((s) => s.id).join(",");
  useEffect(() => {
    if (!pendingIds) return;
    const t = setInterval(() => pendingIds.split(",").forEach((id) => void refreshSubmission(id)), 1500);
    return () => clearInterval(t);
  }, [pendingIds, refreshSubmission]);

  // Background refresh; faster when the socket is down. Also on tab focus.
  useEffect(() => {
    if (interview.status === "COMPLETED" || interview.status === "CANCELLED") return;
    const t = setInterval(() => void refresh(), socket.state === "connected" ? 30_000 : 8_000);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, socket.state, interview.status]);

  // ---- proctoring ----
  const queue = useMemo(() => (typeof window === "undefined" || !isCandidate ? null : new ProctoringQueue(roomId)), [roomId, isCandidate]);
  useEffect(() => {
    if (!queue || !inProgress) return;
    queue.start();
    return () => {
      void queue.flush();
      queue.stop();
    };
  }, [queue, inProgress]);
  const tabStats = useTabMonitor(roomId, queue, inProgress && isCandidate);
  const camera = useFaceMonitor(queue, inProgress && interview.proctoringEnabled && isCandidate);

  // Finished: release the camera, flush events and show the report.
  useEffect(() => {
    if (interview.status === "COMPLETED") {
      camera.stop();
      void queue?.flush();
      router.push(`/interview/${roomId}/report`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview.status]);

  // ---- timer (server time corrected for clock skew) ----
  useEffect(() => {
    if (!inProgress) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [inProgress]);
  const serverSkew = useMemo(() => new Date(interview.serverTime).getTime() - Date.now(), [interview.serverTime]);
  const offset = socket.state === "connected" ? socket.clockOffsetMs : serverSkew;
  const remainingMs = interview.endsAt ? new Date(interview.endsAt).getTime() - (now + offset) : null;
  const timeUp = remainingMs !== null && remainingMs <= 0;

  const current = interview.questions.find((q) => q.id === interview.currentQuestionId) ?? null;
  const latestForQuestion = current ? (submissions.find((s) => s.questionId === current.id) ?? null) : null;

  // ---- follow-up questions after a finished hidden-test submission ----
  useEffect(() => {
    if (!isCandidate || !current) return;
    const done = submissions.find((s) => s.questionId === current.id && s.kind === "SUBMIT" && s.status === "COMPLETED");
    if (!done || followUpsAsked.current.has(done.id)) return;
    followUpsAsked.current.add(done.id);
    api<{ message: ClientChatMessage | null }>(`/api/interviews/${roomId}/follow-up`, { body: { questionId: current.id, trigger: "submission", submissionId: done.id } })
      .then((r) => {
        const message = r.message;
        if (!message) return;
        setChat((c) => {
          if (c.some((m) => m.id === message.id)) return c;
          // Only jump to the chat for a follow-up the candidate has not seen yet.
          setTab("chat");
          return [...c, message];
        });
      })
      .catch(() => undefined);
  }, [submissions, current, isCandidate, roomId]);

  const askAnswerFollowUp = (q: ClientQuestion) => {
    api<{ message: ClientChatMessage | null }>(`/api/interviews/${roomId}/follow-up`, { body: { questionId: q.id, trigger: "answer" } })
      .then((r) => {
        const message = r.message;
        if (!message) return;
        setChat((c) => {
          if (c.some((m) => m.id === message.id)) return c;
          // Only jump to the chat for a follow-up the candidate has not seen yet.
          setTab("chat");
          return [...c, message];
        });
      })
      .catch(() => undefined);
  };

  const applyState = (state: ClientInterview) => {
    if (state.version >= versionRef.current) {
      versionRef.current = state.version;
      setInterview(state);
    }
  };

  // ---- actions ----
  async function start(proctoring: boolean) {
    setBusy("start");
    setActionError(null);
    try {
      const state = await api<ClientInterview>(`/api/interviews/${roomId}/start`, { body: { proctoring } });
      applyState(state);
      await refresh();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel this interview? It has not started, so nothing will be recorded.")) return;
    try {
      await api(`/api/interviews/${roomId}/cancel`, { body: {} });
      router.push("/dashboard");
    } catch (err) {
      setActionError(errorText(err));
    }
  }

  async function advance(skip: boolean) {
    if (!current) return;
    const last = current.position + 1 >= interview.questionCount;
    const prompt = skip ? "Skip this question? It will count as unanswered." : last ? "Finish the interview and generate your report?" : "Move on to the next question? You cannot come back to this one.";
    if (!window.confirm(prompt)) return;
    setBusy("advance");
    setActionError(null);
    try {
      applyState(await api<ClientInterview>(`/api/interviews/${roomId}/advance`, { body: { expectedQuestionId: current.id, skip } }));
      setTab("problem");
      await refresh();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  const finish = useCallback(
    async (confirmFirst: boolean) => {
      if (confirmFirst && !window.confirm("Finish the interview now and generate your report?")) return;
      setBusy("finish");
      try {
        applyState(await api<ClientInterview>(`/api/interviews/${roomId}/complete`, { body: {} }));
      } catch (err) {
        setActionError(errorText(err));
      } finally {
        setBusy(null);
      }
    },
    [roomId],
  );

  // When the timer runs out, finish automatically (the server enforces the deadline too).
  const finishedOnTimeout = useRef(false);
  useEffect(() => {
    if (timeUp && inProgress && isCandidate && !finishedOnTimeout.current) {
      finishedOnTimeout.current = true;
      void finish(false);
    }
  }, [timeUp, inProgress, isCandidate, finish]);

  const onCodeChange = (code: string, language: Language) => {
    codeRef.current = { code, language };
    if (current) socket.sendCode({ questionId: current.id, code, language, seq: ++seqRef.current });
  };

  // ---- render ----
  if (interview.status === "CANCELLED") {
    return (
      <main id="main" className="mx-auto max-w-xl p-8 text-center">
        <p>This interview was cancelled.</p>
        <Button asChild className="mt-4"><Link href="/dashboard">Back to dashboard</Link></Button>
      </main>
    );
  }
  if (interview.status === "CREATED") {
    if (!isCandidate) return <main id="main" className="p-8 text-center text-sm">Waiting for the candidate to start the interview…</main>;
    return <Lobby interview={interview} camera={camera} starting={busy === "start"} error={actionError} onStart={start} onCancel={cancel} />;
  }
  if (interview.status === "COMPLETED") return <main id="main" className="p-8 text-center text-sm">Interview complete. Opening your report…</main>;
  if (interview.legacy) {
    return (
      <main id="main" className="mx-auto max-w-xl space-y-4 p-8">
        <Alert tone="info">This interview was created with an earlier version of InterviewAI and has no structured questions.</Alert>
        {isCandidate && <Button onClick={() => void finish(true)}>Finish this interview</Button>}
      </main>
    );
  }

  const others = socket.presence.filter((p) => p.role !== "CANDIDATE");
  return (
    <div className="flex min-h-screen lg:h-screen lg:max-h-screen flex-col lg:overflow-hidden" data-ready={hydrated ? "true" : "false"}>
      <header className="sticky top-0 z-10 shrink-0 border-b bg-background/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <Link href="/dashboard" className="font-bold text-indigo-600">InterviewAI</Link>
          {current && (
            <span className="text-sm text-muted-foreground" aria-label={`Question ${current.position + 1} of ${interview.questionCount}`}>
              Question {current.position + 1}/{interview.questionCount}
            </span>
          )}
          <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
            <div className="h-full bg-indigo-600 transition-all" style={{ width: `${((current?.position ?? 0) / interview.questionCount) * 100}%` }} />
          </div>
          <span
            className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-sm", remainingMs !== null && remainingMs < 5 * 60_000 ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200" : "bg-muted")}
            role="timer"
            aria-label="Time remaining"
          >
            <Clock className="size-3.5" aria-hidden />
            {remainingMs === null ? "--:--" : formatRemaining(remainingMs)}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={`Real-time connection: ${socket.state}`}>
            {socket.state === "connected" ? <Wifi className="size-3.5 text-emerald-600" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
            <span className="sr-only sm:not-sr-only">{socket.state === "connected" ? "Live" : socket.state === "disabled" ? "Polling" : "Reconnecting…"}</span>
          </span>
          {others.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="size-3.5" aria-hidden /> {others.map((o) => o.name).join(", ")} watching
            </span>
          )}
          {isCandidate && interview.proctoringEnabled && <CameraStatusBadge camera={camera.camera} face={camera.face} />}
          {isCandidate && tabStats.switches > 0 && (
            <Badge tone="warning" title="Times this tab was hidden during the interview">
              Tab hidden {tabStats.switches}×
            </Badge>
          )}
          {isCandidate && current && (
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => void advance(true)} disabled={Boolean(busy)}>
                <SkipForward aria-hidden /> Skip
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void advance(false)} disabled={Boolean(busy)}>
                {current.position + 1 >= interview.questionCount ? "Finish interview" : "Next question"}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => void finish(true)} disabled={Boolean(busy)}>
                End
              </Button>
            </div>
          )}
        </div>
        {socket.state === "reconnecting" && (
          <div className="bg-amber-100 px-4 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100" role="status">
            Connection lost. Reconnecting… your work is saved and nothing is lost.
          </div>
        )}
        {actionError && <Alert tone="danger" className="m-2">{actionError}</Alert>}
        {interview.proctoringEnabled && isCandidate && camera.camera !== "active" && (
          <div className="flex flex-wrap items-center gap-2 bg-amber-50 px-4 py-1.5 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-100" role="status">
            The camera is off, so face presence is not being checked.
            {camera.camera !== "denied" && camera.camera !== "requesting" && (
              <Button size="xs" variant="outline" onClick={() => void camera.start()}>Turn camera on</Button>
            )}
          </div>
        )}
      </header>

      <main id="main" className="grid flex-1 min-h-0 gap-4 p-4 lg:grid-cols-[minmax(320px,2fr)_3fr] overflow-y-auto lg:overflow-hidden">
        {current ? (
          <>
            <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
              <div role="tablist" aria-label="Question panels" className="flex shrink-0 border-b">
                {(["problem", "chat"] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={cn("flex-1 px-4 py-2 text-sm font-medium", tab === t ? "border-b-2 border-indigo-600 text-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    {t === "problem" ? (current.kind === "CODING" ? "Problem" : "Question") : "AI interviewer"}
                  </button>
                ))}
              </div>
              {tab === "problem" ? (
                <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-6" role="tabpanel">
                  <QuestionPanel question={current} />
                  {current.kind === "CODING" && isCandidate && (
                    <section className="border-t pt-4">
                      <h3 className="mb-2 text-sm font-semibold">Explain your solution</h3>
                      <ExplanationForm
                        key={current.id}
                        roomId={roomId}
                        question={current}
                        onSaved={(s) => {
                          applyState(s);
                          askAnswerFollowUp(current);
                        }}
                      />
                    </section>
                  )}
                </div>
              ) : (
                <div className="min-h-0 flex-1 flex flex-col overflow-hidden" role="tabpanel">
                  <ChatPanel
                    roomId={roomId}
                    questionId={current.id}
                    messages={chat}
                    canSend={isCandidate}
                    getCodeSnapshot={() => codeRef.current?.code ?? null}
                    onMessages={(m) => setChat((c) => [...c, ...m.filter((x) => !c.some((y) => y.id === x.id))])}
                  />
                </div>
              )}
              {isCandidate && interview.proctoringEnabled && camera.camera === "active" && (
                <div className="shrink-0 border-t p-2">
                  <CameraPreview videoRef={camera.videoRef} className="max-h-24 w-auto mx-auto" />
                </div>
              )}
            </section>
            {current.kind === "CODING" ? (
              <CodePanel
                key={current.id}
                roomId={roomId}
                question={current}
                defaultLanguage={interview.language}
                latest={latestForQuestion}
                readOnly={!isCandidate}
                remoteCode={remoteCode && remoteCode.questionId === current.id ? remoteCode : null}
                onSubmission={(s) => setSubmissions((list) => [s, ...list.filter((x) => x.id !== s.id)])}
                onCodeChange={onCodeChange}
              />
            ) : isCandidate ? (
              <AnswerForm
                key={current.id}
                roomId={roomId}
                question={current}
                onSaved={(s) => {
                  applyState(s);
                  const updated = s.questions.find((q) => q.id === current.id);
                  if (updated) askAnswerFollowUp(updated);
                }}
              />
            ) : (
              <div className="rounded-xl border bg-card p-4 text-sm whitespace-pre-wrap">{current.answer ?? "The candidate has not submitted an answer yet."}</div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading the next question…</p>
        )}
      </main>
    </div>
  );
}
