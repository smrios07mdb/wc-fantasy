# Launch Runbook — WC Fantasy go-live

> **Single ordered source for go-live.** Code authored this doc and the Blueprint (`render.yaml`); **Code
> took no provisioning, secret-entry, or dashboard action** — every step below is **Sergio's** to execute.
> The World Cup opens **June 11**; this is the launch-gating sequence.
>
> Two vendors only: **Render** (compute) + **Supabase** (Postgres / Auth / Realtime). The topology is
> `render.yaml`; the env contract and the smoke procedure are spec-pinned in the repo-root `DECISIONS.md`
> → **"Architecture & Stack"** (the prompt's "Theme E") §354–420, Env/deploy facts §574–578, the
> Realtime-AUTH learning §558–563.

---

## ⚠️ The two load-bearing rules (read before anything else)

1. **The pooler split.** Prisma needs two different Supabase connection strings:
   | Env var | Supabase pooler | Port | Used by |
   |---|---|---|---|
   | `DATABASE_URL` | **Transaction** pooler (PgBouncer) | **6543** | app + worker **runtime** |
   | `DIRECT_URL` | **Session** pooler | **5432** | **`prisma migrate deploy` ONLY** |
   The transaction pooler **cannot carry migrations** — that is why `migrate deploy` runs on `DIRECT_URL`.
   Append **`?pgbouncer=true`** to `DATABASE_URL` (Prisma + PgBouncer). The schema's `datasource.directUrl`
   wires migrate to `DIRECT_URL` automatically; the web service's `preDeployCommand` runs it.

2. **The Realtime-AUTH check (§558–563).** RLS-gated `postgres_changes` are delivered **only** when the
   browser's Realtime socket carries the **user JWT** (`realtime.setAuth(token)` before subscribe). Presence
   and broadcast stream **without** it and will **mask** a silent row-change gap. When verifying the draft
   or the vs-the-field screen, confirm the **socket's JWT**, not just the RLS policy + publication.

---

## Prerequisites (one-time)

- A **Render** account with this repo connected; branch **`main`**, all of Prompts 01–12 merged.
- A **Supabase** project (Postgres + Auth + Realtime) in **one region near the league**; match `render.yaml`'s
  `region:` (default `virginia` / US-East) to it.
- A **BALLDONTLIE GOAT** key (FIFA product, $39.99/mo) — or the **48h GOAT trial** key for a dry run
  (`BALLDONTLIE_RPM=5` for the trial; `600` for paid — set on the worker).
- `provision.config.json` filled locally (copy `provision.config.example.json`; names/emails/timer only — **no
  secrets**) and, optionally, `provision.ranking.json` (a best-first id list for a good autopick order). Both
  are gitignored.

---

## (a) Provision the Render services from the Blueprint

1. Render dashboard → **Blueprints** → **New Blueprint Instance** → pick this repo/branch. Render reads
   `render.yaml` and proposes: **`wc-fantasy-web`** (web), **`wc-fantasy-worker`** (resident worker),
   **`wc-fantasy-period-close`** (cron), and the **`wc-fantasy-shared`** env group.
2. Apply. Render creates the services + the group but **will not deploy successfully until the secrets are
   bound** (next step) — that is expected.
3. **No rating scraper.** The Sofascore scraper was REMOVED (CODE_PROMPT_57 — it was structurally inert,
   AUDIT F-P2-03); BALLDONTLIE's native `rating` is the canonical rating source. ⚠️ If a
   `wc-fantasy-scraper` worker was deployed by an earlier Blueprint apply, **delete/suspend it in the Render
   dashboard** — removing the `render.yaml` block does not delete the running service.

## (b) Bind secrets — what goes where (build-time vs runtime)

Set every `sync: false` var in the Render dashboard. Secrets are entered **per service** — Render does **not**
allow `sync: false` inside an env group, so the `wc-fantasy-shared` group carries only the non-secret shared
config (`NODE_ENV`, `LOG_LEVEL`). **Never commit a secret.**

| Env key                                                                     | Service / group            | Build vs runtime         | Source                                                                          |
| --------------------------------------------------------------------------- | -------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                              | **each service** (inline)  | runtime                  | Supabase → Connect → **Transaction pooler (:6543)**, add `?pgbouncer=true`      |
| `DIRECT_URL`                                                                | **web + worker** (inline)  | migrate (pre-deploy)     | Supabase → Connect → **Session pooler (:5432)**                                 |
| `NODE_ENV` = `production`                                                   | group (non-secret, pinned) | both                     | `render.yaml`                                                                   |
| `LOG_LEVEL` = `info`                                                        | group (non-secret, pinned) | runtime                  | `render.yaml`                                                                   |
| `NEXT_PUBLIC_SUPABASE_URL`                                                  | **web** (inline)           | **build-time** (inlined) | Supabase → Project Settings → API → Project URL                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                             | **web** (inline)           | **build-time** (inlined) | Supabase → API → anon/public key                                                |
| `SUPABASE_SERVICE_ROLE_KEY`                                                 | **web** (inline)           | **runtime, server-only** | Supabase → API → `service_role` key — never a `NEXT_PUBLIC_` var (bypasses RLS) |
| `NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED` = `false`                             | web (non-secret)           | build-time               | `render.yaml` (flip to `true` only if Google OAuth is enabled in Supabase)      |
| `SITE_URL` = `https://wc-fantasy-web.onrender.com`                          | web (non-secret)           | runtime                  | `render.yaml` — update if the web URL differs                                   |
| `BALLDONTLIE_API_KEY`                                                       | **worker**                 | runtime                  | BALLDONTLIE dashboard (GOAT key)                                                |
| `BALLDONTLIE_BASE_URL`, `BALLDONTLIE_RPM`                                   | worker (non-secret)        | runtime                  | `render.yaml` (`RPM` 600 paid / 5 trial)                                        |
| `WORKER_TICK_MS`, `WORKER_DRAFT_TICK_MS`, `WORKER_ROSTERS_SYNC_EVERY_TICKS` | worker (non-secret)        | runtime                  | `render.yaml`                                                                   |

> **Build-time note (§575):** `NEXT_PUBLIC_*` are **inlined at `next build`** — they live inline on the web
> service. If you change one, you must **re-deploy** the web service (a runtime restart will not pick it up).
> A `service_role`-keyed admin client is guarded by `import "server-only"` in `apps/web/lib/supabase/server.ts`,
> so the RLS-bypassing key can never reach the browser bundle.

## (c) Wire Supabase — the two pooler strings

From Supabase → **Connect** (the database connection modal), copy:

```
# DATABASE_URL  (runtime — transaction pooler, PgBouncer)
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true

# DIRECT_URL    (migrate only — session pooler)
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Set `DATABASE_URL` on every DB-touching service (web, worker, both crons) and `DIRECT_URL` on web +
worker — **per service**, since Render won't take a `sync: false` secret on the env group. Also, in Supabase →
**Auth → URL Configuration**, allowlist the auth callback: `https://wc-fantasy-web.onrender.com/auth/callback`
(+ `http://localhost:3000/auth/callback` for local).

## (d) Run migrations — `prisma migrate deploy` (on `DIRECT_URL`)

- **Automatic, every release:** the web service `preDeployCommand: pnpm db:migrate:deploy` runs **once per
  deploy, before the new version serves**, against `DIRECT_URL` (the schema's `directUrl`). No action needed
  after the first deploy.
- **First run (manual, if you want to migrate before the first web deploy):** open a **Render Shell** on
  `wc-fantasy-web` (it inherits the env group) and run:
  ```
  pnpm db:migrate:deploy
  ```
  Confirm it reports the RLS + realtime migrations through `20260606170000_rls_realtime_vsfield` applied.
  > **Gate:** services boot **and** `migrate deploy` succeeds on `DIRECT_URL`. (Provision-time — see the
  > Runtime-verification note at the end.)

### (d.1) Recovery — if a prior deploy left `20260606170000_rls_realtime_vsfield` **failed**

A deploy attempt **before** this fix landed died inside that migration's self-test with Postgres
`22P02` (`invalid input syntax for type uuid: "rls_selftest_user_in"` — the self-test fed a non-uuid
label into `request.jwt.claim.sub`, which Supabase's real `auth.uid()` casts `::uuid`). Prisma marks
the migration **failed** in `_prisma_migrations` and **refuses to apply anything further** until it is
resolved. The whole migration is a **single transaction** (no `CREATE INDEX CONCURRENTLY` or other
non-transactional statement), so the failed apply **rolled back cleanly — nothing persisted.**

Run the recovery in a **Render Shell** on `wc-fantasy-web` (env group provides `DIRECT_URL`; same
session pooler `:5432` as `migrate deploy`):

```
# 1. mark the rolled-back migration as rolled-back so Prisma will re-apply it
pnpm exec prisma migrate resolve --rolled-back 20260606170000_rls_realtime_vsfield \
  --schema=packages/db/prisma/schema.prisma
# 2. re-run deploy — the CORRECTED migration (valid-uuid self-test) now applies
pnpm db:migrate:deploy
```

`migrate deploy` should now apply `20260606170000_rls_realtime_vsfield` and report all migrations
applied.

- **Pre-launch alternative (no real league data yet):** `pnpm db:reset` (= `prisma migrate reset`)
  drops and re-applies every migration from scratch — acceptable **only before any real managers/leagues
  exist**, never after.
- `TODO(confirm):` exact wrapper for the resolve step — there is no `db:migrate:resolve` script yet, so
  the `pnpm exec prisma migrate resolve …` form above is used; add a script alias if preferred.
- `TODO(confirm):` recovery-doc home — kept **inline in this runbook's step (d)** (most discoverable
  during execution) rather than a separate `docs/MIGRATION_RECOVERY.md`.

## (e) Seed the rosters — the Theme G bootstrap

The draft pool (`player` + `fifa_team`) comes **only** from the BALLDONTLIE rosters pull (Theme G §508–527).
The worker pulls them on **boot** automatically; to populate/refresh on demand, open a **Render Shell** on
`wc-fantasy-worker` and run the one-shot:

```
pnpm --filter @app/worker job:rosters
```

Idempotent (upserts on BALLDONTLIE ids). Expect ~48 teams / ~1,250 players (season 2026, positions `G/D/M/F`).
Stat ingestion silently no-ops until this runs, so do it **before** the draft.

## (f) Provision the league + draft order / default ranking

Run the idempotent provisioning CLI (Render Shell on `wc-fantasy-worker`, so it inherits `DATABASE_URL`):

```
pnpm --filter @app/worker provision provision   # league + periods + managers + allowlist + a pending draft
#  → managers now sign in (magic link) so the auth mirror creates their app_user rows
pnpm --filter @app/worker provision bind         # link each manager to the app_user created at sign-in
pnpm --filter @app/worker provision rank <file>  # populate player.default_rank (good autopick order)
pnpm --filter @app/worker provision status       # sanity-check the provisioning state
```

> **Allowlist the league's real members (committed seed).** `provision provision` seeds the allowlist
> from the gitignored `provision.config.json`; for the **real league** the canonical, reviewable member
> list lives committed in `packages/db/scripts/seed-allowlist.ts`. Once the league row exists, seed it so
> members can pass the magic-link gate — run it **before** they sign in (sign-in is denied for any
> non-allowlisted email):
>
> ```
> pnpm --filter @app/db seed:allowlist   # idempotent → "N emails — M newly added, K already present"
> ```
>
> It writes **only** `allowlist_email` (plain `@app/db` Prisma — no Supabase service-role client, no RLS
> surface) and `update: {}` never clobbers a claimed row, so re-running is a clean no-op. To add or remove
> a member, edit the committed list and re-run. Run it from a **Render Shell on `wc-fantasy-web` or
> `wc-fantasy-worker`** (inherits `DATABASE_URL`) to avoid copying prod secrets onto a laptop.

> **Ranking is no longer a stall-avoidance prerequisite (§544–549):** `getDefaultRanking` drops the
> `default_rank IS NOT NULL` filter and the best-available fallback spans the whole legal pool, so a non-empty
> pool always yields a pick. `provision rank` is still the right go-live step for a **good** order — just no
> longer mandatory to avoid an autopick stall.

## (g) Run the draft

```
pnpm --filter @app/worker provision draft         # START the draft via the controller's startDraft
```

The resident worker now advances the draft on each pick or on `pick_deadline_at` expiry (autopick =
queue → best-available). Managers join the draft room in the web app.

## (h) Draft smoke test — on the deployed stack + real Supabase

Re-run the proven mock-draft procedure (§529–563) end-to-end — **controller, draft-room UI, Supabase
Realtime, and worker autopick** — on the deployed stack. **Put the Realtime-AUTH check front-and-center:**

1. Sign in as a bound league member; open the draft room.
2. **Confirm the socket carries the user JWT** — `client.realtime.setAuth(<access_token>)` runs **before**
   subscribe, the first subscribe is gated on `INITIAL_SESSION`, and the channel re-subscribes on
   `TOKEN_REFRESHED` (tearing down the prior channel first). **Do not** settle for "the channel joined" —
   presence/broadcast stream without the JWT and **mask** a silent `postgres_changes` gap (the §558 bug).
3. Verify a pick made by one client **lands live** in another client (a row-change frame, not a reload), the
   countdown is synced to the server `pick_deadline_at`, and an expired deadline **autopicks within seconds**.
4. Confirm a human pick **persists** alongside autopicks.

> The mock-draft session already proved this path against a real Supabase, so the deployed re-run is low-risk
> reuse — but the JWT check is the one that catches the silent-failure class.

## (i) Pre-prod gates — go / no-go before opening to the league

**Reference only — these are fixed in their own threads, NOT here.** All must pass before go-live:

- [ ] **Security follow-up 1 (§568) — code fix landed in migration `20260606180000_security_followups_function_hardening`:**
      `EXECUTE` on `mirror_auth_user_to_app_user()` is revoked from `PUBLIC` (+ `anon`/`authenticated`, guarded);
      it KEEPS `SECURITY DEFINER` (the `auth.users` trigger still fires — Postgres doesn't check `EXECUTE` at
      trigger-fire time). **Post-deploy gate (Sergio):** after `migrate deploy`, a real magic-link signup still
      creates the `app_user` row (the mirror trigger survives the revoke).
- [ ] **Security follow-up 2 (§570) — code fix landed in the same migration:** `enforce_lineup_lock`'s
      `search_path` is pinned (`SET search_path = ''`; body/logic unchanged). **Post-deploy gate (Sergio):** a
      played/locked player still can't be swapped (the lock-on-play latch holds).
- ~~**Security follow-up 3 (§572) — NOT enabling (closed).** Private, invite-only ~12-manager league with no
  self-serve signup; accepted risk. Removed from go-live gate. All three security follow-ups resolved.~~
- [ ] **GOAT-trial ingestion smoke:** with a drafted roster, run a live ingestion window and confirm the
      recompute pipeline (player → manager-period → standing) lands scores. **This is where the vs-the-field
      `JWT-postgres_changes` check folds in:** on `/vsfield`, confirm `score_manager_period` + `standing`
      row-changes deliver live to the browser **with the user JWT on the socket** (same §558 check — it needs a
      drafted roster + live recompute, which only exist at this stage).

---

## Knockout transitions — pre-flight (recurring: R16 / QF / SF / Final)

> **Recurring operational check — NOT a one-time go-live step.** Run it as each knockout round nears.

**Why.** The hourly **`wc-fantasy-period-close`** cron (`render.yaml` → `job:period-close`, schedule
`"0 * * * *"`) is the SOLE writer of `period.status='open'`. It closes a round once its fixtures all
reach `completed` and opens the next round (R32→R16→QF→SF→Final) ~1 day before that round's first
kickoff. The `/waivers` **$0 free-agency panel mounts only when that round is `status='open'`** (the
`open` fast-path in `selectCurrentPeriod`; a still-`pending` round whose batch has cleared is NOT
selected). The same cron also stamps `frozen_at`, so **a cron stall misses freezes too** — it is a
single point of failure.

**Pass condition (no action needed).** Once the prior round's last match is `completed`, the next
round should show **`status='open'` while its `batch_cleared_at` is still NULL** → the FA panel will
mount once the batch clears. Confirm either way:

- **Cron log** — Render dashboard → **`wc-fantasy-period-close`** → Logs. After the prior round
  completes, expect:
  - `job.periodClose.statusAdvanced { periodId: <prior round>, to: "closed" }`
  - `job.periodClose.statusAdvanced { periodId: <next round>, to: "open" }`
- **Read-only SQL** — Supabase **SQL editor** (or `psql` on `DIRECT_URL`):

  ```sql
  select label, status, batch_cleared_at,
         count(m.id) filter (where m.status = 'completed')                as completed,
         count(m.id)                                                      as fixtures,
         count(m.id) filter (where m.status in ('postponed','abandoned')) as anomalies,
         min(m.kickoff_at)                                                as first_kickoff
  from period p
  left join fifa_match m on m.period_id = p.id
  group by p.id, label, status, batch_cleared_at
  order by min(m.kickoff_at) nulls last;
  ```

  Pass = the next round is `open` (or already `closed` once its matches end), `anomalies = 0` on the
  prior round, and the next round's `batch_cleared_at` is still NULL when you check pre-window.

**Fallback ladder — only if the next round is still `pending` as it nears (FA window ≈ 6h pre-kickoff).**

1. **Anomaly (the one real latent gap).** Check the cron log for `job.periodClose.anomaly` — a
   `postponed`/`abandoned` fixture in the **prior** round blocks its close, so the next round never
   opens. Resolve that fixture's status, then let the cron fire on the hour or trigger it once:
   - `pnpm --filter @app/worker job:period-close` — **WHERE:** Render **Shell on `wc-fantasy-worker`**
     (preferred — inherits the env group; see Appendix), or local Mac `apps/worker` against the prod
     `DATABASE_URL`. Idempotent (guarded `updateMany`s) — safe to re-run.
2. **Cron not firing, no anomaly.** Run the same job once manually (same command / same WHERE as
   above). It reproduces the cron's exact guarded close + open.
3. **Last resort — the job itself cannot run.** Raw SQL, **WHERE:** Supabase **SQL editor**. Close the
   prior round and open the next as **ONE transaction** — never open the next round alone: with two
   `open` rows, `selectCurrentPeriod` returns the **earliest-kickoff** open (the stuck prior round), so
   the FA panel still won't advance (the one-open invariant matters).

   ```sql
   begin;
     update period set status = 'closed' where id = '<PRIOR_ROUND_ID>' and status <> 'closed';
     update period set status = 'open'   where id = '<NEXT_ROUND_ID>'  and status =  'pending';
   commit;
   ```

> **The one real latent gap** is the anomaly path (step 1): a postponed/abandoned prior-round fixture
> stalls the close, so the next round never opens and its FA window passes with no panel. The steady
> state (cron healthy, no anomaly) needs **no action** — the round opens automatically. See BACKLOG →
> FAAB-FA-P2 (resolved not-a-bug) and DECISIONS → "`period.status` DOES transition".

### External detection signals (A-lite — set up once, then passive)

> **Operator setup (Sergio, Render dashboard) — one-time.** Code ships the signals **INERT**: they do
> nothing until you set the env values AND configure the external monitor. They are purely
> observational and can never affect the job (an unset value = the signal is silently off), so there is
> no rush and no risk — but configuring them turns the two gaps above from **silent misses** into
> **alarms**.

`job:period-close` emits two env-gated, fire-and-forget pings (`apps/worker/src/jobs/heartbeat.ts`):

- **`PERIOD_CLOSE_HEARTBEAT_URL` — liveness (dead-man's-switch).** Pinged on every successful run;
  `…/fail` is pinged on a crash. Point it at a **Healthchecks.io-style check** (~hourly period +
  ~15 min grace) that alerts on a **missed** ping → catches a stalled/crashed cron, including the
  freeze miss the dual-writer does NOT cover. `/fail` gives an immediate crash alert instead of waiting
  out the grace window. _(If you instead enable a native Render "notify on cron failure" toggle for
  liveness, leave this UNSET — the code no-ops it.)_
- **`PERIOD_CLOSE_ATTENTION_URL` — anomaly attention.** Pinged ONLY when a run reports `anomalies > 0`
  (a postponed/abandoned fixture — the **step-1 gap above**, which a healthy cron cannot self-report).
  Point it at a check/webhook that **alerts on receipt** (Slack/email/SMS), with **dedup** so a
  multi-day postponed match doesn't spam hourly. On an alert → run this pre-flight (step 1).

Both keys are declared `sync:false` on the `wc-fantasy-period-close` block in `render.yaml`; set the
real URLs per-service in the dashboard. See BACKLOG → A-lite + DECISIONS → "A-lite: cron-resilience
DETECTION".

---

## Appendix

### Service topology (`render.yaml`)

| Service                   | Type              | Start                                        | Notes                                                                       |
| ------------------------- | ----------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| `wc-fantasy-web`          | web               | `pnpm --filter @app/web start`               | `preDeployCommand` = `db:migrate:deploy`; `healthCheckPath` = `/api/health` |
| `wc-fantasy-worker`       | worker (resident) | `pnpm --filter @app/worker start`            | draft ticker + ingestion scheduler; roster re-pull self-scheduled           |
| `wc-fantasy-faab-batch`   | cron `0 10 * * *` | `pnpm --filter @app/worker job:faab`         | daily FAAB batch trigger                                                    |
| `wc-fantasy-period-close` | cron `0 * * * *`  | `pnpm --filter @app/worker job:period-close` | hourly period-close trigger                                                 |

### TODO(confirm) — operator decisions not pinned by spec

- **`region`** on every service should match the Supabase project region (default `virginia`).
- **Plan tiers** (`plan: starter`) size the ~$14 web+worker baseline; the crons add cost — adjust in the
  dashboard (Sergio's billing call).
- **Provisioning shell:** run `provision` / `job:rosters` from a **Render Shell on the worker** (inherits the
  env group) rather than locally, to avoid copying prod secrets onto a laptop.

### Runtime verification — this is the gate, not a claim

Code **authored** the Blueprint + runbook but **did not deploy**. The live checks — **services boot;
`migrate deploy` succeeds on `DIRECT_URL`; the draft smoke + Realtime-AUTH on the deployed stack; the
GOAT-trial ingestion smoke + the vsfield `JWT-postgres_changes` check** — are this runbook's **execution**,
gated on Sergio running it. They are **not** claimed as done.
