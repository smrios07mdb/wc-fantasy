-- Prompt 05a follow-up: retire the unused `RecomputeScope.player_match` value (a dead channel — it had
-- no consumer; ingestion now re-dirties player-matches via `stat_player_match.dirty`, which the sweep's
-- Phase 1 reads directly). Postgres cannot DROP a value from an enum in place, so recreate the type.
-- Safe: no `recompute_dirty` row ever carries scope = 'player_match' (nothing wrote it after the fix),
-- so the USING cast preserves every existing value.
ALTER TYPE "RecomputeScope" RENAME TO "RecomputeScope_old";
CREATE TYPE "RecomputeScope" AS ENUM ('manager_period', 'standing');
ALTER TABLE "recompute_dirty"
  ALTER COLUMN "scope" TYPE "RecomputeScope" USING ("scope"::text::"RecomputeScope");
DROP TYPE "RecomputeScope_old";
