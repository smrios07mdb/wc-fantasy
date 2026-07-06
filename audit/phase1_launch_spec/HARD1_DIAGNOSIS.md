# HARD-1 Diagnosis — verify-current-state pass

**Date:** 2026-07-06 · **Verified against:** `origin/main @ a76ab76` · **Class:** read-only diagnosis (no fixes designed here)

Purpose: re-derive each HARD-1 observability finding from `AUDIT_LAUNCH_readiness.md` against the current
tip, so the eventual fix thread opens against verified ground instead of the audit's stale line numbers.
Every claim below comes from a live grep/read at `a76ab76`, not from the audit's wording.

Out of scope by brief: F-A07 / F-A07-pin (HARD-2 / operator-dashboard follow-up). No connection-limit
content here.

## Verdict table

| Finding | Audit claim (condensed) | Verdict | Evidence at current tip |
| --- | --- | --- | --- |
| F-A01 | No error-tracking / structured-log shipping anywhere; web API routes have no try/catch + logging | **STILL OPEN** | Vendor grep zero runtime hits; routes unchanged (see §F-A01) |
| F-A02 | Resident worker has no dead-man switch; heartbeat exists only for the period-close cron | **STILL OPEN** (INV-4b does NOT close it) | `index.ts` / `scheduler.ts` emit no liveness ping (see §F-A02) |
| F-A03 | `scheduler.swept` is `log.debug`, suppressed at prod `LOG_LEVEL=info`; no dirty-backlog gauge | **STILL OPEN** (line drift only) | `scheduler.ts:224`, `render.yaml:39-40` (see §F-A03) |
| F-A04 | Existing detection signals (poller-silent, recompute failures, foreign-row skips, malformed-feed skips) are log-only; nothing wired to an alert channel | **STILL OPEN** (one caveat resolved by INV-4b) | All four signals still terminate at log lines (see §F-A04) |
| F-A05 | Commissioner inline re-score path swallows engine failures silently | **STILL OPEN** (note-only per brief; Sergio's call) | Bare `catch {}` at `handleStatCorrection.ts:158`; same pattern in `handleRosterRepair.ts` (see §F-A05) |
| F-A09 / F-A16 | `healthCheckPath` points at static `/api/health`; real readiness probe `/api/db-check` exists but is unwired | **STILL OPEN** | `render.yaml:57` unchanged; `db-check` referenced nowhere (see §F-A09-A16) |

No finding in HARD-1 scope has been closed or partially closed by INV-4b or any later commit. The only
state change since the audit is that INV-4b confirmed the period-close cron's Healthchecks.io URLs are
actually set — which narrows one _caveat_ inside F-A04 and changes nothing in F-A02.

## Per-finding evidence

### F-A01 · No error-tracking / structured-log shipping — STILL OPEN

- Vendor grep (`sentry|datadog|newrelic|opentelemetry|rollbar|bugsnag|logtail|pino|winston|prometheus`,
  case-insensitive) across `apps/` + `packages/` source (`*.ts`, `*.tsx`, `*.js`, `*.json`, node_modules
  excluded): **zero hits**. Same result as the audit; docs/prompts hits are outside runtime source.
- Worker's only log sink is still console: `apps/worker/src/logger.ts:10-12` — single-line JSON via
  `console.log` / `console.error`, nothing shipped anywhere.
- Web API routes still call handlers with no surrounding try/catch and no logging import:
  - `apps/web/app/api/faab/bid/route.ts:95,102,109` — `await handleSubmitBid/handleEditBid/handleCancelBid(deps(), body)` bare.
  - `apps/web/app/api/lineup/route.ts:44` — `await handleSetLineup(...)` bare.
  - `apps/web/app/api/draft/pick/route.ts:33` — `await handleDraftPick(...)` bare.
  - The only `catch` in each file is `.catch(() => null)` on `request.json()` (body-parse guard, not
    error handling). Grep for `import.*log` across all three routes: zero hits.
- A handler/store throw (DB down, pooler exhausted) still becomes an opaque Next.js 500 with no
  structured record.

### F-A02 · Resident worker has no dead-man switch — STILL OPEN (the drift-sensitive one)

**Explicit separation from INV-4b:** INV-4b closed the _period-close cron_ heartbeat — `jobs/heartbeat.ts`
wired at `jobs/periodClose.ts`, Healthchecks.io live as of 2026-07-05. That is a **separate process**
(hourly cron service) from the resident worker. The cron's heartbeat cannot observe a dead resident
worker, and this diagnosis does **not** report F-A02 as closed on the strength of the cron switch.

State of the long-running scheduler tick today: **it has no external heartbeat of any kind.**

- Grep `heartbeat|ping(` across `apps/worker/src` (tests excluded): every hit is in
  `jobs/heartbeat.ts` itself or its sole consumer `jobs/periodClose.ts` (`import` at `periodClose.ts:35`,
  URLs read at `periodClose.ts:45`). Neither `apps/worker/src/index.ts` nor
  `apps/worker/src/scheduler.ts` imports or calls it — `scheduler.ts:1-21` import block contains no
  heartbeat module.
- The resident process (ingestion tick, live poll, lock stamping, `runRecomputeSweep`) therefore still
  emits no liveness signal to any external monitor. `index.ts:56-59` handles `uncaughtException` by
  logging + exiting (Render restarts it, silently); a **hung** event loop is covered by nothing.
- (Adjacent, already catalogued as F-A10, not in this brief's scope: still no
  `process.on("unhandledRejection")` — `index.ts` registers exactly SIGINT/SIGTERM/uncaughtException at
  lines 54-56.)

### F-A03 · Recompute telemetry suppressed at LOG_LEVEL=info; no dirty-backlog gauge — STILL OPEN

- `log.debug("scheduler.swept", { ...result })` — now at `apps/worker/src/scheduler.ts:224` (audit said
  219; pure line drift, same code).
- `apps/worker/src/logger.ts:8` still drops any level below `config.logLevel`, and `render.yaml:39-40`
  still sets `LOG_LEVEL=info` on the shared env group — `scheduler.swept` is never printed in prod.
- The only recompute signal surviving at info is still the failure warn, now
  `log.warn("recompute.player_match.failures", ...)` at `scheduler.ts:227-228` (audit said 222-224).
- No dirty-backlog gauge exists: grep `backlog|countDirty` across `packages/recompute/src` (tests
  excluded) returns **zero hits** — the sweep still only consumes via its `listDirty*`/`claimDirty*`
  path; nothing counts what's piling up.

### F-A04 · Detection signals are log-only, no alert channel — STILL OPEN

All four signals named by the audit still exist and still terminate at a log line:

- Poller-silent: `log.warn("poller.silent", ...)` at `apps/worker/src/scheduler.ts:146` (audit: 141;
  drift). Still keyed off the in-process `lastLivePoll` Map (`scheduler.ts:62`), which still resets on
  every worker restart, so a crash-loop still silently re-arms it.
- Recompute failures: `scheduler.ts:227-228` warn (above).
- Foreign-row skips: `packages/ingest/src/ingest.ts:205-206` (`[ingest.live.foreign_skipped]`
  `console.warn`; same guard repeated for the settle path around line 230).
- Malformed-feed-item skip: `ingest.ts:47` `console.error`.

Alert wiring: still none for the resident worker or the group-standings cron. The only outbound hooks in
the IaC remain `PERIOD_CLOSE_HEARTBEAT_URL` / `PERIOD_CLOSE_ATTENTION_URL` (`render.yaml:177,179`,
`sync: false`), scoped to the period-close cron only.

**INV-4b caveat resolved:** the audit hedged that those two URLs were "likely unset (dashboard fact I
cannot see)". INV-4b's closure (Healthchecks.io live, 2026-07-05) confirms they ARE set — so the one
dead-man switch that exists is armed. That resolves the caveat for the **cron only**; the finding's core
(worker/ingest signals routed nowhere) is untouched. Verdict stays open.

