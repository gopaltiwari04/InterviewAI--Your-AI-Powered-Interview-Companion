# Security

This document describes the threat model, the controls that are implemented, and what is still a known risk. "Verified" means covered by an automated test in this repository.

## Threat model

| Actor | Goal | Main controls |
| --- | --- | --- |
| Candidate | See hidden tests or reference solutions, fake a pass, inflate scores | Hidden tests stay server-side and are never returned (verified); stdout/stderr of hidden tests is dropped by the judge (verified); correctness comes only from the judge (verified); scores are computed in code; evidence quotes are checked against the candidate's words |
| Candidate | Escape or abuse the sandbox (network, host files, secrets, fork bombs, resource exhaustion) | Hardened containers on a host that holds only Redis credentials (verified: no network, read-only root, uid 65534, no host env, fork bomb contained, TLE/MLE/OLE enforced and containers removed) |
| Other signed-in user | Read or modify someone else's interview, submissions, report or proctoring data; join their realtime room | Every engine operation loads the room through an ownership/participant check and returns 404 to non-members (verified); WebSocket rooms are assigned from a signed token (verified) |
| Anyone on the internet | CSRF, XSS, abuse of AI/judge endpoints, brute force | Same-origin check on mutating routes (verified), React rendering without HTML injection, rate limits, input size limits, Auth.js sessions |
| Prompt injection via answers or resumes | Make the model ignore the rubric or leak data | Untrusted content is delimited and declared as data, outputs are schema-validated, correctness is not model-controlled, prompts never contain hidden tests or secrets (live test checked an injected "score 10" instruction was not followed) |
| Compromised Redis | Read job data, enqueue arbitrary jobs | Job payloads are validated by the executor; hidden tests are scrubbed from Redis after judging; enqueued code still only runs in the sandbox. Redis should be private, TLS, password protected |

## Authentication and authorization

* Auth.js (NextAuth v5) with GitHub and Google OAuth, JWT session strategy. Debug logging of sessions and tokens that existed before was removed.
* `proxy.ts` only redirects signed-out users for UX; it is **not** the security boundary. Every route handler runs through `lib/server/api.ts#route`, which requires a session, and every engine function re-checks ownership (`loadRoomForActor` / `loadRoomForCandidate`). Non-members receive `404`, so IDs cannot be probed.
* Only the candidate can start, answer, submit code, send proctoring events or finish. Interviewers (joined with an invite link) can view and review proctoring signals but cannot change answers.
* A test-only credentials provider exists for Playwright. It is registered only when `AUTH_TEST_LOGIN=enabled` **and** `NODE_ENV !== "production"`, so it cannot be enabled on a production build.
* Post-login redirects only accept same-site relative paths (no open redirect).

## Web application

