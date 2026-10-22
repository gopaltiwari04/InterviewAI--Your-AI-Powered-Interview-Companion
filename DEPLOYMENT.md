# Deploying InterviewAI

| Part | Folder | Where it runs | Needs |
| --- | --- | --- | --- |
| Web app and all HTTP APIs | `apps/web` | Vercel | PostgreSQL, Redis, Gemini (optional), Auth.js secrets, realtime secret |
| Realtime server | `apps/ws-server` | Render web service (free plan works) | Redis, realtime secret |
| Code judge | `apps/code-executor` | A Linux VM **with Docker** (not Render, not Vercel) | Redis only |
| Evaluation worker (optional) | `apps/worker` | Render background worker or any always-on host | PostgreSQL, Redis, Gemini |
| Schema and migrations | `packages/database` | Neon PostgreSQL | direct connection string |

Without the worker, evaluations run inside the web app after the response (`EVALUATION_MODE=auto`). Without the judge, the app works but "Run"/"Submit" show "The code judge is offline".

> **All services must use the same Redis.** Your local `.env` files currently point the ws-server at one Redis (Upstash) and the code executor at another (redis.io). With two instances, jobs are queued in one and the judge listens to the other, so nothing ever runs. Every service now logs `redisFingerprint` at startup; the value must be identical everywhere.

## Environment variables

| Variable | Vercel (web) | Render (ws-server) | Judge VM | Worker | Notes |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | ✓ | | | ✓ | Neon **pooled** URL for runtime. Use the **direct** URL for migrations. |
| `REDIS_URL` | ✓ | ✓ | ✓ | ✓ | Same instance everywhere. Upstash: `rediss://default:<password>@<host>:6379` |
| `AUTH_SECRET` | ✓ | | | | `npx auth secret` |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | ✓ | | | | OAuth apps |
| `REALTIME_JWT_SECRET` | ✓ | ✓ | | | Same value on both, 32+ random characters |
| `NEXT_PUBLIC_WS_URL` | ✓ | | | | `https://<render-service>.onrender.com`. Build-time: redeploy after changing |
| `CLIENT_URL` | | ✓ | | | Allowed origins, comma-separated, e.g. `https://interviewai-nine-theta.vercel.app` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | ✓ | | | ✓ | Optional; without it reports contain judge-based scores only |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | optional | | | optional | Defaults `gemini-2.5-flash`, `gemini-2.5-flash-lite` |
| `GEMINI_THINKING_BUDGET` | optional | | | optional | Default `0`. Pro models require a positive value |
| `AI_TIMEOUT_MS` | optional | | | optional | Default 30000 |
| `EVALUATION_MODE` | optional | | | | `auto` (default), `queue`, `inline` |
| `NODE_ENV` | (set by Vercel) | `production` | `production` | `production` | |
| `PORT` | | (set by Render) | | | |
| `EXECUTOR_CONCURRENCY`, `SANDBOX_*`, `EXECUTOR_HEALTH_PORT` | | | optional | | See `apps/code-executor/.env.example` |
| `WORKER_CONCURRENCY`, `WORKER_HEALTH_PORT` | | | | optional | |
| `LOG_LEVEL` | optional | optional | optional | optional | `debug`, `info` (default), `warn`, `error` |
| `AUTH_TEST_LOGIN` | **never** | | | | Development and CI only; ignored by production builds |
| `AI_PROVIDER` | leave unset | | | leave unset | `mock` is rejected in production |

Each app has an `.env.example` with placeholders.

## 1. Database migrations (Neon)

This revision introduces Prisma migrations. Your production database was created with `prisma db push`, so it must be *baselined* once: tell Prisma that the existing tables equal migration `0_init`, then apply the new migration.

Use the **direct** (non-pooled) Neon connection string for these commands. Take a Neon branch or backup first (Neon console → Branches → Create branch).

```powershell
$env:DATABASE_URL="<direct Neon connection string>"
```

