/**
 * Realtime server for interview rooms (Socket.IO + Redis adapter).
 *
 * Security model:
 *  - Every connection must present a short-lived token signed by the web app
 *    (REALTIME_JWT_SECRET). The token names exactly one interview room; the
 *    server joins the socket to that room itself. Clients cannot pick rooms.
 *  - The server never runs code and never sees tests: it only relays
 *    sanitised notifications published by the web app and the judge, plus the
 *    candidate's live code to interviewers in the same room.
 *  - Browser origins are restricted to CLIENT_URL.
 */
import "dotenv/config";
import { createServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { EXECUTOR_HEARTBEAT_KEY, SUBMISSION_CHANNEL_PREFIX } from "@repo/core/judge";
import { createLogger, errorMessage } from "@repo/core/observability";
import { INTERVIEW_CHANNEL_PREFIX, RealtimeTokenError, verifyRealtimeToken, type RealtimeClaims } from "@repo/core/realtime";
import { describeRedis, getRedisUrl, redisFingerprint, redisOptionsFromUrl } from "@repo/core/redis";
import cors from "cors";
import express from "express";
import { Redis } from "ioredis";
import { Server, type Socket } from "socket.io";

const log = createLogger("ws-server");
const isProduction = process.env.NODE_ENV === "production";

const secret = process.env.REALTIME_JWT_SECRET ?? "";
if (secret.length < 32) {
  log.error("REALTIME_JWT_SECRET must be set (32+ characters) and match the web app; refusing all connections until it is");
}

// CLIENT_URL may hold several comma-separated origins, e.g. "https://app.vercel.app,https://my-domain.com"
const allowedOrigins = new Set(
  (process.env.CLIENT_URL || "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean),
);
if (!isProduction) {
  allowedOrigins.add("http://localhost:3000");
  allowedOrigins.add("http://127.0.0.1:3000");
}
if (allowedOrigins.size === 0) log.warn("CLIENT_URL is not set: browsers from every origin will be rejected");

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: [...allowedOrigins], credentials: true }));
const httpServer = createServer(app);

const redisUrl = getRedisUrl();
const redisOptions = redisOptionsFromUrl(redisUrl);
log.info("starting", { redis: describeRedis(redisUrl), redisFingerprint: redisFingerprint(redisUrl), origins: [...allowedOrigins] });

const pubClient = new Redis(redisOptions);
const subClient = pubClient.duplicate();
const relayClient = pubClient.duplicate();
for (const [name, client] of [["pub", pubClient], ["sub", subClient], ["relay", relayClient]] as const) {
  client.on("error", (err) => log.warn("redis error", { client: name, error: err.message }));
  client.on("ready", () => log.info("redis ready", { client: name }));
}

interface SocketData {
  claims: RealtimeClaims;
  lastCodeSyncAt: number;
}

const io = new Server<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>(httpServer, {
  cors: { origin: [...allowedOrigins], methods: ["GET", "POST"], credentials: true },
  // The cors option only covers long-polling; this also checks WebSocket upgrades.
  allowRequest: (req, callback) => {
    const origin = req.headers.origin;
    const allowed = !origin || allowedOrigins.has(origin);
    if (!allowed) log.warn("rejected origin", { origin });
    callback(null, allowed);
  },
  maxHttpBufferSize: 128 * 1024,
  pingInterval: 20_000,
  pingTimeout: 20_000,
  adapter: createAdapter(pubClient, subClient),
});

const roomName = (roomId: string) => `interview:${roomId}`;