### F-A05 · Commissioner re-score path swallows engine failures — STILL OPEN (note only)

Per brief: current state reported, no fix scoped — this one is flagged Sergio's-call.

- `fireRescore` still wraps the sync re-score in a bare `catch {}` at
  `apps/web/src/commish/handleStatCorrection.ts:154-161` (the `catch` at line 158), downgrading to a 200
  `restatePending` warning with **no server-side log** of the underlying error.
- The same swallow pattern still exists in the repair path: `apps/web/src/commish/handleRosterRepair.ts:138`
  (audit-write catch → `audit_pending`) and `:144` (restate catch → `restatePending = true`, error
  discarded). The restate it fires is `createCommishRestate` (`commishRepairStore.ts:124-135`), still the
  only path that recomputes a frozen period (`allowFrozen: true`) — repeated silent failure still leaves
  the leaderboard stale with zero operator signal.

### F-A09 / F-A16 · Readiness probe unwired — STILL OPEN {#f-a09-a16}

- `render.yaml:57` still reads `healthCheckPath: /api/health`.
- `apps/web/app/api/health/route.ts:6-8` still returns static `NextResponse.json({ ok: true })` — the
  file's own comment: "Liveness probe. No dependencies."
- `apps/web/app/api/db-check/route.ts:14-39` still implements the real readiness probe: `SELECT 1`
  (connectivity, 503 `db: "down"` on failure) then `prisma.league.count()` (schema/right-DB check, 503
  `db: "up", schema: "missing"` on failure).
- `db-check` is referenced **nowhere** outside its own route file: grep across `render.yaml` (zero hits)
  and `apps/web` source (only `app/api/db-check/route.ts` itself). A wrong-DB or schema-skew deploy is
  still promoted "healthy" with no auto-rollback signal (F-A16), and a web instance that loses Postgres
  still passes Render's health check (F-A09).

## Open design questions for the fix thread (not designed here)

Per the brief's stop condition, these are judgment calls noted and left open:

1. **F-A01 vendor choice** — Sentry vs. Render log streams vs. something lighter; and whether web-route
   coverage is a wrapper around each handler call or Next.js instrumentation.
2. **F-A02 heartbeat shape** — per-tick ping vs. interval ping from the scheduler loop; which failure
   grace window; whether it reuses `jobs/heartbeat.ts`'s `ping()` (which is transport-ready and
   URL-from-env already) with a new worker-scoped env var.
3. **F-A03 level vs. sink** — promote `scheduler.swept` to info vs. add a metrics sink; whether the
   dirty-backlog gauge is a count query per tick (cost on the hot path) or sampled.
4. **F-A09/F-A16 liveness-vs-readiness tension** — pointing `healthCheckPath` at `/api/db-check` makes a
   transient DB blip restart/recycle the web service; the audit itself flags this. Wiring choice (swap
   the path vs. fold db-check into /api/health vs. separate startup gate) is a design decision.
5. **F-A05** — explicitly Sergio's call; nothing scoped.

## HOLD

Implementation of any HARD-1 fix remains gated on explicit mid-tournament deploy authorization plus a
match-free window. This diagnosis unblocks nothing on its own; it is the verified baseline the fix
thread consumes.
