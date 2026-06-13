-- ── Promote five feed fields out of stat_player_match.extra into typed scoring columns ──────────────────────
-- feat/scoring-promote-lines: these five FIFAPlayerMatchStats fields gain §4/§8 scoring lines, so they move
-- from the catch-all `extra` JSONB (Prompt capture-extra-stats / 0893b01) to their own nullable INTEGER
-- columns the recompute adapter reads. ADDITIVE ONLY — five nullable ADD COLUMNs, no existing column touched,
-- no backfill here (the columns start NULL; a feed re-ingest of completed matches populates them, then the
-- dirty sweep re-derives via the engine). Canonical SQL produced by `prisma migrate diff` (offline, old→new
-- schema). Nullable, so the column add takes no table-rewrite lock on Postgres.

-- AlterTable
ALTER TABLE "stat_player_match" ADD COLUMN     "ball_recoveries" INTEGER,
ADD COLUMN     "big_chances_created" INTEGER,
ADD COLUMN     "crosses_accurate" INTEGER,
ADD COLUMN     "shots_on_target" INTEGER,
ADD COLUMN     "touches" INTEGER;
