"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, errorText } from "@/lib/client/api";

/** Refreshes the server-rendered report while the evaluation is pending or running. */
export function EvaluationPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [active, router]);
  if (!active) return null;
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden /> Evaluating your interview. This usually takes under a minute; the page updates automatically.
    </p>
  );
}

export function RetryEvaluationButton({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api(`/api/interviews/${roomId}/evaluation/retry`, { body: {} });
            router.refresh();
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Retrying…" : "Retry evaluation"}
      </Button>
      {error && <span className="text-sm text-rose-600">{error}</span>}
    </div>
  );
}

export function ReviewControls({ roomId, eventId, status }: { roomId: string; eventId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const set = async (next: string) => {
    setBusy(true);
    try {
      await api(`/api/interviews/${roomId}/proctoring/events/${eventId}`, { method: "PATCH", body: { status: next } });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex gap-1">
      <Button size="xs" variant={status === "ACKNOWLEDGED" ? "secondary" : "ghost"} disabled={busy} onClick={() => void set("ACKNOWLEDGED")}>
        Reviewed
      </Button>
      <Button size="xs" variant={status === "DISMISSED" ? "secondary" : "ghost"} disabled={busy} onClick={() => void set("DISMISSED")}>
        Dismiss
      </Button>
    </span>
  );
}
