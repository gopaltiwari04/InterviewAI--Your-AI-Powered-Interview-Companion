/**
 * Proctoring signals: client event schema, server-side severity rules and a
 * neutral summary. These are signals for human review. Tab switches and face
 * detection failures have many innocent explanations, and nothing here ever
 * concludes that a candidate cheated.
 */
import { z } from "zod";

export const PROCTORING_EVENT_TYPES = [
  "PROCTORING_STARTED",
  "PROCTORING_STOPPED",
  "TAB_HIDDEN",
  "TAB_RETURNED",
  "WINDOW_BLUR",
  "FACE_NOT_DETECTED",
  "MULTIPLE_FACES_DETECTED",
  "CAMERA_PERMISSION_DENIED",
  "CAMERA_INTERRUPTED",
  "NETWORK_INTERRUPTED",
] as const;
export type ProctoringEventType = (typeof PROCTORING_EVENT_TYPES)[number];

export type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH";

/** Client-side detection settings. Exposed so the UI can explain them. */
export const PROCTORING_CONFIG = {
  /** How often a camera frame is analysed. */
  detectionIntervalMs: 1000,
  /** A face must be missing this long before an event starts (avoids flagging blinks or glances). */
  faceAbsenceGraceMs: 5000,
  /** Multiple faces must be seen this long before an event starts. */
  multipleFacesGraceMs: 3000,
  /** Minimum detector confidence for a face to count. */
  minFaceConfidence: 0.6,
  /** Tab absences shorter than this are recorded as informational only. */
  briefTabSwitchMs: 2000,
};

const metadataSchema = z
  .object({
    faceCount: z.number().int().min(0).max(20).optional(),
    reason: z.string().max(120).optional(),
    recoveredAfterReload: z.boolean().optional(),
    detector: z.string().max(60).optional(),
  })
  .strict();

export const clientProctoringEventSchema = z.object({
  clientEventId: z.string().uuid(),
  type: z.enum(PROCTORING_EVENT_TYPES),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable().optional(),
  /** For TAB_RETURNED: the TAB_HIDDEN event it closes. */
  closesEventId: z.string().uuid().optional(),
  metadata: metadataSchema.optional(),
});
export type ClientProctoringEvent = z.infer<typeof clientProctoringEventSchema>;

export const proctoringBatchSchema = z.object({
  events: z.array(clientProctoringEventSchema).min(1).max(50),
});

const thresholds = (ms: number, low: number, medium: number, high: number): Severity =>
  ms >= high ? "HIGH" : ms >= medium ? "MEDIUM" : ms >= low ? "LOW" : "INFO";

/**
 * Severity is always decided on the server from the event type and the
 * server-validated duration. A client-reported severity is never trusted.
 */
export function computeSeverity(type: ProctoringEventType, durationMs: number | null): Severity {
  const d = durationMs ?? 0;
  switch (type) {
    case "TAB_HIDDEN":
      return thresholds(d, PROCTORING_CONFIG.briefTabSwitchMs, 15_000, 60_000);
    case "FACE_NOT_DETECTED":
      return thresholds(d, 10_000, 30_000, 120_000);
    case "MULTIPLE_FACES_DETECTED":
      return thresholds(d, 0, 10_000, 30_000);
    case "CAMERA_INTERRUPTED":
      return thresholds(d, 0, 30_000, 120_000);
    case "CAMERA_PERMISSION_DENIED":
      return "LOW";
    case "NETWORK_INTERRUPTED":
      return thresholds(d, 30_000, 120_000, Number.POSITIVE_INFINITY);
    default:
      return "INFO";
  }
}

export interface ValidatedTimes {
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
}

/**
 * Clamps client timestamps to the interview window and the server clock, so
 * a client cannot backdate events, report future events or invent huge durations.
 */
