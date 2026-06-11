-- Theme-D per-matchday acquisition window (DECISIONS.md → Theme D amendment): swap FAAB cadence from
-- the retired daily cron to one blind-bid batch per scoring period, cleared BEFORE the period's first
-- kickoff. Two additive, nullable columns on `period`:
--   • waiver_batch_at  — commissioner-configurable batch deadline; NULL = the computed default
--                        (first_kickoff - FAAB_BATCH_LEAD_MIN). The worker tick reads it.
--   • batch_cleared_at — idempotency latch: stamped (= now) when this period's batch has run, so the
--                        60s worker tick fires `resolveFaabBatch` for the period exactly once.
--
-- No RLS self-test: the `period` table carries NO row-level security (verified — among period-named
-- tables only score_manager_period is RLS'd), and these are server-only operational columns the worker
-- writes and never client-reads. So this follows the plain additive column-add pattern
-- (cf. 20260609120000_draft_timer_enabled); there is no auth.uid()-cast surface to embed a UUID-shim
-- self-test for. Nullable + no default ⇒ a safe, instant add on the existing (empty) table.
ALTER TABLE "period" ADD COLUMN "waiver_batch_at" TIMESTAMPTZ(6);
ALTER TABLE "period" ADD COLUMN "batch_cleared_at" TIMESTAMPTZ(6);
