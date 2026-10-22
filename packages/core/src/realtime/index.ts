/**
 * Short-lived signed tokens that let a browser join a Socket.IO interview room.
 *
 * The web app (which knows the session and checks room membership in the
 * database) issues a token; the realtime server only verifies the signature,
 * expiry and room claim. Both share REALTIME_JWT_SECRET. Format: compact
 * HS256 JWT, implemented with node:crypto to avoid another dependency.
 * Server-only: never import this module from browser code.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type RealtimeRole = "CANDIDATE" | "INTERVIEWER" | "OBSERVER";

export interface RealtimeClaims {
  sub: string;
  name: string;
  room: string;
  role: RealtimeRole;
  iat: number;
  exp: number;
}

export const REALTIME_TOKEN_TTL_SECONDS = 15 * 60;
/** Channel the web app publishes interview state changes on (ws-server relays them). */
export const INTERVIEW_CHANNEL_PREFIX = "interview-updates:";

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export function signRealtimeToken(
  claims: Omit<RealtimeClaims, "iat" | "exp">,
  secret: string,
  ttlSeconds = REALTIME_TOKEN_TTL_SECONDS,
  now = Math.floor(Date.now() / 1000),
): string {
  if (secret.length < 32) throw new Error("REALTIME_JWT_SECRET must be at least 32 characters");
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ ...claims, iat: now, exp: now + ttlSeconds }));
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export class RealtimeTokenError extends Error {}

export function verifyRealtimeToken(token: string, secret: string, now = Math.floor(Date.now() / 1000)): RealtimeClaims {
  if (typeof token !== "string" || token.length > 4096) throw new RealtimeTokenError("malformed token");
  const parts = token.split(".");
  if (parts.length !== 3) throw new RealtimeTokenError("malformed token");
  const [header, payload, sig] = parts as [string, string, string];
  let parsedHeader: { alg?: string };
  try {
    parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
  } catch {
    throw new RealtimeTokenError("malformed header");
  }
  if (parsedHeader.alg !== "HS256") throw new RealtimeTokenError("unsupported algorithm");
  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new RealtimeTokenError("bad signature");
  let claims: RealtimeClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new RealtimeTokenError("malformed payload");
  }
  if (typeof claims.exp !== "number" || claims.exp < now) throw new RealtimeTokenError("token expired");
  if (typeof claims.sub !== "string" || typeof claims.room !== "string") throw new RealtimeTokenError("missing claims");
  return claims;
}

/** Messages the web app publishes for a room; the ws-server forwards them as-is. */
export type InterviewBroadcast =
  | { type: "state"; version: number; status: string; currentQuestionId: string | null; endsAt: string | null }
  | { type: "submission"; version: number; submissionId: string; questionId: string; status: string; verdict: string | null }
  | { type: "evaluation"; version: number; status: string };