1. Check that the database matches the baseline exactly (read-only):

   ```powershell
   pnpm --filter @repo/database baseline:check
   ```

   It prints `OK` or the SQL differences. If there are differences, stop and resolve them first (do not continue, or the upgrade migration may fail).

2. Mark the baseline as applied (writes only to `_prisma_migrations`):

   ```powershell
   pnpm --filter @repo/database baseline:resolve
   ```

3. Apply the new migration (runs in one transaction; legacy `ACTIVE` rooms become `IN_PROGRESS`):

   ```powershell
   pnpm --filter @repo/database migrate:deploy
   ```

4. Confirm:

   ```powershell
   pnpm --filter @repo/database migrate:status
   ```

For new environments (an empty database) only step 3 is needed. Never run `prisma migrate reset` or `db push --force-reset` against production.

## 2. Upstash Redis

* One database for everything. Keep **eviction disabled**: BullMQ data must not be evicted.
* Copy the `rediss://` URL (TLS). Upstash bills per command: each idle service long-polls every 30 s and sends a heartbeat every 30 s, and each Socket.IO instance keeps three connections.

## 3. Realtime server on Render

Render dashboard → **New → Blueprint** → this repository (uses `render.yaml`). Enter `REDIS_URL` and `REALTIME_JWT_SECRET` when prompted, and adjust `CLIENT_URL`. The blueprint also defines the optional paid `interviewai-worker`; skip it if you do not want a background worker.

Manual alternative: Node web service from the repository root, build `npm install -g pnpm@9.0.0 && pnpm install --frozen-lockfile --prod=false --filter ws-server... && pnpm --filter ws-server run build`, start `node --enable-source-maps apps/ws-server/dist/index.js`, health check `/health`.

Check `https://<service>.onrender.com/health`: `"redis":"ready"`, `"tokenSecretConfigured":true`, and `codeExecutorOnline` `true` once the judge runs. Free services sleep after ~15 minutes; the page keeps working (polling) and the socket reconnects when the service wakes.

## 4. Web app on Vercel

Project settings: root directory `apps/web`, framework Next.js, install command `pnpm install --frozen-lockfile`, build command `pnpm build` (Vercel runs it in `apps/web`; Turborepo is not required). Add the variables from the table, then **redeploy** (needed for `NEXT_PUBLIC_WS_URL`).

Route handlers that may call the AI provider set `maxDuration` 45-60 s; on the Hobby plan keep the defaults or the functions may be cut off. Add preview origins to `CLIENT_URL` on Render if you use preview deployments.

## 5. Code judge on a VM

Requirements: Linux x86-64 with Docker, 2+ vCPUs and 4 GB RAM for `EXECUTOR_CONCURRENCY=2` (images take about 3 GB of disk). Free options include Oracle Cloud's always-free VMs; small paid VMs (Hetzner, DigitalOcean, Lightsail) work too. Serverless platforms cannot run it.

On the VM (Ubuntu):

```bash
git clone https://github.com/gopaltiwari04/InterviewAI--Your-AI-Powered-Interview-Companion.git /tmp/interviewai
```

```bash
sudo bash /tmp/interviewai/deploy/code-executor/setup-vm.sh
```

```bash
sudo -u interviewai git clone https://github.com/gopaltiwari04/InterviewAI--Your-AI-Powered-Interview-Companion.git /opt/interviewai
```

```bash
cd /opt/interviewai && sudo -u interviewai pnpm install --frozen-lockfile --filter code-executor... && sudo -u interviewai pnpm --filter code-executor build
```

```bash
sudo nano /etc/interviewai/executor.env
```

Put `REDIS_URL=<same Upstash URL>` (and `SANDBOX_RUNTIME=runsc` if gVisor was installed) in that file, then:

```bash
sudo cp deploy/code-executor/interviewai-executor.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now interviewai-executor
```

```bash
curl -s localhost:8090/health
```

Expect `"docker":true,"redis":"ready"`. Do not expose port 8090 publicly (it only reports status, but there is no reason to). Updating: `git pull`, rebuild, `sudo systemctl restart interviewai-executor` (in-flight jobs finish first, up to 90 s).

