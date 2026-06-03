# Claude Code — Prompt 01: Repo scaffold + database schema

> Paste this into Claude Code with the four brain files present in the repo root
> (`PROJECT.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `SCORING.md`). They are the source of truth.

---

## Context (read first)
Read `PROJECT.md`, `ARCHITECTURE.md`, `DECISIONS.md`, and `SCORING.md` in the repo root before
writing anything. We're building a **standalone web app for a private World Cup fantasy league**
(~12 managers, one ~month-long tournament, ~104 matches). **ARCHITECTURE.md is the build spec.**
This prompt implements its **§1 (stack)**, **§2 (topology)**, and **§4 (data model)** only.

Guiding constraint, non-negotiable: **"boring and reliable" over clever.** The scale is tiny —
do not over-engineer (no microservices, no queue, no multi-region, no Kubernetes, no premature
abstractions). Pick well-trodden defaults.

## Scope of THIS prompt (the foundation only)
Stand up the **monorepo skeleton** and the **complete PostgreSQL schema** via Prisma, with the
load-bearing invariants enforced **in the database**. The result must install, type-check, build,
and run migrations cleanly, with **stubs** (not real logic) for the app and worker.

**Explicitly OUT of scope for this prompt** — these are later prompts; create stub
modules/interfaces only, no implementations:
- the scoring engine math (SCORING.md),
- BALLDONTLIE ingestion / polling, the Sofascore scraper,
- FAAB batch processing, the draft controller / timer logic,
- Supabase Realtime wiring, auth UI, and the "vs the field" screen.

Do **not** invent product rules. If something is ambiguous, follow ARCHITECTURE.md / DECISIONS.md,
or leave a `// TODO(prompt-NN):` comment that names the brain-file section to consult. Do not
reopen or re-derive any locked decision.

## Stack & layout (from ARCHITECTURE.md §1–§2)
- **TypeScript end-to-end.** Shared types are the reliability lever — the scoring rules, lock
  logic, feed shapes, and API contract must be able to share one set of types.
- **pnpm workspaces monorepo:**
  - `apps/web` — Next.js (App Router) + React + TypeScript + Tailwind. (SSR + API route handlers.)
  - `apps/worker` — a long-running Node service (the ingestion scheduler / FAAB batch / period-close
    / scraper will live here later). For now: a booting skeleton with a no-op scheduler loop.
  - `packages/db` — Prisma schema, generated client, and migrations. The one place the DB is defined.
  - `packages/shared` — shared TS types & enums (positions `GK|DEF|MID|FWD`, league/period/bid
    statuses, rating sources `balldontlie|scrape|manual`, etc.). Both apps + packages import these.
  - `packages/scoring` — the scoring engine. **Stub now**: export a typed
    `scorePlayerMatch(input): ScoreBreakdown` that throws `NotImplemented`, plus the input/output
    types (so later prompts fill in the body without changing call sites).
  - `packages/feed` — BALLDONTLIE client + response types. **Stub now**: typed function signatures
    for the endpoints we'll poll (`matches`, `match_lineups`, `match_events`, `player_match_stats`,
    `team_match_stats`, `match_shots`) that throw `NotImplemented`; no HTTP yet.
- **Tooling:** TypeScript strict mode; a shared `tsconfig` base; ESLint + Prettier; a root
  `pnpm typecheck`, `pnpm build`, `pnpm lint`. Keep dependencies minimal and boring.
- **ORM:** Prisma + Prisma Migrate. Target Postgres (Supabase). Commit the initial migration.

## Database schema — implement EVERY table in ARCHITECTURE.md §4
Model all of the following in `packages/db/schema.prisma`. Use the exact column intent from §4;
**UTC** for all timestamps (league-local exists only for the FAAB clock + display).

**League / managers / users**
- `league` — id, name, season_year (2026), timezone, `faab_batch_local_time` (default 06:00),
  **`result_freeze_hours` (default 6)**, **`draft_pick_seconds`** (commissioner-set), status enum
  `draft|group|playoff|complete`.
- `manager` — id, league_id, user_id (→ Supabase auth user), display_name, is_commissioner,
  draft_slot, **faab_budget** (default 100), **waiver_order_position** (rolling).
- `app_user` — maps to Supabase `auth.users`; an allowlist gate for joining (model the allowlist).

**Football reference (mirrored from feed)**
- `fifa_team`, `player` (app id ↔ `balldontlie_player_id`, position, team, country),
  `fifa_match` (kickoff datetime UTC, status, scores incl. ET/pens, stage/group/round, formations,
  referee), `fifa_stage`, `fifa_group`.

**Roster / lineups (lock timestamps live here)**
- `roster_player` — manager_id, player_id, acquired_at, dropped_at. **Ownership.**
- `lineup_slot` — manager_id, period_id, player_id, role, is_starter, **`locked_at` (nullable)**.
  Per-period rows (future periods allowed = "set multiple lineups in advance").

**Periods**
- `period` — id, league_id, kind `group_md|knockout_round`, label, opens_at, closes_at,
  **`cut_count`** (knockout rounds only), **`frozen_at` (nullable)**, status.

**Draft**
- `draft` — league_id, status, current_pick_no, current_manager_id, `pick_deadline_at`.
- `draft_pick` — draft_id, pick_no, manager_id, player_id, made_at, is_auto.
- `draft_queue` — manager_id, ordered player_ids (the autopick source; falls back to best-available).

