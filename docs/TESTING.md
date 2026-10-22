# Testing

All commands run from the repository root in PowerShell unless noted. Suites are split by what infrastructure they need.

| Suite | Command | Needs | What it covers |
| --- | --- | --- | --- |
| Lint | `pnpm lint` | — | ESLint (zero warnings) in every package |
| Types | `pnpm check-types` | — | `tsc --noEmit` everywhere, Next.js route types |
| Unit | `pnpm test` | — | codec, comparators, harness codegen, lifecycle transitions, adaptive policy, rubric scoring, evidence verification, proctoring severity and time clamping, realtime tokens, log redaction, Redis URL parsing, AI retries/fallback/JSON validation, AI-problem static validation, resume file-type detection, executor config and job validation, problem bank completeness and secrecy |
| Problem bank | `pnpm verify:problems` | Python 3.12 (`PYTHON_BIN` if not `python`/`python3`) | Runs both reference solutions of all 52 problems through the real harness, requires agreement and correct examples, checks the dataset is up to date |
| Integration | `pnpm test:integration` | PostgreSQL + Redis | Full DSA interview via the engine (create, start, draft, run, submit, idempotency, invalid/oversized submissions, follow-up, explanation, completion, evaluation), authorization (404 for other users on every resource), proctoring ingestion (server severity, duplicates, backdated/future/malformed events, camera events when proctoring is off), adaptive step-up/step-down, evaluation fallback and safe retry; realtime server auth and room isolation |
| Judge | `pnpm test:docker` | Docker | Real sandbox: accepted solutions in all 5 languages, wrong answer, compile errors with correct line numbers (C++, Java), runtime errors, hidden output privacy, TLE kill + cleanup, MLE, OLE, no network, read-only root, non-root, no host env, fork bomb, custom input, file allow-list; plus the slow harness suite (every type in every language, every starter compiles) |
| Browser | `pnpm test:e2e` | Full local stack | Sign in, choose DSA, real problem rendered, run (wrong) and submit (correct) code, hidden results private, follow-up question, reload restores state, finish and read report; camera consent gating, live preview with a fake camera, permission denial without retries, tab hidden/returned recorded with server duration; another user gets 404; cross-site POST rejected; unauthenticated API rejected |
| Client bundle | `node scripts/check-client-bundle.mjs` | `pnpm --filter web build` first | No hidden tests, reference solutions, rubric text or secrets in browser JavaScript |
| Live AI (optional) | see below | Gemini key (+ local stack for problem generation) | Real Gemini completion, schema-valid evaluation that ignores an injected instruction, AI problem admitted only after sandbox validation |
| Load | `pnpm load:test -- --users 10` | Full local stack | API latency, socket success/latency, judge queue wait and processing time, errors |

## One-time local setup

```powershell
docker compose up -d postgres redis
```

```powershell
docker exec interviewai-postgres-1 psql -U admin -d postgres -c "CREATE DATABASE interview_ai_test"
```

```powershell
$env:DATABASE_URL="postgresql://admin:password@localhost:5432/interview_ai_test"; pnpm --filter @repo/database migrate:deploy
```

The integration suite refuses to run against a database whose name does not contain `test`, and it truncates that database. It uses Redis database 5 (and 6 for the realtime test) and flushes it. Override with `TEST_DATABASE_URL` / `TEST_REDIS_URL`.

## Running the full stack for browser and load tests

Use a separate dev database (`interview_ai_dev`) and point every service at the same local Redis. In four PowerShell windows:

```powershell
$env:REDIS_URL="redis://localhost:6379/2"; $env:REALTIME_JWT_SECRET="local-dev-realtime-secret-local-dev-realtime-secret"; $env:CLIENT_URL="http://localhost:3000"; pnpm --filter ws-server dev
```

```powershell
$env:REDIS_URL="redis://localhost:6379/2"; pnpm --filter code-executor dev
```

```powershell
$env:DATABASE_URL="postgresql://admin:password@localhost:5432/interview_ai_dev"; $env:REDIS_URL="redis://localhost:6379/2"; $env:AI_PROVIDER="mock"; pnpm --filter worker dev
```

```powershell
$env:DATABASE_URL="postgresql://admin:password@localhost:5432/interview_ai_dev"; $env:REDIS_URL="redis://localhost:6379/2"; $env:REALTIME_JWT_SECRET="local-dev-realtime-secret-local-dev-realtime-secret"; $env:NEXT_PUBLIC_WS_URL="http://localhost:8080"; $env:AUTH_TEST_LOGIN="enabled"; $env:AI_PROVIDER="mock"; pnpm --filter web dev
```