For a demo on your own computer instead: start Docker Desktop and run `pnpm --filter code-executor dev` with `REDIS_URL` set to the shared Redis. Judging works only while it runs.

## 6. Evaluation worker (optional)

Render background worker from `render.yaml` (paid plan), or any always-on host:

```bash
pnpm install --frozen-lockfile --filter worker... && pnpm --filter worker build && node apps/worker/dist/index.js
```

or the image `deploy/worker/Dockerfile`. It needs `DATABASE_URL`, `REDIS_URL` and the Gemini key. Avoid running it on the judge VM: that would put database and AI credentials on the host that runs untrusted code.

## Production verification checklist

- [ ] `https://<vercel-app>/api/health` returns `{"status":"ok"}`.
- [ ] `https://<vercel-app>/api/ready` returns `"ready":true` with `database`, `redis`, `codeExecutor` `up` (and `ai` `up` if configured). Signed in, `/api/ready?metrics=1` also shows queue depth and route latency.
- [ ] ws-server `/health` and judge `/health` show the same `redisFingerprint` as the web logs (`redis client created`).
- [ ] Sign in, start a DSA interview: a coding problem with examples and constraints appears, and the header shows **Live**.
- [ ] Run examples, then Submit a correct solution: verdict Accepted, hidden tests show only verdict and time.
- [ ] A follow-up question appears in the AI interviewer tab.
- [ ] Switch tabs for a few seconds: the header shows "Tab hidden 1×".
- [ ] Reload during the interview: code, results and timer are restored.
- [ ] Finish: the report shows "from judge" correctness, AI-assessed dimensions (or a partial-report notice and a Retry button if AI is unavailable), and the integrity timeline.
- [ ] A second account gets a 404 for the first account's interview and report URLs.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "The code judge is offline" | Executor not running, Docker down, or different Redis | Check judge `/health`; compare `redisFingerprint` across services |
| Jobs stay "Queued" forever | Executor uses another Redis or crashed mid-job | Same as above; stuck jobs are retried once (stalled), then failed |
| Header shows "Polling" or "Reconnecting" | `NEXT_PUBLIC_WS_URL` unset or not redeployed, `CLIENT_URL` missing the origin, secrets differ, Render asleep | ws-server logs show `rejected origin` or `connection rejected` with the reason |
| Report stuck on "Evaluating" | No worker and inline evaluation hit the function time limit, or AI errors | It retries/sweeps; the candidate can click Retry; check logs for `evaluation finished` |
| Report says AI evaluation failed | Missing/invalid key, quota, model name | Fix the key or model; Retry evaluation. Judge-based scores are already stored |
| Empty AI replies | A thinking model with `GEMINI_THINKING_BUDGET=0` | Use a Flash model or set a budget such as 1024 |
| `prisma migrate deploy` fails on Neon | Pooled URL used, or the database differs from the baseline | Use the direct URL; run `baseline:check` |
| New API routes return 404 in local dev | Stale Turbopack cache | Stop `next dev`, delete `apps/web/.next`, start again |
| Vercel build cannot find `@repo/*` | Root directory or install command wrong | Root `apps/web`, `pnpm install --frozen-lockfile` |

## Credential rotation (if a secret is ever exposed)

* **Upstash:** database → Details → Reset password, then update `REDIS_URL` on Vercel, Render, the judge VM, the worker and local `.env` files.
* **Neon:** project → Roles → reset the password, then update `DATABASE_URL` on Vercel, the worker and locally.
* **Gemini:** Google AI Studio → API keys → create a new key, update Vercel and the worker, delete the old key.
* **GitHub / Google OAuth:** create a new client secret, update Vercel, revoke the old one.
* **AUTH_SECRET:** `npx auth secret`, update Vercel (signs everyone out).
* **REALTIME_JWT_SECRET:** generate a new value and update Vercel and Render together (open sockets reconnect with new tokens).
