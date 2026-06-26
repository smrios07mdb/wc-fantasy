-- Real-football WC GROUP-STAGE TABLE — one row per team (T18, game-detail Standings tab). Ingested from
-- BALLDONTLIE `/fifa/worldcup/v1/group_standings` by the new `job:ingest-group-standings` worker job
-- (packages/ingest/src/ingest.ts `ingestGroupStandings`), which upserts one row per team with its rank,
-- played/W-D-L, goals, goal difference and points.
--
-- DISPLAY-ONLY / FANTASY-SAFE: this table is NEVER read by the scoring engine (`packages/scoring`) or by
-- `computeStandings` (the *fantasy* power-record, built from `score_manager_period`). It is a brand-new
-- table with zero engine readers, so it cannot become a scoring input. The ingest job marks NOTHING dirty
-- and triggers NO recompute (mirrors `ingestTeamStats` / `stat_team_match`). Purely ADDITIVE: it starts
-- empty, has NO backfill in this migration (an operator runs the CLI once post-deploy), and touches no
-- existing table.
--
-- SELF-CONTAINED group identity (D1): the group is DENORMALIZED here (`bdl_group_id` + `group_name`). There
-- is deliberately NO foreign key to `fifa_group`, and the existing (currently-unpopulated)
-- `fifa_team.group_id` / `fifa_match.group_id` columns are left untouched. A match's group is derived by
-- looking up its two teams' rows in THIS table (by `team_id`), never via `fifa_match.group_id`.
--
-- WC2026-only: the PK is `team_id` (one row per team in the current edition); `season` defaults to 2026.
-- `position` is the feed's authoritative rank (incl. the FIFA tie-breaks). No `form`/`last` column — the
-- `group_standings` feed object carries none.
--
-- RLS: group standings are NON-SENSITIVE reference (a real-world group table is public football fact), so
-- SELECT is GLOBAL (`USING (true)`), NOT league-scoped like pool_pick. There are NO write policies, so RLS
-- default-denies every client write; the only writer is the worker via Prisma (table-owning `postgres`
-- role, which bypasses RLS — ENABLE, not FORCE, same rationale as the earlier RLS migrations). The web
-- reads this through `loadGameDetail`'s server fetch (Prisma, RLS-bypassing), so the authenticated SELECT
-- policy is belt-and-suspenders. `TO authenticated` excludes `anon`: the table is never anon-readable and
-- never left RLS-disabled.
--
-- NO Realtime publication entry (like match_lineup_entry, unlike pool_pick): standings are read on the
-- server-rendered game-detail page load, NOT via a postgres_changes subscription — nothing to broadcast.
--
-- Portable: runs on a plain Postgres (the DoD fresh-Postgres) AND on Supabase, using ENABLE (not FORCE)
-- RLS so server-side paths are unaffected.

-- ── (1) DDL (exact `prisma migrate diff` output) ──────────────────────────────────────────────────
-- CreateTable
CREATE TABLE "group_standing" (
    "team_id" TEXT NOT NULL,
    "bdl_group_id" INTEGER NOT NULL,
    "group_name" TEXT NOT NULL,
    "season" INTEGER NOT NULL DEFAULT 2026,
    "position" INTEGER NOT NULL,
    "played" INTEGER NOT NULL,
    "won" INTEGER NOT NULL,
    "drawn" INTEGER NOT NULL,
    "lost" INTEGER NOT NULL,
    "goals_for" INTEGER NOT NULL,
    "goals_against" INTEGER NOT NULL,
    "goal_difference" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "group_standing_pkey" PRIMARY KEY ("team_id")
);

-- CreateIndex
CREATE INDEX "group_standing_bdl_group_id_idx" ON "group_standing"("bdl_group_id");

-- AddForeignKey
ALTER TABLE "group_standing" ADD CONSTRAINT "group_standing_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "fifa_team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Portability shim (idempotent; no-op on Supabase) ──────────────────────────────────────────────
-- The policy below targets the `authenticated` role, which exists on Supabase but not on a bare Postgres.
-- Create a stub when absent so `TO authenticated` is portable (mirrors the earlier RLS migrations). No
-- `auth.uid()` shim is needed — the policy is global (`USING (true)`), so it never reads the JWT.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE "authenticated";
  END IF;
END $$;

-- ── (2) Enable RLS + the single global-read policy ────────────────────────────────────────────────
ALTER TABLE "group_standing" ENABLE ROW LEVEL SECURITY;

-- SELECT — GLOBAL: any authenticated client may read every row (non-sensitive reference data). No
-- INSERT/UPDATE/DELETE policy → RLS default-denies all client writes; the only writer is the worker's
-- `ingestGroupStandings` via Prisma (table owner, bypasses RLS). NOT granted to `anon`.
CREATE POLICY "group_standing_select_all" ON "group_standing"
  FOR SELECT TO authenticated
  USING (true);
