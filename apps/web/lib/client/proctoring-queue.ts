"use client";

import type { ClientProctoringEvent } from "@repo/core/proctoring";

/**
 * Durable client-side buffer for proctoring events. Events are written to
 * localStorage first so a refresh, crash or brief network loss does not lose
 * them, then sent in batches. The server de-duplicates by clientEventId, so
 * re-sending after an uncertain failure is safe.
 */
export class ProctoringQueue {
  private events: ClientProctoringEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private sending = false;
  private stopped = false;
  private readonly key: string;

  constructor(
    private readonly roomId: string,
    private readonly flushIntervalMs = 5000,
  ) {
    this.key = `ia-proctor-queue:${roomId}`;
    try {
      const stored = JSON.parse(localStorage.getItem(this.key) ?? "[]") as ClientProctoringEvent[];
      if (Array.isArray(stored)) this.events = stored.slice(-200);
    } catch {
      this.events = [];
    }
  }

  start() {
    this.stopped = false;
    this.timer ??= setInterval(() => void this.flush(), this.flushIntervalMs);
    window.addEventListener("pagehide", this.beacon);
    void this.flush();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    window.removeEventListener("pagehide", this.beacon);
  }

  push(event: ClientProctoringEvent) {
    this.events.push(event);
    this.persist();
    if (this.events.length >= 10) void this.flush();
  }

  private persist() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.events.slice(-200)));
    } catch {
      // Storage full or disabled: events stay in memory.
    }
  }

  async flush(): Promise<void> {
    if (this.sending || this.events.length === 0) return;
    this.sending = true;
    const batch = this.events.slice(0, 50);
    try {
      const res = await fetch(`/api/interviews/${this.roomId}/proctoring/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: batch }),
        credentials: "same-origin",
        keepalive: true,
      });
      // 2xx: stored (or duplicates). 400/404/409: the batch can never be accepted; drop it.
      if (res.ok || res.status === 400 || res.status === 404 || res.status === 409) {
        const sent = new Set(batch.map((e) => e.clientEventId));
        this.events = this.events.filter((e) => !sent.has(e.clientEventId));
        this.persist();
      }
    } catch {
      // Offline: keep the events and retry on the next tick.
    } finally {
      this.sending = false;
    }
    if (!this.stopped && this.events.length > 0 && this.events.length >= 10) void this.flush();
  }

  /** Last-chance delivery when the page is being hidden or unloaded. */
  private beacon = () => {
    if (this.events.length === 0 || typeof navigator.sendBeacon !== "function") return;
    const blob = new Blob([JSON.stringify({ events: this.events.slice(0, 50) })], { type: "application/json" });
    navigator.sendBeacon(`/api/interviews/${this.roomId}/proctoring/events`, blob);
  };
}

export const newEventId = () => crypto.randomUUID();