export function validateEventTimes(
  event: Pick<ClientProctoringEvent, "startedAt" | "endedAt">,
  window: { startedAt: Date; endsAt: Date | null; completedAt: Date | null },
  now: Date = new Date(),
  skewMs = 60_000,
): ValidatedTimes | { error: string } {
  const start = new Date(event.startedAt);
  if (Number.isNaN(start.getTime())) return { error: "invalid startedAt" };
  if (start.getTime() < window.startedAt.getTime() - skewMs) return { error: "event starts before the interview" };
  if (start.getTime() > now.getTime() + skewMs) return { error: "event starts in the future" };
  const latest = Math.min(now.getTime(), (window.completedAt ?? window.endsAt ?? now).getTime() + skewMs);
  const startMs = Math.max(window.startedAt.getTime(), Math.min(start.getTime(), latest));
  let endMs: number | null = null;
  if (event.endedAt) {
    const end = new Date(event.endedAt).getTime();
    if (Number.isNaN(end)) return { error: "invalid endedAt" };
    if (end < start.getTime()) return { error: "event ends before it starts" };
    endMs = Math.max(startMs, Math.min(end, latest));
  }
  return { startedAt: new Date(startMs), endedAt: endMs === null ? null : new Date(endMs), durationMs: endMs === null ? null : endMs - startMs };
}

export interface ProctoringEventLike {
  type: ProctoringEventType;
  severity: Severity;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
}

export interface ProctoringSummary {
  tabSwitches: number;
  totalHiddenMs: number;
  longestHiddenMs: number;
  faceAbsences: number;
  faceAbsenceMs: number;
  multipleFaceEvents: number;
  cameraInterruptions: number;
  permissionDenied: boolean;
  networkInterruptions: number;
  elevatedSignals: number;
  narrative: string;
}

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

export const PROCTORING_DISCLAIMER =
  "These are automated signals for review, not evidence of misconduct. Tab switches can come from notifications, password managers or accessibility tools, and face detection is affected by lighting, camera quality, glasses, head coverings and individual differences. Browsers cannot see other devices or monitors.";

export function summarizeProctoring(events: ProctoringEventLike[], proctoringEnabled: boolean): ProctoringSummary {
  const hidden = events.filter((e) => e.type === "TAB_HIDDEN");
  const hiddenDurations = hidden.map((e) => e.durationMs ?? 0);
  const faces = events.filter((e) => e.type === "FACE_NOT_DETECTED");
  const summary: ProctoringSummary = {
    tabSwitches: hidden.length,
    totalHiddenMs: hiddenDurations.reduce((a, b) => a + b, 0),
    longestHiddenMs: hiddenDurations.length ? Math.max(...hiddenDurations) : 0,
    faceAbsences: faces.length,
    faceAbsenceMs: faces.reduce((a, e) => a + (e.durationMs ?? 0), 0),
    multipleFaceEvents: events.filter((e) => e.type === "MULTIPLE_FACES_DETECTED").length,
    cameraInterruptions: events.filter((e) => e.type === "CAMERA_INTERRUPTED").length,
    permissionDenied: events.some((e) => e.type === "CAMERA_PERMISSION_DENIED"),
    networkInterruptions: events.filter((e) => e.type === "NETWORK_INTERRUPTED").length,
    elevatedSignals: events.filter((e) => e.severity === "MEDIUM" || e.severity === "HIGH").length,
    narrative: "",
  };

  const parts: string[] = [];
  if (summary.tabSwitches === 0) parts.push("The interview tab stayed visible for the whole session.");
  else
    parts.push(
      `The interview tab was hidden ${summary.tabSwitches} time${summary.tabSwitches === 1 ? "" : "s"} for ${fmt(summary.totalHiddenMs)} in total (longest ${fmt(summary.longestHiddenMs)}).`,
    );
  if (proctoringEnabled) {
    parts.push(
      summary.faceAbsences === 0
        ? "No sustained periods without a detected face were recorded."
        : `A face was not detected for ${summary.faceAbsences} sustained period${summary.faceAbsences === 1 ? "" : "s"} (${fmt(summary.faceAbsenceMs)} in total).`,
    );
    if (summary.multipleFaceEvents > 0) parts.push(`More than one face was detected ${summary.multipleFaceEvents} time${summary.multipleFaceEvents === 1 ? "" : "s"}.`);
    if (summary.cameraInterruptions > 0) parts.push(`The camera stream was interrupted ${summary.cameraInterruptions} time${summary.cameraInterruptions === 1 ? "" : "s"}.`);
  } else {
    parts.push("Camera proctoring was not enabled for this interview.");
  }
  parts.push(
    summary.elevatedSignals === 0
      ? "No signals were above the review threshold."
      : `${summary.elevatedSignals} signal${summary.elevatedSignals === 1 ? " is" : "s are"} above the review threshold and may be worth a look.`,
  );
  summary.narrative = parts.join(" ");
  return summary;
}
