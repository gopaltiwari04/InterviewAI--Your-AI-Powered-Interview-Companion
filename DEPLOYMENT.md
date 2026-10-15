# Deploying InterviewAI

InterviewAI is made of four parts. Each one is deployed and verified separately.

| Part | Folder | Where it runs | Talks to |
| --- | --- | --- | --- |
| Web app + AI chat API | `apps/web` | Vercel | PostgreSQL (Neon), Gemini, ws-server (from the browser) |
| Socket.IO server | `apps/ws-server` | Render (web service) | Upstash Redis |
| Code-execution worker | `apps/code-executor` | Any machine with **Docker** (not Render) | Upstash Redis, Docker |
| Database schema | `packages/database` | Neon PostgreSQL | — |

Redis is only used for Socket.IO messaging and the code-execution queue. Users,
rooms, chat messages and reports are stored in PostgreSQL.

## Environment variables

Never commit real values. Every `.env` file is ignored by Git.

| Variable | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_WS_URL` | web (browser) | Public URL of the Render service, e.g. `https://interviewai-ws.onrender.com`. Inlined at **build** time: redeploy after changing it. Not a secret. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | web | Secret. Gemini API key. |
| `GEMINI_MODEL` | web | Optional. Defaults to `gemini-2.5-flash`. |
| `GEMINI_FALLBACK_MODEL` | web | Optional. Used when the main model returns 503/429. Defaults to `gemini-3.5-flash`. |
| `DATABASE_URL` | web, `packages/database` | Secret. Neon PostgreSQL URL. |
| `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | web | Secrets. Auth.js. |
| `REDIS_URL` | ws-server, code-executor | Secret. Upstash URL starting with `rediss://` (TLS). **Both services must use the same Redis.** |
| `CLIENT_URL` | ws-server | Allowed browser origins, comma-separated, no trailing slash. |
| `NODE_ENV` | ws-server | `production` on Render. Disables the automatic `localhost:3000` origin and requires `REDIS_URL`. |
| `PORT` | ws-server | Set automatically by Render. Defaults to 8080 locally. |

## 1. Socket.IO server on Render

### Option A: Blueprint (uses `render.yaml`)

1. Push this branch to GitHub.
2. Render dashboard → **New** → **Blueprint** → choose the repository.
3. When prompted, paste the Upstash `REDIS_URL` into the Render form (not into any chat or file).
4. Deploy.

### Option B: Manual web service

Render dashboard → **New** → **Web Service** → choose the repository, then:

| Setting | Value |
| --- | --- |
| Root directory | *(leave empty: the repository root)* |
| Runtime | Node |
| Build command | `npm install -g pnpm@9.0.0 && pnpm install --frozen-lockfile --prod=false --filter ws-server... && pnpm --filter ws-server run build` |
| Start command | `node apps/ws-server/dist/index.js` |
| Health check path | `/health` |
| Environment | `NODE_VERSION=22.14.0`, `NODE_ENV=production`, `CLIENT_URL=https://interviewai-nine-theta.vercel.app`, `REDIS_URL=<your Upstash URL>` |

After it deploys, open `https://<your-service>.onrender.com/health`. Expect:

```json
{ "status": "ok", "redis": "ready", "codeExecutorOnline": false, "uptimeSeconds": 12 }
```

`codeExecutorOnline` turns `true` only while the worker (step 3) is running.

Free Render services sleep after about 15 minutes without traffic. The first
connection afterwards can take up to a minute. The editor shows "Disconnected"
until the server wakes up, then reconnects by itself.

## 2. Web app on Vercel

1. Vercel → project → **Settings** → **Environment Variables**.
2. Add `NEXT_PUBLIC_WS_URL` = the Render URL from step 1 (with `https://`, no trailing slash) for **Production** (and Preview if you use it).
3. Check that `GOOGLE_GENERATIVE_AI_API_KEY`, `DATABASE_URL` and the `AUTH_*` variables already exist. Do not change them if they work.
4. **Deployments** → latest → **Redeploy**. This is required because `NEXT_PUBLIC_WS_URL` is baked into the browser bundle at build time.

If you use Vercel preview deployments, add their origins to `CLIENT_URL` on
Render (comma-separated). Otherwise the server rejects them.

## 3. Code-execution worker

