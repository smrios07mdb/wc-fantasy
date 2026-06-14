-- Availability badge — pre-kickoff official-lineup snapshot. The worker's T-75 `peekLineup` sweep
-- (packages/ingest/src/lineupPeek.ts) pulls `match_lineups` ~75 min before kickoff and writes one row
-- per (match, player) seen on the national-team sheet; `is_starter` distinguishes the real XI from the
-- bench. The Set Lineup screen reads this via `loadLineup` to render each rostered player's
-- Starting / Not starting badge (absence of any row for a player's match = lineup not announced = no
-- badge).
--
-- ORTHOGONAL to lock-on-play: this table is written ONLY by `peekLineup`, which routes nowhere near
-- `lockSlot` / `lineup_slot.locked_at` and never sets `lineupPulled`. The kickoff lock path stays
-- byte-identical. Purely ADDITIVE: it starts empty, has NO backfill, and touches no existing table.
--
-- RLS: lineup data is NON-SENSITIVE reference (the same XI is public the moment the team sheet drops),
-- so SELECT is GLOBAL (`USING (true)`), NOT league-scoped like pool_pick. There are NO write policies,
-- so RLS default-denies every client write — `peekLineup` writes server-side as the table-owning
-- `postgres` role (Prisma), which bypasses RLS (ENABLE, not FORCE — same rationale as the earlier RLS
-- migrations). The web reads this via `loadLineup`'s server fetch (Prisma, RLS-bypassing), so the
-- authenticated SELECT policy is belt-and-suspenders, mirroring how `fifa_match` is exposed.
--
-- NO Realtime publication entry (unlike pool_pick): the badge is read on the server-rendered page load,
-- NOT via a postgres_changes subscription, so there is nothing to broadcast — which also sidesteps the
-- Theme-F silent-failure trap (an unread subscription) by simply not subscribing.
--
-- Portable: runs on a plain Postgres (the DoD fresh-Postgres) AND on Supabase, using ENABLE (not FORCE)
-- RLS so server-side paths are unaffected.

-- ── (1) DDL (exact `prisma migrate diff` output) ──────────────────────────────────────────────────
-- CreateTable
CREATE TABLE "match_lineup_entry" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "is_starter" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "match_lineup_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_lineup_entry_match_id_idx" ON "match_lineup_entry"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_lineup_entry_match_player_uq" ON "match_lineup_entry"("match_id", "player_id");

-- AddForeignKey
ALTER TABLE "match_lineup_entry" ADD CONSTRAINT "match_lineup_entry_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "fifa_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_lineup_entry" ADD CONSTRAINT "match_lineup_entry_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Portability shim (idempotent; no-op on Supabase) ──────────────────────────────────────────────
-- The policy below targets the `authenticated` role, which exists on Supabase but not on a bare
-- Postgres. Create a stub when absent so `TO authenticated` is portable (mirrors the earlier RLS
-- migrations). No `auth.uid()` shim is needed — the policy is global (`USING (true)`), so it never
-- reads the JWT.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE "authenticated";
  END IF;
END $$;

-- ── (2) Enable RLS + the single global-read policy ────────────────────────────────────────────────
ALTER TABLE "match_lineup_entry" ENABLE ROW LEVEL SECURITY;

-- SELECT — GLOBAL: any authenticated client may read every row (non-sensitive reference data). No
-- INSERT/UPDATE/DELETE policy → RLS default-denies all client writes; the only writer is the worker's
-- `peekLineup` via Prisma (table owner, bypasses RLS).
CREATE POLICY "match_lineup_entry_select_all" ON "match_lineup_entry"
  FOR SELECT TO authenticated
  USING (true);
