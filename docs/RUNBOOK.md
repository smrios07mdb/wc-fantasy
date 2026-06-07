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
   | `DATABASE_URL` | **Transaction** pooler (PgBouncer) | **6543** | app + worker + scraper **runtime** |
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
   **`wc-fantasy-scraper`** (worker), **`wc-fantasy-faab-batch`** + **`wc-fantasy-period-close`** (cron), and
   the **`wc-fantasy-shared`** env group.
2. Apply. Render creates the services + the group but **will not deploy successfully until the secrets are
   bound** (next step) — that is expected.
3. **The scraper is non-gating.** Playwright is not yet wired (`apps/scraper/src/wiring.ts` → `notWiredLauncher`),
   so `wc-fantasy-scraper` boots and idles (each tick logs a contained "not wired" error; ratings fall back to
   BALLDONTLIE through the group stage). You **may suspend** it until the go-live scrape wiring lands. See the
   `TODO(confirm: go-live scrape)` in `render.yaml`. Simplest at launch: **leave `wc-fantasy-scraper`
   un-provisioned entirely** (skip/decline it in the Blueprint apply, or delete the service) — nothing depends
   on it until Playwright + `loadSofaIndex` land.

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
| `SCRAPER_TICK_MS`, `SCRAPER_POLITE_GAP_MS`                                  | scraper (non-secret)       | runtime                  | `render.yaml`                                                                   |

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

Set `DATABASE_URL` on every DB-touching service (web, worker, scraper, both crons) and `DIRECT_URL` on web +
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

- [ ] **Security follow-up 1 (§568):** revoke `EXECUTE` on `mirror_auth_user_to_app_user()` (or make it
      `SECURITY INVOKER`) so it can't be invoked directly.
- [ ] **Security follow-up 2 (§570):** pin `enforce_lineup_lock`'s `search_path` (`SET search_path = ...`).
- [ ] **Security follow-up 3 (§572):** enable Auth **leaked-password protection** (HaveIBeenPwned) in Supabase
      Auth settings.
- [ ] **GOAT-trial ingestion smoke:** with a drafted roster, run a live ingestion window and confirm the
      recompute pipeline (player → manager-period → standing) lands scores. **This is where the vs-the-field
      `JWT-postgres_changes` check folds in:** on `/vsfield`, confirm `score_manager_period` + `standing`
      row-changes deliver live to the browser **with the user JWT on the socket** (same §558 check — it needs a
      drafted roster + live recompute, which only exist at this stage).

---

## Appendix

### Service topology (`render.yaml`)

| Service                   | Type              | Start                                        | Notes                                                                       |
| ------------------------- | ----------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| `wc-fantasy-web`          | web               | `pnpm --filter @app/web start`               | `preDeployCommand` = `db:migrate:deploy`; `healthCheckPath` = `/api/health` |
| `wc-fantasy-worker`       | worker (resident) | `pnpm --filter @app/worker start`            | draft ticker + ingestion scheduler; roster re-pull self-scheduled           |
| `wc-fantasy-scraper`      | worker            | `pnpm --filter @app/scraper start`           | **non-gating**; Playwright not yet wired                                    |
| `wc-fantasy-faab-batch`   | cron `0 10 * * *` | `pnpm --filter @app/worker job:faab`         | daily FAAB batch trigger                                                    |
| `wc-fantasy-period-close` | cron `0 * * * *`  | `pnpm --filter @app/worker job:period-close` | hourly period-close trigger                                                 |

### TODO(confirm) — operator decisions not pinned by spec

- **`region`** on every service should match the Supabase project region (default `virginia`).
- **Plan tiers** (`plan: starter`) size the ~$14 web+worker baseline; the scraper + crons add cost — adjust in
  the dashboard (Sergio's billing call). The scraper may be **suspended** until the go-live scrape wiring.
- **Go-live scrape wiring** (out of scope here): `pnpm add playwright` (apps/scraper) + `npx playwright install
chromium`, swap `notWiredLauncher`, and append `&& pnpm --filter @app/scraper exec playwright install
--with-deps chromium` to the scraper `buildCommand`.
- **Provisioning shell:** run `provision` / `job:rosters` from a **Render Shell on the worker** (inherits the
  env group) rather than locally, to avoid copying prod secrets onto a laptop.

### Runtime verification — this is the gate, not a claim

Code **authored** the Blueprint + runbook but **did not deploy**. The live checks — **services boot;
`migrate deploy` succeeds on `DIRECT_URL`; the draft smoke + Realtime-AUTH on the deployed stack; the
GOAT-trial ingestion smoke + the vsfield `JWT-postgres_changes` check** — are this runbook's **execution**,
gated on Sergio running it. They are **not** claimed as done.
