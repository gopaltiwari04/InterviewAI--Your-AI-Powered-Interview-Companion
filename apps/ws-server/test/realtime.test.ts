/**
 * Starts the real server as a child process (needs Redis; defaults to
 * redis://localhost:6379/6) and checks authentication and room isolation.
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { signRealtimeToken } from "@repo/core/realtime";
import { Redis } from "ioredis";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SECRET = "ws-test-secret-ws-test-secret-ws-test-secret";
const PORT = 18_080 + Math.floor(Math.random() * 500);
const REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://localhost:6379/6";
const URL = `http://localhost:${PORT}`;
let server: ChildProcess;
let redis: Redis;

const token = (room: string, role: "CANDIDATE" | "INTERVIEWER" = "CANDIDATE", sub = "user-1", ttl = 300) =>
  signRealtimeToken({ sub, name: sub, room, role }, SECRET, ttl);

function connect(auth: Record<string, unknown>): Promise<{ socket: Socket; error?: string; hello?: { presence: unknown[] } }> {
  return new Promise((resolve) => {
    const socket = io(URL, { transports: ["websocket"], auth, reconnection: false, forceNew: true });
    socket.on("hello", (hello) => resolve({ socket, hello }));
    socket.on("connect_error", (err) => resolve({ socket, error: err.message }));
  });
}

const next = <T>(socket: Socket, event: string, ms = 3000) =>
  new Promise<T | null>((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    socket.once(event, (v: T) => {
      clearTimeout(t);
      resolve(v);
    });
  });

beforeAll(async () => {
  redis = new Redis(REDIS_URL);
  server = spawn(process.execPath, ["--import", "tsx", path.join(__dirname, "..", "src", "index.ts")], {
    env: { ...process.env, PORT: String(PORT), REDIS_URL, REALTIME_JWT_SECRET: SECRET, NODE_ENV: "test", CLIENT_URL: "http://localhost:3000" },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${URL}/ready`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("ws-server did not become ready");
}, 60_000);

afterAll(async () => {
  server?.kill();
  await redis?.quit();
});

describe("realtime authentication", () => {
  it("rejects connections without a token", async () => {
    const r = await connect({});
    expect(r.error).toBe("unauthorized");
    r.socket.close();
  });

  it("rejects forged and expired tokens", async () => {
    const forged = signRealtimeToken({ sub: "u", name: "u", room: "room-a", role: "CANDIDATE" }, "x".repeat(40));
    const a = await connect({ token: forged });
    expect(a.error).toBe("unauthorized");
    a.socket.close();
    const b = await connect({ token: token("room-a", "CANDIDATE", "u", -10) });
    expect(b.error).toBe("unauthorized");
    b.socket.close();
  });

  it("accepts a valid token and reports presence", async () => {
    const r = await connect({ token: token("room-a") });
    expect(r.error).toBeUndefined();
    expect(r.hello?.presence).toEqual(expect.arrayContaining([expect.objectContaining({ userId: "user-1" })]));
    r.socket.close();
  });

  it("rejects browser origins that are not allowed", async () => {
    const res = await fetch(`${URL}/socket.io/?EIO=4&transport=polling`, { headers: { origin: "https://evil.example" } });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("room isolation", () => {
  it("only delivers relayed events to the token's room and ignores join-room", async () => {
    const a = await connect({ token: token("room-a", "CANDIDATE", "alice") });
    const b = await connect({ token: token("room-b", "CANDIDATE", "bob") });
    // Bob tries to join Alice's room; the server refuses.
    b.socket.emit("join-room", "room-a");
    expect(await next<{ message: string }>(b.socket, "error-message")).toMatchObject({ message: expect.stringMatching(/assigned/) });

    const gotA = next<{ type: string }>(a.socket, "interview-event");
    const gotB = next<{ type: string }>(b.socket, "interview-event", 1500);
    await redis.publish("interview-updates:room-a", JSON.stringify({ type: "state", version: 2, status: "IN_PROGRESS", currentQuestionId: null, endsAt: null }));
    expect(await gotA).toMatchObject({ type: "state", version: 2 });
    expect(await gotB).toBeNull();
    a.socket.close();
    b.socket.close();
  });

  it("mirrors candidate code to interviewers but not the other way round", async () => {
    const candidate = await connect({ token: token("room-c", "CANDIDATE", "cand") });
    const interviewer = await connect({ token: token("room-c", "INTERVIEWER", "intv") });
    const received = next<{ code: string }>(interviewer.socket, "code-sync");
    candidate.socket.emit("code-sync", { questionId: "q1", code: "print(1)", language: "python", seq: 1 });
    expect(await received).toMatchObject({ code: "print(1)" });

    const reverse = next(candidate.socket, "code-sync", 1500);
    interviewer.socket.emit("code-sync", { questionId: "q1", code: "hacked", language: "python", seq: 99 });
    expect(await reverse).toBeNull();

    const oversized = next(interviewer.socket, "code-sync", 1500);
    await new Promise((r) => setTimeout(r, 200));
    candidate.socket.emit("code-sync", { questionId: "q1", code: "x".repeat(70 * 1024), language: "python", seq: 2 });
    expect(await oversized).toBeNull();
    candidate.socket.close();
    interviewer.socket.close();
  });
});