* **CSRF:** mutating API routes require an `Origin` matching the host (or a same-origin `Sec-Fetch-Site`); Auth.js cookies are `SameSite=Lax`. Verified by an e2e test (`403` for a foreign origin).
* **XSS:** problem statements and AI text are rendered with React elements (`components/interview/rich-text.tsx` builds elements from a tiny markdown subset; no `dangerouslySetInnerHTML`).
* **Headers:** `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera only for this origin, microphone disabled), and a CSP limited to `frame-ancestors`, `object-src`, `base-uri`, `form-action`. A full `script-src` CSP is future work: Monaco is loaded from jsDelivr and uses workers, and MediaPipe loads WASM and a model from jsDelivr and Google Storage.
* **Input validation:** zod schemas on every body; JSON bodies are size-capped; code ≤ 64 KB; custom input ≤ 16 KB; answers ≤ 8000 characters; proctoring metadata is a strict allow-list.
* **Rate limits** (per user, Redis fixed window with in-memory fallback): interview creation 10/h, submissions 30/min (and at most 3 pending per user), chat 20/min, AI generation 10/h, proctoring 120/min per room, resume upload 5/h, realtime tokens 30/min, evaluation retries 5/h.
* **Errors:** `AppError` messages are written for users; unknown errors return a generic message with a request id, and logs never include stack traces of secrets.
* **Removed:** `/api/debug-db` (exposed the database host), the unauthenticated `/api/chat` route (wrote to any room id) and the unauthenticated `generateReport` server action.

## Realtime server

* Connections need a token signed with `REALTIME_JWT_SECRET` (HS256, 15 minutes, `alg` pinned). The room comes from the token; `join-room` is refused (verified).
* Browser origins must be in `CLIENT_URL`, checked for both polling and WebSocket upgrades (verified).
* Only the candidate's socket may send `code-sync`; messages are size-limited (64 KB) and rate-limited (verified).
* Relayed messages contain ids, status and version only; nothing private is broadcast.

## Code execution

Implemented in `apps/code-executor/src/sandbox.ts` and `judge.ts`:

| Control | Setting |
| --- | --- |
| Separate host process | The web app never runs candidate code; the executor runs on a Docker host and has only `REDIS_URL` |
| Network | `--network none` (verified) |
| Filesystem | `--read-only` root, `tmpfs` `/box` and `/tmp` (64 MB, `nosuid,nodev`), nothing from the host is mounted; files are written over `docker exec` stdin (verified) |
| User and privileges | `--user 65534:65534`, `--cap-drop ALL`, `--security-opt no-new-privileges` (verified uid) |
| Resources | `--memory` = `--memory-swap` (256 MB, 512 MB for Java), `--cpus 1`, `--pids-limit 128`, `nofile` 256, `fsize` 64 MB, no core dumps |
| Time | Per-test `timeout -s KILL` inside the container, an outer watchdog that kills the client and the container, a per-submission budget, and stopping after two time-outs (verified) |
| Output | stdout capped (64 KB); exceeding it kills and removes the sandbox (verified) |
| Cleanup | `docker rm --force` in `finally`, PID 1 is `sleep <lifetime>` so orphans die anyway, stale sandboxes are removed at startup |
| Secrets | The sandbox gets a clean environment (verified with a canary variable) |
| Hidden data | Hidden tests' stdout/stderr are never returned; job data is replaced with a stub in Redis after judging |
| Images | Pinned major versions, overridable per deployment (pin by digest in production) |
| Stronger isolation | `SANDBOX_RUNTIME=runsc` uses gVisor (installed by `deploy/code-executor/setup-vm.sh`) |

**Remaining risks.** Containers share the host kernel; a kernel or runtime vulnerability could allow an escape, which is why the executor host must not hold database credentials or AI keys and why gVisor (or Firecracker/VM-per-job) is recommended for anything beyond a portfolio deployment. Running the executor itself in Docker with `/var/run/docker.sock` mounted (the optional compose profile) gives that container root-equivalent control of the host; production should use the systemd unit instead. CPU-time is bounded per test, but a determined attacker can still use the sandbox's CPU share for the duration of their time limit.

## Proctoring privacy

* Camera access is optional, requested only after the candidate opts in at setup, reads the explanation in the lobby, ticks consent and clicks "Set up camera". Denial is respected: no retries or background requests (verified).
* Face detection (MediaPipe BlazeFace) runs entirely in the browser. No video, images or embeddings are uploaded or stored. There is no identity recognition, gaze tracking or emotion analysis.
* Stored events: type, server-clamped start/end, duration, server-computed severity, and small allow-listed metadata (face count, detector name, whether an interval was closed after a reload).
* Grace periods (5 s without a face, 3 s with multiple faces) and severity thresholds avoid flagging blinks or brief glances. Reports call these "signals for review" and state that they are not evidence of misconduct.
* Media tracks are stopped when the interview ends, the candidate turns the camera off, or the component unmounts.
* Recording is **not** implemented. Any future recording would need separate explicit consent, access controls, a retention policy and a privacy review.

## Data retention

* Interviews, answers, code, chat, reports and proctoring events are kept until the account or interview is deleted (cascade deletes are defined in the schema). There is no automatic purge yet; add a scheduled job if you need a retention window.
* Resumes: the uploaded file and the extracted raw text are discarded after structuring; only the reviewed profile (summary, skills, projects, experience) is stored, and the user can delete it.
* Redis: judge results are kept 24 h, evaluation job records 7 days, hidden test data is scrubbed when a job finishes, code-sync snapshots expire after 2 h.

## Secret management

* All secrets come from environment variables, validated at startup (`packages/engine/src/env.ts`, `apps/code-executor/src/config.ts`); `.env` files are git-ignored and `.dockerignore` keeps them out of images (verified that the built image contains no `.env`).
* Logs pass through a sanitiser that redacts secret-looking keys and strips credentials from URLs; services log a Redis *fingerprint* (hash of host/port/db) so mismatched Redis instances are easy to spot without printing the URL.
* `scripts/check-client-bundle.mjs` (run in CI) fails if hidden-test inputs, reference solutions, rubric text, Google API keys, credentialed connection strings or private keys appear in the client bundle.
* Where each secret lives is listed in [DEPLOYMENT.md](../DEPLOYMENT.md#environment-variables). Rotation steps are in the same file.

## Audit findings fixed in this revision

1. WebSocket server accepted any client into any room and let any client queue code (now token-authenticated, server-assigned rooms; code runs only via the authenticated API).
2. Timed-out executions killed only the `docker` CLI process; the container kept running (now `timeout -s KILL` in the container, watchdog plus forced removal).
3. Sandboxes ran as root with a writable bind mount of a host directory and no PID limit (now non-root, read-only, tmpfs only, PID/file/fd limits).
4. Report page and chat API had no ownership checks; the report server action could be called for any room.
5. `/api/debug-db` exposed the database host; session and JWT callbacks logged user data.
6. Interview rooms were created by a `GET` page render (side effect on navigation, CSRF-able); creation is now an authenticated, same-origin `POST`.
7. The executor and ws-server local `.env` files pointed at **two different Redis instances**, so queued jobs could never reach the worker. Services now log a Redis fingerprint at startup; set the same `REDIS_URL` everywhere.

## Known limitations

* Browser APIs cannot detect a second device, a second monitor, or another person off camera. Tab-visibility events cannot distinguish a notification from a search.
* Face detection accuracy varies with lighting, camera quality, skin tone, glasses and head coverings; that is why it only produces review signals.
* The in-memory rate-limit fallback is per serverless instance.
* `pnpm audit` and gitleaks run in CI, but there is no SAST tool or penetration test.
* Gemini receives candidate answers, code and the reviewed resume profile. Tell users this in your privacy notice.
