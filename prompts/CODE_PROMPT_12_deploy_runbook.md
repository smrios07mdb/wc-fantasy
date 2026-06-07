# Claude Code — Prompt 12: Render deployment (IaC) + launch runbook — go-live mechanics

> Paste into Claude Code with the four brain files at repo root (`PROJECT.md`, `ARCHITECTURE.md`,
> `DECISIONS.md`, `SCORING.md`) and **Prompts 01–11 merged to `main`**. **Branch off `main`.**
> **DECISIONS.md → Theme E ("Architecture & Stack" → Stack & hosting / Real-time / Ingestion / Auth,
> §354–420) is the spec for the service topology;** the recorded **"Env / deploy facts" (§574–578)**
> plus the **Supabase pooler strings** are the env contract; **ARCHITECTURE.md** (the build-ready spec
> Theme E points to) is the **worker-runtime / scheduler-mode** reference; the **"Mock-draft session"
> Realtime-AUTH learning (§558–563)** is the proven smoke procedure (reuse, do **not** reinvent). The WC
> opens **June 11** — this is the **launch-gating** thread. It is **config + a guard assertion + docs**:
> **no app-logic / engine / recompute / standings / auth / scoring / draft / vsfield churn.**

---

## Context (read first)
Read **DECISIONS.md → Theme E** "Stack & hosting" + "Persistence" + "Real-time" + "Ingestion" + "Auth"
(§354–420 — the Render Web Service + Background Worker + Cron + isolated scraper topology, the
worker-as-draft-controller, the polling ingestion modes), the recorded **"Env / deploy facts"**
(§574–578 — `NEXT_PUBLIC_*` are **build-time/inlined**; `draft`/`draft_pick` already in
`supabase_realtime`), the **"Mock-draft session" Realtime-AUTH learning** (§558–563 — RLS-gated
`postgres_changes` deliver **only** when the socket carries the **user JWT**; presence/broadcast mask
the gap — the exact draft-room bug), **Theme G** rosters bootstrap (§508–527 — the seed step; boot +
~daily, `WORKER_ROSTERS_SYNC_EVERY_TICKS` default `1440`), **Theme F** (the server connects as the
table-owning role and **bypasses RLS — it is the only writer**; the service-role key bypasses too), and
the **Prompt-11 SECDEF learning** (Theme F tail). Then **ARCHITECTURE.md** for the worker scheduler
design (schedule-sync → pre-match lineup pull → live poll → settle).

**Before writing anything, inspect the repo:** the monorepo layout (Prompt 01 scaffold), `apps/web`
(the Next.js app), the **worker service** (the draft controller + ingestion scheduler — **confirm its
app/package path**), `apps/scraper` (the isolated Playwright scraper), the build/start scripts, the
app's **env validation/schema** (Prompt 01/07), and **any existing `render.yaml` / Dockerfiles /
release scripts**. **Extend what exists; do not duplicate.**

State of the build (all on `main`): the app, the worker, and the scraper are built; the **draft is
live-smoke-proven** against a real Supabase (the mock-draft session); **auth + RLS + scoring + standings
+ BALLDONTLIE ingestion + the vs-the-field screen** are merged. **Known non-blocking seam:**
`loadSofaIndex` returns `[]` — the scraper deploys, but **ratings fall back to BALLDONTLIE through the
group stage** (per memory), so it does **not** gate launch. Deferred live checks: the draft Realtime
path is proven; the **vsfield JWT-`postgres_changes`** check folds into the GOAT-trial ingestion smoke
(below).

Guiding constraint, non-negotiable: **"boring and reliable" over clever** — Infrastructure-as-Code over
click-ops, the well-trodden Render defaults, secrets never committed. The brain files win where this
prompt disagrees. If a detail is ambiguous (an env key's owning service, the migrate command/script
name, the worker/cron split, the runbook file location), leave a `// TODO(confirm):` / a `TODO(confirm):`
note in the doc — **do not invent**.

## Scope of THIS prompt — four pieces

