"use client";

import { useEffect, useRef, useState } from "react";
import { newEventId, type ProctoringQueue } from "@/lib/client/proctoring-queue";

interface OpenHidden {
  id: string;
  startedAt: string;
}

export interface TabStats {
  switches: number;
  hiddenMs: number;
}

/**
 * Records when the interview tab is hidden and when the candidate returns,
 * using the Page Visibility API, plus window blur (focus moved to another
 * window) as an informational signal. It never blocks navigation, traps the
 * user or interferes with accessibility tools.
 *
 * An open "hidden" interval is persisted, so if the page is refreshed or closed
 * while hidden, the next load closes it instead of losing it.
 */
export function useTabMonitor(roomId: string, queue: ProctoringQueue | null, active: boolean): TabStats {
  const [stats, setStats] = useState<TabStats>({ switches: 0, hiddenMs: 0 });
  const blurStart = useRef<string | null>(null);

  useEffect(() => {
    if (!active || !queue) return;
    const key = `ia-proctor-open-hidden:${roomId}`;
    const readOpen = (): OpenHidden | null => {
      try {
        return JSON.parse(localStorage.getItem(key) ?? "null") as OpenHidden | null;
      } catch {
        return null;
      }
    };
    const writeOpen = (v: OpenHidden | null) => {
      try {
        if (v) localStorage.setItem(key, JSON.stringify(v));
        else localStorage.removeItem(key);
      } catch {
        // ignore storage errors
      }
    };

    const close = (open: OpenHidden, recovered: boolean) => {
      queue.push({
        clientEventId: newEventId(),
        type: "TAB_RETURNED",
        startedAt: new Date().toISOString(),
        closesEventId: open.id,
        ...(recovered ? { metadata: { recoveredAfterReload: true } } : {}),
      });
      const ms = Date.now() - new Date(open.startedAt).getTime();
      setStats((s) => ({ ...s, hiddenMs: s.hiddenMs + Math.max(0, ms) }));
      writeOpen(null);
    };

    const pending = readOpen();
    if (pending && document.visibilityState === "visible") close(pending, true);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (readOpen()) return;
        const open = { id: newEventId(), startedAt: new Date().toISOString() };
        writeOpen(open);
        queue.push({ clientEventId: open.id, type: "TAB_HIDDEN", startedAt: open.startedAt });
        setStats((s) => ({ ...s, switches: s.switches + 1 }));
        blurStart.current = null;
      } else {
        const open = readOpen();
        if (open) close(open, false);
      }
    };
    const onBlur = () => {
      // Hidden tabs are tracked separately; blur alone means focus moved to another window.
      if (document.visibilityState === "visible") blurStart.current = new Date().toISOString();
    };
    const onFocus = () => {
      if (blurStart.current && document.visibilityState === "visible") {
        const startedAt = blurStart.current;
        if (Date.now() - new Date(startedAt).getTime() > 1000) {
          queue.push({ clientEventId: newEventId(), type: "WINDOW_BLUR", startedAt, endedAt: new Date().toISOString() });
        }
      }
      blurStart.current = null;
    };
    const onOffline = () => {
      (window as unknown as { __iaOffline?: string }).__iaOffline = new Date().toISOString();
    };
    const onOnline = () => {
      const since = (window as unknown as { __iaOffline?: string }).__iaOffline;
      if (since) queue.push({ clientEventId: newEventId(), type: "NETWORK_INTERRUPTED", startedAt: since, endedAt: new Date().toISOString() });
      (window as unknown as { __iaOffline?: string }).__iaOffline = undefined;
      void queue.flush();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [roomId, queue, active]);

  return stats;
}
