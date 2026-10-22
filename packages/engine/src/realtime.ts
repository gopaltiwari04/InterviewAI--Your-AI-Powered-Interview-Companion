import { INTERVIEW_CHANNEL_PREFIX, signRealtimeToken, type InterviewBroadcast, type RealtimeRole } from "@repo/core/realtime";
import { getEnv } from "./env";
import { unavailable } from "./errors";
import { getRedis, logger } from "./infra";

/**
 * Publishes a sanitised state change for an interview room. The realtime
 * server relays it to the room's sockets. Never include test data, code of
 * other users or anything not already visible to every room member.
 */
export async function broadcast(roomId: string, message: InterviewBroadcast): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.publish(`${INTERVIEW_CHANNEL_PREFIX}${roomId}`, JSON.stringify(message));
  } catch (err) {
    // Clients also poll the API, so a missed broadcast only delays an update.
    logger.warn("broadcast failed", { roomId, error: (err as Error).message });
  }
}

export function issueRealtimeToken(claims: { userId: string; name: string; roomId: string; role: RealtimeRole }): { token: string; expiresInSeconds: number } {
  const secret = getEnv().REALTIME_JWT_SECRET;
  if (!secret) throw unavailable("Real-time collaboration is not configured (REALTIME_JWT_SECRET is missing).");
  const ttl = 15 * 60;
  return { token: signRealtimeToken({ sub: claims.userId, name: claims.name, room: claims.roomId, role: claims.role }, secret, ttl), expiresInSeconds: ttl };
}
