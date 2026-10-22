# InterviewAI

A technical interview practice platform with real coding problems, a sandboxed multi-language code judge, an AI interviewer that asks follow-up questions, structured rubric-based evaluations, optional camera proctoring and progress analytics.

Live site: https://interviewai-nine-theta.vercel.app/ (it runs whatever was last deployed; the features below are in this repository and must be deployed as described in [DEPLOYMENT.md](./DEPLOYMENT.md)).

## Features

**Interview modes.** DSA/coding, technical knowledge, behavioral (STAR) and mixed. The candidate chooses language, starting difficulty, duration and topics; the interview follows an explicit `CREATED -> IN_PROGRESS -> COMPLETED` lifecycle with a server-enforced deadline.

**Real coding interviews.**
* 52 curated problems across 14 topic areas (12 easy, 31 medium, 9 hard), each with a statement, input/output description, constraints, examples, starter code in Python, JavaScript, C++, Java and C, and 6-10 hidden tests.
* Every problem is verified by running two independently written reference solutions (JavaScript and Python) through the real harness; they must agree on every test and reproduce every example.
* Run against examples, run custom input, or submit for hidden-test evaluation. Verdicts distinguish accepted, wrong answer, compilation error (with the candidate's line numbers), runtime error, time/memory/output limits.
* Hidden tests and reference solutions never leave the server (unit, integration and e2e tests plus a client-bundle scan check this).
* Optional AI-generated problems, admitted only if their reference solution passes their own tests in the sandbox; otherwise a bank problem is used and the reason is shown.

**AI interviewer and evaluation.**
* Interviewer chat grounded in the problem, the candidate's code and the judge's verified results; automatic follow-up questions after a submission or written answer (curated fallbacks without AI).
* Rubrics per question type. Correctness comes only from the judge; the model scores the other dimensions with verbatim evidence, quotes that do not match the candidate's words are removed, and totals are computed in code.
* zod-validated JSON, bounded retries with backoff and a fallback model, timeouts, and a partial judge-based report with a safe Retry when the provider fails. Rubric version and model id are stored.

**Adaptive interviews and resumes.** A transparent rules-based policy adjusts difficulty and topic from hidden-test pass rates and answer coverage, and shows why each question was chosen. Optional resume upload (PDF/text, 2 MB) produces a reviewed profile used for grounded questions; the file is not stored.

**Proctoring (optional, consent-based).** Tab visibility tracking for every interview; camera face-presence checks in the browser with MediaPipe (no video uploaded or stored), grace periods, server-side severity and timestamp validation, and a neutral integrity timeline that never declares cheating.

**Collaboration and realtime.** Authenticated Socket.IO rooms (signed short-lived tokens, server-assigned rooms), presence, shared timer, live submission and state updates, read-only live code view for invited interviewers, reconnection with full state recovery and a polling fallback.

**Dashboard.** Interview history with pagination, scores over time, scores by skill, topic pass rates, weak topics and practice recommendations, all from the signed-in user's own records.

**Operations.** Structured JSON logs with request IDs and secret redaction, health and readiness endpoints for every service, queue metrics, per-route latency/error counters, rate limits, graceful shutdown, Redis-outage tolerance, CI with lint, types, tests, Docker judge tests, Playwright, dependency audit and secret scanning.

## Architecture

```mermaid
flowchart LR
  B[Browser] -->|HTTPS| W[apps/web on Vercel]
  B -->|WebSocket + token| S[apps/ws-server on Render]
  W --> P[(PostgreSQL)]
  W --> R[(Redis / BullMQ)]
  S --> R
  E[apps/code-executor on a Docker VM] --> R
  E --> D[[hardened sandbox containers]]
  K[apps/worker, optional] --> R
  K --> P
  W --> G[[Gemini]]
  K --> G
```

Details, sequence diagrams, the job lifecycle and the sandbox model: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md). Security: [docs/SECURITY.md](./docs/SECURITY.md). Tests and measured results: [docs/TESTING.md](./docs/TESTING.md).

## Tech stack

Next.js 16 (App Router, React 19, TypeScript, Tailwind, shadcn/ui, Monaco, Recharts) · Auth.js v5 · Prisma 5 + PostgreSQL · Redis + BullMQ · Socket.IO with the Redis adapter · Docker sandboxes (optional gVisor) · Vercel AI SDK + Gemini · MediaPipe Tasks Vision · zod · Vitest · Playwright · Turborepo + pnpm · esbuild for Node services · GitHub Actions.

```text
apps/
  web/            Next.js app: pages, API routes, proctoring client, Playwright tests
  ws-server/      Socket.IO realtime server
  code-executor/  Sandboxed judge (BullMQ consumer, Docker)
  worker/         Evaluation worker and sweeps
packages/
  core/           Shared domain logic (codec, harness generators, lifecycle, rubrics, proctoring rules, tokens, logger)
  problem-bank/   Curated problems, hidden tests, references, question banks (server only)
  engine/         Service layer shared by web and worker (server only)
  database/       Prisma schema, migrations, client
deploy/           Dockerfiles, systemd unit and VM setup for the judge
scripts/          Bundler, load test, client-bundle check
```

## Local setup (Windows PowerShell)

Prerequisites: Node 22, pnpm 9, Docker Desktop, Python 3.12 (only for regenerating the problem dataset).

```powershell
pnpm install
```

```powershell
docker compose up -d postgres redis
```

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local` (database, Redis, secrets; see the comments in the file). `.env.local` overrides `.env`, which is useful if your `.env` points at production. Then create and migrate a local database:

```powershell
docker exec interviewai-postgres-1 psql -U admin -d postgres -c "CREATE DATABASE interview_ai_dev"
```

```powershell
$env:DATABASE_URL="postgresql://admin:password@localhost:5432/interview_ai_dev"; pnpm db:migrate
```

Start the services (one window each; exact commands with every variable are in [docs/TESTING.md](./docs/TESTING.md#running-the-full-stack-for-browser-and-load-tests)):

```powershell
pnpm --filter ws-server dev
```

```powershell
pnpm --filter code-executor dev
```

```powershell
pnpm --filter worker dev
```

```powershell
pnpm --filter web dev
```

Open http://localhost:3000. For local sign-in without OAuth apps set `AUTH_TEST_LOGIN=enabled` (development only).

## Testing

```powershell
pnpm lint; pnpm check-types; pnpm test
```

```powershell
pnpm verify:problems
```

```powershell
pnpm test:integration
```

```powershell
pnpm test:docker
```

```powershell
pnpm test:e2e
```

See [docs/TESTING.md](./docs/TESTING.md) for what each suite needs and the latest results.

## Deployment

Vercel (web), Render (realtime server, optional worker), a Linux VM with Docker (judge), Neon PostgreSQL and Upstash Redis. Variable placement, the one-time migration baseline for the existing database, and a verification checklist are in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Adding a problem

Add a `ProblemDefinition` in `packages/problem-bank/src/problems/` with a statement, typed signature, examples, a hidden-test generator and two independent reference solutions, then run `pnpm --filter @repo/problem-bank build:dataset`. The build fails if the references disagree or an example is wrong.

## License

MIT