1. **Render Blueprint (`render.yaml`) — IaC for the locked service topology.** Per Theme E §372:
   - **Web Service** — the Next.js app.
   - **Background Worker (resident)** — the **draft controller** (the server-authoritative tick /
     `pick_deadline_at` autopick) **+ the ingestion scheduler** (schedule-sync → pre-match → ~60s live
     poll → settle). The draft tick + the live poll need a **resident** process — **not** cron-only.
   - **Cron Job(s)** — add **only** if ARCHITECTURE.md's worker design **externalizes** a mode to cron
     (e.g. a daily roster re-pull) rather than self-scheduling it via `WORKER_ROSTERS_SYNC_EVERY_TICKS`.
     **Confirm against the worker's actual scheduler implementation; do not impose a split it doesn't
     use** (`TODO(confirm):` if unclear).
   - **Scraper Worker** — the isolated `apps/scraper` (Playwright) service.
   - One repo, **one build**; env via a **shared env group**. **Secrets referenced by key with
     `sync: false`** (set in the Render dashboard, **never committed**). Size instances to the
     documented **~$14 baseline**; exact plan tiers are a dashboard/billing choice (**Sergio's**).

2. **The env contract + the migrate/runtime pooler split (load-bearing).**
   - **`DATABASE_URL` = the transaction pooler (port `6543`)** — app + worker **runtime**.
   - **`DIRECT_URL` = the session pooler (port `5432`)** — **`prisma migrate deploy`** + introspection
     (the transaction pooler **cannot** carry migrations).
   - **`prisma migrate deploy` runs as a pre-deploy / release step** (Render `preDeployCommand` on the
     web service, or a dedicated release command — use whatever the repo/Render setup prefers), **once
     per release before the new version serves**, against **`DIRECT_URL`**. Confirm the exact
     migrate script/pnpm-filter name against the repo (`TODO(confirm):`).
   - **`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` are build-time** on the web service
     (inlined at build — recorded fact §575).
   - **Worker env:** `WORKER_ROSTERS_SYNC_EVERY_TICKS` (default `1440`) + whatever the scheduler modes
     and the BALLDONTLIE client read.
   - **Reconcile every env key in `render.yaml` against the app's env schema** (Prompt 01/07): the
     deploy keys must be a **superset** that satisfies it, each on the **correct service** and the
     **correct build-vs-runtime** placement. `TODO(confirm):` on any ambiguous placement.

3. **Deploy-safety: the service-role `server-only` guard.** Before shipping a production build whose
   worker/server env carries the **Supabase service-role key** (it **bypasses RLS** — Theme F), confirm
   the **service-role admin client module** carries `import "server-only"` (or the repo's equivalent
   server/client boundary guard) so it can **never** be pulled into a client bundle and leak an
   RLS-bypassing key to the browser. If present, **assert it** (a grep/test that the module imports the
   guard and is unreachable from any client entrypoint); if absent, **add the guard**. *(This is one of
   the two flagged pre-admin items and it is squarely deploy-safety. The **other** — the dual-key
   manager lookup possibly resolving to two managers — is **admin-surface, OUT of this thread**.)*

4. **The launch runbook** (e.g. `docs/RUNBOOK.md`, or where the repo keeps ops docs — `TODO(confirm):`
   the location). The ordered, copy-pasteable go-live sequence **Sergio executes**. **Code authors the
   doc; Code does NOT provision, enter/commit secrets, or toggle dashboards.** Sections, in order:
   - **(a) Provision** the Render services from the Blueprint.
   - **(b) Bind secrets** — a **table**: every env key → which service → **build-time vs runtime** →
     source (Supabase dashboard / BALLDONTLIE / generated). **Call out the pooler-port rule explicitly**
     (`DATABASE_URL` 6543 runtime / `DIRECT_URL` 5432 migrate).
   - **(c) Wire Supabase** — the two pooler strings.
   - **(d) `prisma migrate deploy`** — via the release step (and the manual first run), on `DIRECT_URL`.
   - **(e) Seed the rosters** — the **Theme G** bootstrap (boot sync; how to trigger the first roster
     pull).
   - **(f) Provision the draft order / default ranking** — the go-live "good order" step. Note the
     mock-draft learning (§544–549): a populated ranking is **no longer a stall-avoidance prerequisite**
     (the best-available fallback spans the whole legal pool), but it **is** the right go-live step for a
     **good** autopick order.
   - **(g) Run the draft.**
   - **(h) The draft smoke test** — controller + draft-room UI + Supabase Realtime + worker autopick
     **on the deployed stack + real Supabase** (the mock-draft procedure). Put the **Realtime-AUTH
     check front-and-center**: confirm the socket carries the **user JWT** (`realtime.setAuth(token)`
     before subscribe, gated on `INITIAL_SESSION`, re-sub on `TOKEN_REFRESHED`) — **not** just the
     policy + publication (the §558 learning; presence/broadcast will stream and mask a silent
     row-change gap).
   - **(i) Pre-prod gates (go / no-go before opening to the league)** — **reference, do not fix here:**
     the three **Security follow-ups** (§565–572: revoke `EXECUTE` on `mirror_auth_user_to_app_user()`;
     pin `enforce_lineup_lock`'s `search_path`; enable Auth leaked-password protection) **+ the
     GOAT-trial ingestion smoke** — which is where the **vsfield JWT-`postgres_changes`** check on
     `score_manager_period` / `standing` folds in (it needs a drafted roster + live recompute). List
     these as the checklist that must pass before go-live.

## Explicitly OUT of scope (later threads; leave seams intact)
- **Fixing the three pre-prod Security follow-ups** (§565–572) — small SQL/dashboard hardening; **its
  own focused follow-up thread.** The runbook only **references** them as gates.
- **The commissioner/admin surface** (incl. the dual-key manager-lookup item), the **group→playoff
  transition / guillotine standings view**, **FAAB/waivers UI**, **`loadSofaIndex`** (the scraper
  deploys; ratings fall back to BALLDONTLIE through the group stage — non-blocking).
- **Any app-logic churn** — engine / recompute / standings / auth / scoring / draft / vsfield /
  ingestion: **consume, no signature change.** `packages/feed` stays as-is.
- **Code performs no provisioning, no secret entry/commit, no account creation, no Supabase dashboard
  changes** — those are the runbook's **human steps for Sergio.**

## Key contracts
- **IaC over click-ops:** a reviewable `render.yaml`; secrets `sync: false`, bound in the dashboard,
  **never committed**.
- **The pooler split is load-bearing:** `DATABASE_URL` 6543 (runtime) vs `DIRECT_URL` 5432
  (`migrate deploy`).
- The **runbook is the single ordered source** for go-live; the **Realtime-AUTH check** and the
  **pooler rule** are **explicit**, not implicit.
- **Reuse** the proven mock-draft Realtime-AUTH pattern + smoke procedure (§534–563); do not reinvent.
- Extend the existing scaffold; **no app-logic change**.

## Tests / validation (config + docs — keep it light; no new logic suites)
Vitest; root `pnpm test` stays green.
- **`render.yaml`** parses / is schema-valid (a validator or CI lint if the repo has one; else a
  structural check).
- **Env-key reconciliation:** every key the app's env schema requires is present in `render.yaml` on the
  correct service + correct build-vs-runtime placement (a test or a documented diff). `TODO(confirm):`
  on ambiguous placements.
- **Service-role `server-only` guard:** a grep/test asserting the service-role admin client module
  imports the server/client boundary guard and is **not reachable from any client entrypoint**.
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm test` green.

## Definition of done (verify these pass)
- **`render.yaml`** defines the **Web Service + resident Background Worker + (conditional) Cron + scraper
  Worker** per Theme E, env via a shared group, secrets `sync: false`; **extends** (not duplicates) any
  existing scaffold.
- The **migrate/runtime pooler split** is encoded (`DIRECT_URL` 5432 for the `migrate deploy` pre-deploy
  step; `DATABASE_URL` 6543 runtime); `NEXT_PUBLIC_*` build-time on web.
- The **service-role admin client is `server-only`-guarded** (asserted).
- **`docs/RUNBOOK.md`** gives the full ordered go-live sequence incl. the **secret-binding table**, the
  migrate step, the rosters seed, the draft + **smoke test (Realtime-AUTH check explicit)**, and the
  **pre-prod hardening + GOAT-trial-smoke gates**.
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0.
- **No app-logic churn; no secrets committed; Code took no provisioning / credential / dashboard
  action.** Out-of-scope untouched.

## Runtime verification (this is inherently a provision-time activity)
Code **authors** the Blueprint + runbook but **does not deploy** — provisioning + secret binding are
**Sergio's**. So the live verification (**services boot; `migrate deploy` succeeds on `DIRECT_URL`; the
draft smoke + Realtime-AUTH on the deployed stack; the GOAT-trial ingestion smoke + the vsfield
JWT-`postgres_changes` check**) **is the runbook's execution**, gated on Sergio running it. **Label it as
the gate; do not claim a deploy that did not happen.** The mock-draft session already proved the draft
Realtime path, so the deployed re-run is **low-risk reuse** — flag live state as an inference to confirm.

## Commit discipline
- **Branch off `main`** (e.g. `feat/deploy-runbook`). Conventional Commits, split cleanly — e.g.
  `feat(deploy): render.yaml blueprint (web + worker + cron + scraper)`,
  `chore(deploy): service-role server-only guard + env reconciliation`,
  `docs(runbook): launch runbook (provision → bind → migrate → draft → smoke)`. **No force-push.** Push
  the branch. **Hold the merge for Chat review** — report against the DoD first.

## When done
Summarize: the **`render.yaml` topology** (each service + start command + which env keys, build vs
runtime) and **what you extended vs created**; the **migrate/runtime pooler wiring** (where
`migrate deploy` runs); the **service-role guard** (asserted how); the **runbook location** + its
ordered steps + the **secret-binding table**; **which pre-prod gates it references** (the 3 security
follow-ups + the GOAT-trial smoke) vs **what it fixes** (nothing — those are separate threads); the exact
commands you verified; every **`TODO(confirm):`** left (esp. any env-key placement, the
migrate-command/script name, the worker/cron split, the runbook file location); and an **explicit
statement that no provisioning / secret / dashboard action was taken** (those are Sergio's runbook
steps). Do **not** start the pre-prod hardening, the admin surface, the playoff transition, FAAB, or
`loadSofaIndex`.
