"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { api, errorText } from "@/lib/client/api";

/** Accepts an interviewer invite (token from the link) and opens the room. */
export function JoinInterview({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    api<{ roomId: string }>("/api/invites/accept", { body: { token } })
      .then((r) => router.replace(`/interview/${r.roomId}`))
      .catch((err) => setError(errorText(err)));
  }, [token, router]);
  return (
    <main id="main" className="mx-auto max-w-md p-8">
      {error ? <Alert tone="danger">{error}</Alert> : <p role="status">Joining the interview…</p>}
    </main>
  );
}