**FAAB / waivers**
- `faab_bid` — manager_id, player_add_id, player_drop_id, amount, submitted_at, batch_id,
  status `pending|won|lost|voided_refunded`, note. **(RLS — see invariants.)**
- `faab_batch` — league_id, run_at, status.

**Raw feed layer (recompute inputs; upsert-keyed)**
- `stat_player_match` — PK (match_id, player_id); the `FIFAPlayerMatchStats` fields we use
  (minutes_played, goals, assists, key_passes, dribbles_attempted/completed, duels_won/lost,
  passes_total/accurate, long_balls_total/accurate, was_fouled, clearances, interceptions,
  tackles_won, blocked_shots, saves, saves_inside_box, punches, high_claims, possession_lost, …)
  + updated_at. (Mirror §4 / SCORING.md feed-availability; extra fields can be a JSON column.)
- `event_match` — feed event id; incident_type/class, time_minute, added_time, period, player_id,
  assist_player_id, player_in_id, player_out_id, rescinded.
- `shot_match` — feed shot id; match_id, player_id, shot_type, situation, … (penalty detection).
- `stat_team_match` — (match_id, team_id); team aggregates (incl. team-level offsides).
- `rating_player_match` — (match_id, player_id, **source** `balldontlie|scrape|manual`); rating,
  updated_at. **The resolver reads this; Sofascore `scrape` is the primary source, `balldontlie`
  the fallback** (config-driven priority — see DECISIONS.md → Data source, Amendment 2a).
- `manual_stat_player_match` — (match_id, player_id); the feed-gap fields **penalty_won**,
  **penalty_committed**, plus any operator-entered values + reason.

**Derived layer (recomputable)**
- `score_player_match` — (match_id, player_id); points, **breakdown_json**, computed_at.
- `score_manager_period` — (manager_id, period_id); points, computed_at.
- `standing` — league_id, manager_id, scope; all_play_all_W, all_play_all_L, total_points, seed.

**Recompute plumbing:** add a lightweight **dirty flag** the later recompute sweeper will read —
e.g. a `dirty boolean` (or `dirty_at`) on `stat_player_match` / `rating_player_match` /
`manual_stat_player_match`, and/or a small `recompute_dirty(scope, key)` table. Model it; don't
implement the sweeper.

## Invariants — enforce in the DATABASE, not hopeful app code (ARCHITECTURE.md §4)
1. **Unique active player ownership per league** → a **partial unique index** on
   `roster_player (league_id, player_id) WHERE dropped_at IS NULL`.
2. **Sealed FAAB bids stay secret** → **Row-Level Security** on `faab_bid`: a manager can read only
   their **own `pending`** bids; everyone can read outcomes after the batch. Prisma won't generate
   RLS — add it in a **raw SQL migration** (Supabase policies) committed alongside the schema.
3. **Hindsight-proof swaps** → a `lineup_slot` is editable **only while `locked_at IS NULL`**.
   Enforce at the write path (a guarded update / DB rule); a slot with a non-null `locked_at` must
   reject edits.
4. **No FAAB double-spend / no illegal roster** → model the constraints now (faab_budget cannot go
   negative; roster cap; every claim implies add-X/drop-Y). The atomic processing transaction is a
   later prompt, but the schema + check constraints must make an illegal state unrepresentable.
5. **Frozen periods** → once `period.frozen_at` is set, the (later) recompute path must treat the
   period as commissioner-only. Model the column + a clear seam; no enforcement logic yet.

## App & worker skeletons (no features)
- `apps/web`: a Next.js app that builds and serves a trivial health page; a typed Prisma client
  wired via `packages/db`; a placeholder `GET /api/health` route handler returning `{ ok: true }`.
- `apps/worker`: a process that boots, logs structured startup, and runs an **empty scheduler
  loop** (a tick that does nothing yet but reads `fifa_match` is fine as a stub). No polling, no
  cron behavior beyond "it starts and idles cleanly."

## Cross-cutting (boring-but-essential)
- **UTC everywhere** in the DB; league-local only for the FAAB batch clock + display.
- **Secrets** via env (`DATABASE_URL`, Supabase keys, feed API key) — never committed. Provide
  `.env.example`.
- A clear `README.md`: prerequisites (Node version, pnpm), install, migrate, run web, run worker,
  and how the workspace fits together.

## Definition of done (verify these pass)
- `pnpm install` succeeds.
- `pnpm -w typecheck` passes across all packages (strict mode).
- `pnpm --filter @app/db migrate dev` (or equivalent) applies the initial migration to a fresh
  Postgres, creating **every table above**, the **partial unique ownership index**, and the
  **`faab_bid` RLS policies** (raw SQL migration).
- `pnpm --filter @app/web build` succeeds; `/api/health` returns `{ ok: true }` in dev.
- `apps/worker` boots and idles without error.
- `packages/scoring` and `packages/feed` expose typed stub APIs that throw `NotImplemented`, with
  no call-site changes needed when later prompts implement them.

## When done
Summarize: the workspace layout, the schema (table count + where the invariants are enforced),
any `TODO(prompt-NN)` seams you left, and the exact commands you verified. Do not start any
out-of-scope feature.
