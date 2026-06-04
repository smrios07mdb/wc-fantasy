-- Prompt 05a: pin the structural match→period link + the per-match kickoff-lock fallback flag.
-- `period_id` is the single source of truth for a fixture's fantasy period (set at schedule-sync from
-- the STRUCTURAL round/matchday, never from kickoff-time inference). `kickoff_lock_fallback` reverts a
-- match to kickoff-locking when live appearance data is missing (Theme B / ARCHITECTURE.md §3).
ALTER TABLE "fifa_match" ADD COLUMN "period_id" TEXT;
ALTER TABLE "fifa_match" ADD COLUMN "kickoff_lock_fallback" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "fifa_match"
  ADD CONSTRAINT "fifa_match_period_id_fkey"
  FOREIGN KEY ("period_id") REFERENCES "period"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "fifa_match_period_id_idx" ON "fifa_match"("period_id");