/** Resolves to `fallback` if Redis is slow or down, so socket handlers never hang. */
const within = <T>(p: Promise<T>, fallback: T, ms = 2000): Promise<T> =>
  Promise.race([p.catch(() => fallback), new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
const CODE_SYNC_TTL_SECONDS = 2 * 3600;
const MAX_CODE_BYTES = 64 * 1024;
const stats = { connections: 0, rejected: 0, relayed: 0 };

// Authenticate before the connection is accepted.
io.use((socket, next) => {
  const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
  try {
    if (secret.length < 32) throw new RealtimeTokenError("server not configured");
    if (typeof token !== "string" || !token) throw new RealtimeTokenError("missing token");
    socket.data.claims = verifyRealtimeToken(token, secret);
    socket.data.lastCodeSyncAt = 0;
    next();
  } catch (err) {
    stats.rejected++;
    log.info("connection rejected", { reason: err instanceof RealtimeTokenError ? err.message : "error" });
    next(new Error("unauthorized"));
  }
});

async function presence(roomId: string) {
  const sockets = await io.in(roomName(roomId)).fetchSockets();
  const seen = new Map<string, { userId: string; name: string; role: string }>();
  for (const s of sockets) {
    const c = s.data.claims;
    if (c) seen.set(c.sub, { userId: c.sub, name: c.name, role: c.role });
  }
  return [...seen.values()];
}

async function broadcastPresence(roomId: string) {
  try {
    io.to(roomName(roomId)).emit("presence" as never, (await within(presence(roomId), [])) as never);
  } catch (err) {
    log.warn("presence failed", { roomId, error: errorMessage(err) });
  }
}

io.on("connection", async (socket: Socket) => {
  const claims = (socket.data as SocketData).claims;
  const room = roomName(claims.room);
  stats.connections++;
  await socket.join(room);
  log.info("joined", { roomId: claims.room, role: claims.role, userId: claims.sub });

  const snapshot = await within(pubClient.get(`code-sync:${claims.room}`), null);
  socket.emit("hello", { serverTime: new Date().toISOString(), presence: await within(presence(claims.room), []) });
  if (snapshot && claims.role !== "CANDIDATE") socket.emit("code-sync", JSON.parse(snapshot));
  void broadcastPresence(claims.room);

  // Joining other rooms is not supported: membership comes from the token only.
  socket.on("join-room", () => socket.emit("error-message", { message: "Rooms are assigned by the server." }));

  // Candidate -> interviewers: live, read-only view of the editor. Last write wins (seq ordered on clients).
  socket.on("code-sync", (payload: unknown) => {
    if (claims.role !== "CANDIDATE") return;
    const p = payload as { questionId?: unknown; code?: unknown; language?: unknown; seq?: unknown };
    if (typeof p?.questionId !== "string" || typeof p.code !== "string" || typeof p.language !== "string" || typeof p.seq !== "number") return;
    if (Buffer.byteLength(p.code) > MAX_CODE_BYTES || p.questionId.length > 64 || p.language.length > 20) return;
    const data = socket.data as SocketData;
    const now = Date.now();
    if (now - data.lastCodeSyncAt < 150) return; // simple per-socket rate limit
    data.lastCodeSyncAt = now;
    const message = { questionId: p.questionId, code: p.code, language: p.language, seq: p.seq };
    socket.to(room).emit("code-sync", message);
    void pubClient.set(`code-sync:${claims.room}`, JSON.stringify(message), "EX", CODE_SYNC_TTL_SECONDS).catch(() => undefined);
  });

  socket.on("disconnect", (reason) => {
    log.info("left", { roomId: claims.room, userId: claims.sub, reason });
    void broadcastPresence(claims.room);
  });
});

// Relay sanitised notifications from the web app and the judge into rooms.
void relayClient.psubscribe(`${INTERVIEW_CHANNEL_PREFIX}*`, `${SUBMISSION_CHANNEL_PREFIX}*`).catch((err) => log.error("psubscribe failed", { error: errorMessage(err) }));
relayClient.on("pmessage", (_pattern, channel, message) => {
  try {
    const parsed = JSON.parse(message) as Record<string, unknown>;
    if (channel.startsWith(INTERVIEW_CHANNEL_PREFIX)) {
      io.to(roomName(channel.slice(INTERVIEW_CHANNEL_PREFIX.length))).emit("interview-event" as never, parsed as never);
    } else {
      const roomId = channel.slice(SUBMISSION_CHANNEL_PREFIX.length);
      io.to(roomName(roomId)).emit("submission-event" as never, { submissionId: String(parsed.submissionId ?? ""), status: String(parsed.status ?? "") } as never);
    }
    stats.relayed++;
  } catch {
    log.warn("ignored malformed relay message", { channel });
  }
});

app.get("/", (_req, res) => {
  res.type("text").send("InterviewAI realtime server");
});

// Liveness for Render: 200 while the process is up, with dependency state for diagnostics.
app.get("/health", async (_req, res) => {
  // Never block the health check on Redis: commands queue indefinitely while it is down.
  let executorOnline: boolean | null = null;
  if (pubClient.status === "ready") {
    executorOnline = await Promise.race([
      pubClient.exists(EXECUTOR_HEARTBEAT_KEY).then((n) => n === 1),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]).catch(() => null);
  }
  res.set("cache-control", "no-store").json({
    status: "ok",
    redis: pubClient.status,
    redisFingerprint: redisFingerprint(redisUrl),
    tokenSecretConfigured: secret.length >= 32,
    codeExecutorOnline: executorOnline,
    connections: io.engine.clientsCount,
    totals: stats,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// Readiness: only ready when Redis works and tokens can be verified.
app.get("/ready", (_req, res) => {
  const ready = pubClient.status === "ready" && subClient.status === "ready" && secret.length >= 32;
  res.status(ready ? 200 : 503).json({ ready, redis: pubClient.status });
});

const PORT = Number(process.env.PORT) || 8080;
// Bind to 0.0.0.0 so Render (and Docker) can route traffic to the process.
httpServer.listen(PORT, "0.0.0.0", () => log.info("listening", { port: PORT }));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutting down", { signal, connections: io.engine.clientsCount });
  // Clients reconnect automatically (to another instance during a deploy) and refetch state.
  io.close();
  await Promise.all([pubClient, subClient, relayClient].map((c) => c.quit().catch(() => undefined)));
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
