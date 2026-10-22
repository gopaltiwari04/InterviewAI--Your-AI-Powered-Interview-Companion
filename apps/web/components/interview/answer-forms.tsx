"use client";

import type { ClientInterview, ClientQuestion, CodingExplanation } from "@repo/core/interview";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";
import { api, errorText } from "@/lib/client/api";

/** Approach, complexity and edge cases for a coding question; evaluated with the code. */
export function ExplanationForm({ roomId, question, onSaved }: { roomId: string; question: ClientQuestion; onSaved: (state: ClientInterview) => void }) {
  const [value, setValue] = useState<CodingExplanation>(question.explanation ?? { approach: "", timeComplexity: "", spaceComplexity: "", edgeCases: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const set = (k: keyof CodingExplanation) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue((v) => ({ ...v, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const state = await api<ClientInterview>(`/api/interviews/${roomId}/questions/${question.id}/answer`, { body: { explanation: value } });
      onSaved(state);
      setMessage({ tone: "success", text: "Explanation saved. The interviewer may ask a follow-up." });
    } catch (err) {
      setMessage({ tone: "danger", text: errorText(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="exp-approach">Approach</Label>
        <Textarea id="exp-approach" value={value.approach} onChange={set("approach")} placeholder="Describe your algorithm and why you chose it." maxLength={4000} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="exp-time">Time complexity</Label>
          <Input id="exp-time" value={value.timeComplexity} onChange={set("timeComplexity")} placeholder="e.g. O(n log n)" maxLength={200} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="exp-space">Space complexity</Label>
          <Input id="exp-space" value={value.spaceComplexity} onChange={set("spaceComplexity")} placeholder="e.g. O(n)" maxLength={200} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="exp-edges">Edge cases and trade-offs</Label>
        <Textarea id="exp-edges" value={value.edgeCases} onChange={set("edgeCases")} placeholder="Empty input, duplicates, overflow, alternative approaches…" maxLength={2000} />
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button type="submit" variant="secondary" disabled={saving}>
        {saving ? "Saving…" : "Save explanation"}
      </Button>
    </form>
  );
}

/** Written answer for technical and behavioral questions. */
export function AnswerForm({ roomId, question, onSaved }: { roomId: string; question: ClientQuestion; onSaved: (state: ClientInterview) => void }) {
  const [answer, setAnswer] = useState(question.answer ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const state = await api<ClientInterview>(`/api/interviews/${roomId}/questions/${question.id}/answer`, { body: { answer } });
      onSaved(state);
      setMessage({ tone: "success", text: "Answer submitted. Check the interviewer panel for a follow-up question." });
    } catch (err) {
      setMessage({ tone: "danger", text: errorText(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex h-full flex-col gap-3 rounded-xl border bg-card p-4">
      <Label htmlFor="answer">Your answer</Label>
      <Textarea
        id="answer"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        className="min-h-72 flex-1"
        maxLength={8000}
        placeholder={question.kind === "BEHAVIORAL" ? "Situation → Task → Action → Result → what you learned" : "Explain the concept, why it works and the trade-offs…"}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{answer.length}/8000 characters</span>
        {question.answeredAt && <span>Last submitted {new Date(question.answeredAt).toLocaleTimeString()}</span>}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div>
        <Button type="submit" disabled={saving || !answer.trim()}>
          {saving ? "Submitting…" : question.answer ? "Update answer" : "Submit answer"}
        </Button>
      </div>
    </form>
  );
}
