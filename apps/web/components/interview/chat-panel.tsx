"use client";

import type { ClientChatMessage } from "@repo/core/interview";
import { Bot, Loader2, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { api, errorText } from "@/lib/client/api";
import { cn } from "@/lib/utils";

interface Props {
  roomId: string;
  questionId: string;
  messages: ClientChatMessage[];
  canSend: boolean;
  getCodeSnapshot?: () => string | null;
  onMessages: (messages: ClientChatMessage[]) => void;
}

export function ChatPanel({ roomId, questionId, messages, canSend, getCodeSnapshot, onMessages }: Props) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const visible = messages.filter((m) => m.questionId === questionId);

  const scrollToBottom = useCallback((smooth = true) => {
    if (listRef.current) {
      listRef.current.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  }, []);

  // Scroll to bottom when question changes or on initial load
  useEffect(() => {
    scrollToBottom(false);
  }, [questionId, scrollToBottom]);

  // Smooth scroll when new messages arrive or when sending
  useEffect(() => {
    scrollToBottom(true);
  }, [visible.length, sending, scrollToBottom]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const message = input.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await api<{ messages: ClientChatMessage[] }>(`/api/interviews/${roomId}/chat`, {
        body: { questionId, message, codeSnapshot: getCodeSnapshot?.() ?? null },
      });
      onMessages(res.messages);
      setInput("");
      setTimeout(() => scrollToBottom(true), 50);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-label="AI interviewer" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={listRef} className="flex-1 min-h-0 space-y-3 overflow-y-auto p-3" aria-live="polite" aria-relevant="additions">
        {visible.length === 0 && <p className="text-sm text-muted-foreground">Ask clarifying questions or talk through your approach here.</p>}
        {visible.map((m) => (
          <div key={m.id} className={cn("flex gap-2", m.role === "user" && "flex-row-reverse")}>
            <span className={cn("mt-1 flex size-6 shrink-0 items-center justify-center rounded-full", m.role === "user" ? "bg-indigo-600 text-white" : "bg-muted")} aria-hidden>
              {m.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
            </span>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm",
                m.role === "user" ? "bg-indigo-600 text-white" : m.kind === "follow-up" ? "border border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/50" : "bg-muted",
              )}
            >
              <span className="sr-only">{m.role === "user" ? "You said: " : "Interviewer said: "}</span>
              {m.kind === "follow-up" && <span className="mb-1 block text-xs font-semibold text-indigo-700 dark:text-indigo-300">Follow-up question</span>}
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden /> The interviewer is typing…
          </p>
        )}
      </div>
      {canSend && (
        <form onSubmit={send} className="shrink-0 space-y-2 border-t bg-card p-3">
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <label htmlFor="chat-input" className="sr-only">Message to the interviewer</label>
          <Textarea
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Explain your approach or ask a question… (Enter to send, Shift+Enter for a new line)"
            className="min-h-14 max-h-28 resize-none text-sm"
            maxLength={4000}
            disabled={sending}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={sending || !input.trim()}>
              Send
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
