import { route } from "@/lib/server/api";
import { RATE_LIMITS, enforceRateLimit, issueRealtimeToken, loadRoomForActor } from "@/lib/server/engine";

/** Short-lived token that lets this browser join the interview's Socket.IO room. */
export const POST = route<{ id: string }>("realtime.token", async ({ actor, params }) => {
  await enforceRateLimit(RATE_LIMITS.realtimeToken, actor.userId);
  const access = await loadRoomForActor(params.id, actor);
  return issueRealtimeToken({ userId: actor.userId, name: actor.name ?? "Participant", roomId: access.room.id, role: access.role });
});
