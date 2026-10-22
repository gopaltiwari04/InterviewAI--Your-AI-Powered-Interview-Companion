/**
 * Proctoring event ingestion. Only the candidate can submit events for their
 * own interview; events are validated, timestamps are clamped to the interview
 * window, severity is computed here and duplicates are ignored by clientEventId.
 */
import {
  PROCTORING_DISCLAIMER,
  computeSeverity,
  proctoringBatchSchema,
  summarizeProctoring,
  validateEventTimes,
  type ProctoringEventLike,
  type ProctoringEventType,
} from "@repo/core/proctoring";
import { Prisma } from "@repo/database";
import { badRequest, conflict } from "../errors";
import { db, logger } from "../infra";
import { loadRoomForActor, loadRoomForCandidate, type Actor } from "../interviews/access";
import { RATE_LIMITS, enforceRateLimit } from "../rate-limit";

/** Events may arrive shortly after completion (e.g. flushed when the tab closes). */
const LATE_ARRIVAL_MS = 2 * 60_000;
const CAMERA_TYPES: ProctoringEventType[] = ["FACE_NOT_DETECTED", "MULTIPLE_FACES_DETECTED", "CAMERA_INTERRUPTED", "CAMERA_PERMISSION_DENIED", "PROCTORING_STARTED", "PROCTORING_STOPPED"];

export interface IngestResult {
  accepted: number;
  duplicates: number;
  rejected: { clientEventId: string; reason: string }[];
}

export async function ingestProctoringEvents(roomId: string, actor: Actor, input: unknown): Promise<IngestResult> {
  const parsed = proctoringBatchSchema.safeParse(input);
  if (!parsed.success) throw badRequest("Invalid proctoring events.", { issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) });
  const { room } = await loadRoomForCandidate(roomId, actor);
  await enforceRateLimit(RATE_LIMITS.proctoring, `${actor.userId}:${roomId}`);
  const now = new Date();
  if (!room.startedAt) throw conflict("The interview has not started.");
  const acceptingUntil = room.completedAt ? room.completedAt.getTime() + LATE_ARRIVAL_MS : Number.POSITIVE_INFINITY;
  if (room.status !== "IN_PROGRESS" && !(room.status === "COMPLETED" && now.getTime() <= acceptingUntil)) {
    throw conflict("This interview is no longer accepting proctoring events.");
  }

  const result: IngestResult = { accepted: 0, duplicates: 0, rejected: [] };
  for (const event of parsed.data.events) {
    if (!room.proctoringEnabled && CAMERA_TYPES.includes(event.type)) {
      result.rejected.push({ clientEventId: event.clientEventId, reason: "camera proctoring is not enabled" });
      continue;
    }
    const times = validateEventTimes(event, { startedAt: room.startedAt, endsAt: room.endsAt, completedAt: room.completedAt }, now);
    if ("error" in times) {
      result.rejected.push({ clientEventId: event.clientEventId, reason: times.error });
      continue;
    }

    // TAB_RETURNED closes the matching TAB_HIDDEN interval (server-side duration).
    if (event.type === "TAB_RETURNED" && event.closesEventId) {
      const hidden = await db.proctoringEvent.findUnique({ where: { roomId_clientEventId: { roomId, clientEventId: event.closesEventId } } });
      if (hidden && hidden.type === "TAB_HIDDEN" && hidden.endedAt === null) {
        const endMs = Math.max(hidden.startedAt.getTime(), times.startedAt.getTime());
        const durationMs = endMs - hidden.startedAt.getTime();
        await db.proctoringEvent.update({
          where: { id: hidden.id },
          data: { endedAt: new Date(endMs), durationMs, severity: computeSeverity("TAB_HIDDEN", durationMs) },
        });
      }
    }

    // Interval events that arrive already closed get their severity from the validated duration;
    // open intervals start as INFO and are re-scored when closed.
    const severity = computeSeverity(event.type, times.durationMs);
    const already = await db.proctoringEvent.findUnique({ where: { roomId_clientEventId: { roomId, clientEventId: event.clientEventId } }, select: { id: true } });
    try {
      if (already) throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: Prisma.prismaVersion.client });
      await db.proctoringEvent.create({
        data: {
          roomId,
          userId: actor.userId,
          clientEventId: event.clientEventId,
          type: event.type,
          severity,
          startedAt: times.startedAt,
          endedAt: times.endedAt,
          durationMs: times.durationMs,
          metadata: (event.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });
      result.accepted++;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // The same event was sent twice (retry, reload, beacon); update its end time if it now has one.
        if (times.endedAt) {
          const existing = await db.proctoringEvent.findUnique({ where: { roomId_clientEventId: { roomId, clientEventId: event.clientEventId } } });
          if (existing && existing.endedAt === null && existing.type === event.type) {
            const durationMs = Math.max(0, times.endedAt.getTime() - existing.startedAt.getTime());
            await db.proctoringEvent.update({ where: { id: existing.id }, data: { endedAt: times.endedAt, durationMs, severity: computeSeverity(event.type, durationMs) } });
          }
        }
        result.duplicates++;
      } else {
        logger.error("proctoring insert failed", { roomId, error: (err as Error).message });
        result.rejected.push({ clientEventId: event.clientEventId, reason: "storage error" });
      }
    }
  }
  return result;
}

export async function getProctoringReport(roomId: string, actor: Actor) {
  const { room } = await loadRoomForActor(roomId, actor);
  const events = await db.proctoringEvent.findMany({ where: { roomId }, orderBy: { startedAt: "asc" } });
  return {
    proctoringEnabled: room.proctoringEnabled,
    summary: summarizeProctoring(events as unknown as ProctoringEventLike[], room.proctoringEnabled),
    disclaimer: PROCTORING_DISCLAIMER,
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      severity: e.severity,
      startedAt: e.startedAt.toISOString(),
      endedAt: e.endedAt?.toISOString() ?? null,
      durationMs: e.durationMs,
      reviewStatus: e.reviewStatus,
      metadata: e.metadata,
    })),
  };
}

/** Only an interviewer (not the candidate) can mark signals as reviewed. */
export async function reviewProctoringEvent(roomId: string, eventId: string, actor: Actor, status: unknown) {
  if (status !== "ACKNOWLEDGED" && status !== "DISMISSED" && status !== "UNREVIEWED") throw badRequest("Invalid review status.");
  const access = await loadRoomForActor(roomId, actor);
  if (access.role !== "INTERVIEWER") throw conflict("Only an interviewer can review proctoring signals.");
  const updated = await db.proctoringEvent.updateMany({ where: { id: eventId, roomId }, data: { reviewStatus: status, reviewedAt: new Date() } });
  if (updated.count === 0) throw badRequest("Event not found.");
}
