/**
 * Reproducible load test for a LOCAL or STAGING stack (never production data).
 *
 * Each virtual user signs in with the dev-only test login, creates and starts a
 * DSA interview, opens the realtime socket, runs the sample tests and submits
 * once, then sends a chat message. Measures API p50/p95, socket connection
 * success and relay latency, judge queue wait and processing time, AI latency
 * and error rates.
 *
 * Requirements: the web app with AUTH_TEST_LOGIN=enabled (dev server), the
 * ws-server, code-executor and worker running, and direct Redis access for the
 * relay-latency probe (REDIS_URL). Usage:
 *
 *   node scripts/load-test.mjs --users 10 --base http://localhost:3000 --ws http://localhost:8080
 *
 * Results are printed and written to load-test-results.json. They describe the
 * machine they ran on; do not extrapolate them to production capacity.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { io } = require("socket.io-client");
const { Redis } = createRequire(new URL("../apps/ws-server/package.json", import.meta.url))("ioredis");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const USERS = Number(arg("users", 10));
const BASE = arg("base", "http://localhost:3000");
const WS = arg("ws", "http://localhost:8080");
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379/2";

const SOLUTION = `def twoSum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
    return []
`;

const samples = new Map();
const errors = new Map();
function record(name, ms, ok) {
  if (!samples.has(name)) samples.set(name, []);
  samples.get(name).push(ms);
  if (!ok) errors.set(name, (errors.get(name) ?? 0) + 1);
}
const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : null);

class Client {
  constructor() {
    this.cookies = new Map();
  }
  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  store(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const [k, ...v] = pair.split("=");
      this.cookies.set(k.trim(), v.join("="));
    }
  }
  async request(name, path, { method, body, form } = {}) {
    method ??= body !== undefined || form ? "POST" : "GET";
    const started = performance.now();
    let ok = false;
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        redirect: "manual",
        headers: {
          cookie: this.cookieHeader(),
          origin: BASE,
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : form ? new URLSearchParams(form).toString() : undefined,
      });
      this.store(res);
      ok = res.status < 400;
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      return { status: res.status, data };
    } finally {
      record(name, performance.now() - started, ok);
    }
  }
}

async function virtualUser(n) {
  const c = new Client();
  const csrf = await c.request("auth.csrf", "/api/auth/csrf");
  await c.request("auth.login", "/api/auth/callback/test-login", { method: "POST", form: { csrfToken: csrf.data.csrfToken, name: `Load User ${n}`, callbackUrl: `${BASE}/dashboard` } });

  const created = await c.request("POST /api/interviews", "/api/interviews", {
    body: { mode: "DSA", language: "python", difficulty: "EASY", durationMinutes: 30, topics: [], adaptive: false, proctoring: false, problemSlug: "two-sum" },
  });
  if (created.status !== 200) throw new Error(`create failed: ${created.status} ${JSON.stringify(created.data)}`);
  const roomId = created.data.id;
  const started = await c.request("POST /start", `/api/interviews/${roomId}/start`, { body: { proctoring: false } });
  const questionId = started.data.questions[0].id;

  // Realtime connection.
  const tokenRes = await c.request("POST /realtime-token", `/api/interviews/${roomId}/realtime-token`, { body: {} });
  const wsStart = performance.now();
  const socket = io(WS, { transports: ["websocket"], auth: { token: tokenRes.data.token }, reconnection: false, forceNew: true });
  const connected = await new Promise((resolve) => {
    socket.on("hello", () => resolve(true));
    socket.on("connect_error", () => resolve(false));
    setTimeout(() => resolve(false), 10_000);
  });
  record("ws.connect", performance.now() - wsStart, connected);

  for (const kind of ["RUN", "SUBMIT"]) {
    const sub = await c.request(`POST /submissions (${kind})`, `/api/interviews/${roomId}/submissions`, {
      body: { questionId, kind, language: "python", code: SOLUTION, idempotencyKey: randomUUID() },
    });
    if (sub.status !== 200) {
      record(`judge.${kind}.total`, 0, false);
      continue;
    }
    const t0 = performance.now();
    let final = null;
    while (performance.now() - t0 < 180_000) {
      const r = await c.request("GET /submissions/:id", `/api/interviews/${roomId}/submissions/${sub.data.id}`);
      if (r.data?.status === "COMPLETED" || r.data?.status === "FAILED") {
        final = r.data;
        break;
      }
      await new Promise((res) => setTimeout(res, 1000));
    }
    record(`judge.${kind}.total`, performance.now() - t0, final?.verdict === "ACCEPTED");
  }

  await c.request("POST /chat (AI)", `/api/interviews/${roomId}/chat`, { body: { questionId, message: "I used a hash map, O(n) time and space." } });
  await c.request("GET /api/interviews/:id", `/api/interviews/${roomId}`);
  return { socket, roomId };
}

async function relayProbe(sockets) {
  const redis = new Redis(REDIS_URL);
  const latencies = [];
  for (const { socket, roomId } of sockets) {
    if (!socket.connected) continue;
    const got = new Promise((resolve) => {
      socket.once("interview-event", (e) => resolve(Date.now() - e.sentAt));
      setTimeout(() => resolve(null), 5000);
    });
    await redis.publish(`interview-updates:${roomId}`, JSON.stringify({ type: "evaluation", version: 0, status: "PROBE", sentAt: Date.now() }));
    const ms = await got;
    record("ws.relay", ms ?? 5000, ms !== null);
    if (ms !== null) latencies.push(ms);
  }
  await redis.quit();
}

const startedAt = Date.now();
console.log(`Load test: ${USERS} concurrent virtual users against ${BASE}`);
const results = await Promise.allSettled(Array.from({ length: USERS }, (_, i) => virtualUser(i + 1)));
const sockets = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
await relayProbe(sockets);
sockets.forEach((s) => s.socket.close());

const summary = {
  ranAt: new Date().toISOString(),
  durationSeconds: Math.round((Date.now() - startedAt) / 1000),
  users: USERS,
  failedUsers: results.filter((r) => r.status === "rejected").map((r) => String(r.reason).slice(0, 200)),
  environment: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, memoryGb: Math.round(os.totalmem() / 1e9), platform: `${os.platform()} ${os.release()}`, node: process.version },
  metrics: Object.fromEntries(
    [...samples].map(([name, xs]) => [name, { count: xs.length, errors: errors.get(name) ?? 0, p50Ms: Math.round(pct(xs, 50)), p95Ms: Math.round(pct(xs, 95)), maxMs: Math.round(Math.max(...xs)) }]),
  ),
};
console.table(summary.metrics);
if (summary.failedUsers.length) console.log("Failed users:", summary.failedUsers);
writeFileSync("load-test-results.json", JSON.stringify(summary, null, 2));
console.log("Wrote load-test-results.json");
process.exit(0);