Environment variables set in the shell override `apps/*/.env`, which matters because your local `.env` files may point at production services. Then:

```powershell
pnpm test:e2e
```

```powershell
pnpm load:test -- --users 10
```

The first browser run downloads Chromium: `pnpm --filter web exec playwright install chromium`. Set `E2E_BASE_URL` to test a different host (default `http://localhost:3000`); only point it at a disposable environment with `AUTH_TEST_LOGIN` enabled.

## Optional real-provider test

```powershell
$env:RUN_LIVE_AI="1"; $env:GOOGLE_GENERATIVE_AI_API_KEY="<your key>"; $env:AI_PROVIDER="gemini"; $env:DATABASE_URL="postgresql://admin:password@localhost:5432/interview_ai_dev"; $env:REDIS_URL="redis://localhost:6379/2"; pnpm --filter @repo/engine exec vitest run --config vitest.live.config.ts
```

It makes a handful of API calls. The problem-generation case also needs the code executor running.

## Results recorded for this revision

Environment: Windows 11, Intel Core i5-11320H (4 cores / 8 threads), 16 GB RAM, Docker Desktop 28.3 (WSL2 backend, 8 CPUs / 12.5 GB), Node 22.14, PostgreSQL 15 and Redis 7 in local containers, AI provider `mock` unless noted.

| Suite | Result |
| --- | --- |
| Lint / types | 0 warnings, 0 errors (all packages) |
| Unit | 158 passed (core 35, problem bank 108, engine 11, executor 4) |
| Problem bank verification | 52/52 problems verified, dataset reproducible (`--check` passes) |
| Integration | engine 21 passed; realtime 6 passed |
| Judge (Docker) | 17 passed; harness suite 6 passed (all 10 types × 5 languages, all 52 starters compile/parse) in about 9 minutes |
| Browser (Playwright, Chromium) | 6 passed |
| Client bundle check | no server-only markers or secrets found (positive control: markers present in server chunks) |
| Live Gemini (`gemini-2.5-flash`) | completion ok; evaluation schema-valid, injected instruction not followed; AI problem "Vowel and Consonant Count" generated and admitted after sandbox validation |

### Load test (10 concurrent virtual users, executor concurrency 2, `next dev`)

| Metric | p50 | p95 | Errors |
| --- | --- | --- | --- |
| `POST /api/interviews` | 227 ms | 379 ms | 0 |
| `POST /start` | 383 ms | 437 ms | 0 |
| `POST /submissions` (enqueue) | 225-324 ms | 349-1488 ms | 0 |
| `GET /submissions/:id` (646 polls) | 91 ms | 365 ms | 0 |
| Socket connect (10/10 succeeded) | 31 ms | 35 ms | 0 |
| Socket relay latency (Redis publish to client) | 1 ms | 17 ms | 0 |
| Sample run end-to-end (3 tests) | 20.0 s | 34.8 s | 0 |
| Submission end-to-end (12 tests) | 52.8 s | 62.0 s | 0 |
| Judge queue wait (last 20 jobs) | 40.3 s | max 49.8 s | — |
| Judge processing per job | 12.3 s | max 13.9 s | — |
| Chat (mock AI) | 123 ms | 208 ms | 0 |

Interpretation: the API and realtime layers were nowhere near saturation; the judge was the bottleneck. With two sandboxes in parallel, ten users submitting at once wait for each other. Most of the per-job time on this machine is Docker Desktop's overhead per `docker exec` on Windows (about 1 s per test), not the programs themselves. These numbers describe this laptop only; Linux hosts were not measured. To scale judging, raise `EXECUTOR_CONCURRENCY` on a host with more cores or run more executor instances against the same queue. The next optimisation would be running all tests of a submission from one in-container runner to avoid per-test `docker exec` overhead.

## Known test limitations

* Camera tests use Chromium's fake camera; MediaPipe needs network access to load its model, so face-event assertions depend on that. Real-camera behaviour was not automated.
* Tab switching in the browser test is simulated by overriding `document.visibilityState`; a real tab switch was verified manually in the built-in browser (6.3 s `TAB_HIDDEN`, severity LOW).
* The e2e suite runs against `next dev` because the test login is disabled in production builds.
* The harness suite is slow on Windows; CI runs it weekly and on demand.
