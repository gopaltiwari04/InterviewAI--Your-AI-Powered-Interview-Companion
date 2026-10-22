import type { ParticipantRole } from "@repo/core/interview";
import type { InterviewParticipant, InterviewRoom } from "@repo/database";
import { forbidden, notFound } from "../errors";
import { db } from "../infra";

export interface Actor {
  userId: string;
  name?: string | null;
}

export interface RoomAccess {
  room: InterviewRoom & { participants: InterviewParticipant[] };
  role: ParticipantRole;
  isCandidate: boolean;
}

/**
 * Loads a room the actor may see. Non-members get a 404 (not 403) so room
 * IDs cannot be probed. Every engine operation goes through this check.
 */
export async function loadRoomForActor(roomId: string, actor: Actor): Promise<RoomAccess> {
  if (typeof roomId !== "string" || roomId.length === 0 || roomId.length > 64) throw notFound("Interview");
  const room = await db.interviewRoom.findUnique({ where: { id: roomId }, include: { participants: true } });
  if (!room) throw notFound("Interview");
  const isOwner = room.userId === actor.userId;
  const participant = room.participants.find((p) => p.userId === actor.userId);
  if (!isOwner && !participant) throw notFound("Interview");
  const role: ParticipantRole = isOwner ? "CANDIDATE" : participant!.role;
  return { room, role, isCandidate: isOwner };
}

/** Actions that change the interview (answers, code, proctoring) are reserved for the candidate. */
export async function loadRoomForCandidate(roomId: string, actor: Actor): Promise<RoomAccess> {
  const access = await loadRoomForActor(roomId, actor);
  if (!access.isCandidate) throw forbidden("Only the candidate can do this.");
  return access;
}