The worker runs every submission with `docker run` (no network, 256 MB RAM, 0.5 CPU),
so it needs a host with a running Docker daemon. **Render web services and background
workers do not provide Docker, so the worker cannot run on Render as written.** Until
a worker is running, "Run Code" answers with "The code-execution worker is offline".

Choose one:

* **Your own computer (good for demos):** install and start Docker Desktop, set
  `apps/code-executor/.env` → `REDIS_URL` to the **same Upstash URL** used by the
  ws-server, then run:

  ```bash
  pnpm --filter code-executor dev
  ```

  Code execution works only while this terminal stays open.

* **A small Linux VM with Docker** (for example a free-tier VM from Oracle Cloud, or a
  paid VM from Hetzner, DigitalOcean, AWS or Google Cloud): install Docker and Node 22,
  clone the repo, set `REDIS_URL`, then:

  ```bash
  pnpm install --frozen-lockfile --filter code-executor...
  ```

  ```bash
  pnpm --filter code-executor run build
  ```

  ```bash
  node apps/code-executor/dist/index.js
  ```

  Keep it running with `pm2` or a `systemd` service. Pre-pull the images
  (`node:20-alpine`, `python:3.10-alpine`, `gcc:latest`, `eclipse-temurin:17`),
  because the 5-second execution timeout includes the image download.

* **Replace Docker with a hosted sandbox API** (for example Judge0 or Piston). This
  needs code changes and is not done yet.

## 4. Upstash Redis settings

* Keep **Eviction disabled** on the Upstash database. BullMQ jobs disappear if Redis evicts keys.
* Upstash bills per command. An idle worker polls the queue (every 30 s here) and sends a
  heartbeat every 30 s. Watch the Upstash usage page during the first days.
* The worker and the ws-server **must** point to the same Upstash database.

## 5. Database

The production schema already matches `packages/database/prisma/schema.prisma`
(checked read-only with `prisma migrate diff`). No migration is needed for this change.
Do not run `prisma migrate reset` or `prisma db push --force-reset` against production.

## Verification checklist

Test each part on its own so a failure in one does not hide another.

### A. WebSocket connection
- [ ] `https://<render-service>.onrender.com/health` returns `"status":"ok"` and `"redis":"ready"`.
- [ ] Open an interview room on the Vercel site. Within a minute the badge beside the editor shows **Connected**.
- [ ] Browser DevTools → Network → **WS** shows a `wss://<render-service>.onrender.com/socket.io/...` connection with status 101.
- [ ] Open the same room in two browser windows. Typing in one updates the other.

### B. AI chat
- [ ] Send a message in the AI Interviewer panel. A reply arrives, introducing itself once.
- [ ] A second message gets a reply without a new introduction, and the reply refers to your editor code when relevant.
- [ ] If you see "The AI model is overloaded", send again. Vercel logs (`[CHAT]` lines) show whether the fallback model was used.

### C. Database persistence
- [ ] After chatting, refresh the dashboard or run `pnpm --filter @repo/database exec prisma studio` locally and check that new `InterviewEvent` rows of type `AI_CHAT_MESSAGE` exist for the room.
- [ ] Click **End Interview**. A report page opens and the room shows as completed on the dashboard.

### D. Code execution
- [ ] Start the worker (section 3). `/health` shows `"codeExecutorOnline": true` within 30 seconds.
- [ ] Run `console.log(2 + 3)` in JavaScript. Output shows `Status: success` and `5`.
- [ ] Run Python `print("hi")`. Output shows `hi`.
- [ ] Stop the worker, wait 90 seconds, and press Run Code. It immediately says the worker is offline (it does not hang).

## Credential rotation (if a secret is ever exposed)

* **Upstash:** database → **Details** → **Reset password**, then update `REDIS_URL` on Render, on the worker host, and in local `.env` files.
* **Neon:** project → **Roles** → reset the role's password, then update `DATABASE_URL` on Vercel and locally.
* **Gemini:** Google AI Studio → **API keys** → create a new key, update Vercel, then delete the old key.
* **GitHub / Google OAuth:** generate a new client secret in GitHub Developer Settings / Google Cloud Console, update Vercel, then revoke the old one.
* **AUTH_SECRET:** generate a new one with `npx auth secret` and update Vercel (this signs everyone out).

After rotating, redeploy the affected service.
