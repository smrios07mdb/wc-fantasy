-- Load-bearing invariants enforced in the DATABASE, not hopeful app code (ARCHITECTURE.md §4).
-- Portable: works on a plain Postgres (the DoD's "fresh Postgres") AND on Supabase.

-- ── Invariant 1: unique ACTIVE player ownership per league ────────────────────
-- A player is owned by at most one manager per league while not dropped.
CREATE UNIQUE INDEX "roster_player_active_ownership_uq"
  ON "roster_player" ("league_id", "player_id")
  WHERE "dropped_at" IS NULL;

-- ── Invariant 4 (partial): make illegal FAAB / roster states unrepresentable ──
-- The atomic no-double-spend processing transaction is a later prompt; these CHECKs are the floor.
ALTER TABLE "manager"  ADD CONSTRAINT "manager_faab_budget_nonneg"      CHECK ("faab_budget" >= 0);
ALTER TABLE "faab_bid" ADD CONSTRAINT "faab_bid_amount_nonneg"         CHECK ("amount" >= 0);
ALTER TABLE "faab_bid" ADD CONSTRAINT "faab_bid_add_ne_drop"
  CHECK ("player_drop_id" IS NULL OR "player_drop_id" <> "player_add_id");
ALTER TABLE "league"   ADD CONSTRAINT "league_freeze_hours_nonneg"     CHECK ("result_freeze_hours" >= 0);
ALTER TABLE "league"   ADD CONSTRAINT "league_draft_pick_seconds_pos"  CHECK ("draft_pick_seconds" > 0);
ALTER TABLE "period"   ADD CONSTRAINT "period_cut_count_nonneg"        CHECK ("cut_count" IS NULL OR "cut_count" >= 0);
ALTER TABLE "standing" ADD CONSTRAINT "standing_apa_nonneg"
  CHECK ("all_play_all_w" >= 0 AND "all_play_all_l" >= 0);

-- ── Invariant 3: hindsight-proof swaps — lineup_slot editable only while locked_at IS NULL ────
-- locked_at is a MONOTONIC one-way latch: a slot is born unlocked, may be locked exactly once
-- (NULL -> ts, by the lock-on-play job), and once locked its player/role/is_starter AND its
-- locked_at are immutable. This closes three hindsight holes: editing a locked slot, unlocking
-- (ts -> NULL) then editing, and inserting an already-locked row.
-- TODO(prompt-NN): the legitimate commissioner override (abandoned/postponed matches, lock-on-play
-- fallback — ARCHITECTURE.md §3) must be scoped to a TRANSACTION-LOCAL flag (e.g.
-- `SET LOCAL app.lock_override = 'on'`, which this trigger reads via current_setting() and exempts)
-- or a DEDICATED role — NOT a blanket service-role exemption: the lock-on-play job ALSO runs as
-- service_role and must remain subject to the latch. The override must never relax the invariant
-- for the normal write path.
CREATE OR REPLACE FUNCTION "enforce_lineup_lock"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A slot is born unlocked; only the lock-on-play job sets locked_at (via UPDATE).
    IF NEW."locked_at" IS NOT NULL THEN
      RAISE EXCEPTION 'lineup_slot must be created unlocked (locked_at is set by the lock-on-play job only)';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD."locked_at" IS NOT NULL THEN
      RAISE EXCEPTION 'lineup_slot % is locked (locked_at=%) and cannot be deleted', OLD."id", OLD."locked_at";
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: once locked, the lock is monotonic and the swap-relevant fields are frozen.
  IF OLD."locked_at" IS NOT NULL THEN
    IF NEW."locked_at" IS DISTINCT FROM OLD."locked_at" THEN
      RAISE EXCEPTION 'lineup_slot % is locked (locked_at=%); locked_at is immutable once set', OLD."id", OLD."locked_at";
    END IF;
    IF NEW."player_id"  IS DISTINCT FROM OLD."player_id"
    OR NEW."role"       IS DISTINCT FROM OLD."role"
    OR NEW."is_starter" IS DISTINCT FROM OLD."is_starter" THEN
      RAISE EXCEPTION 'lineup_slot % is locked (locked_at=%); player/role/is_starter are immutable', OLD."id", OLD."locked_at";
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_lineup_slot_lock"
  BEFORE INSERT OR UPDATE OR DELETE ON "lineup_slot"
  FOR EACH ROW EXECUTE FUNCTION "enforce_lineup_lock"();

-- ── Invariant 2: sealed FAAB bids stay secret — Row-Level Security on faab_bid ────────────────
-- Portability shim: ensure auth.uid() exists. On Supabase it already does (returns uuid); we only
-- create a text-returning fallback when absent, so we never clobber Supabase's function.
CREATE SCHEMA IF NOT EXISTS "auth";
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE $f$
      CREATE FUNCTION auth.uid() RETURNS text
      LANGUAGE sql STABLE AS $b$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')
      $b$;
    $f$;
  END IF;
END $$;

ALTER TABLE "faab_bid" ENABLE ROW LEVEL SECURITY;
-- NOT FORCED: the table owner / service_role / superuser bypass RLS, so the worker's batch
-- processor and server-side (service-role) reads are unaffected. RLS bites only JWT-scoped roles.

-- A manager may read ONLY their own pending bids …
CREATE POLICY "faab_bid_select_own_pending" ON "faab_bid"
  FOR SELECT USING (
    "status" = 'pending'
    AND EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "faab_bid"."manager_id" AND m."user_id" = (auth.uid())::text
    )
  );

-- … and EVERYONE may read outcomes once a bid is no longer pending (after the batch).
CREATE POLICY "faab_bid_select_settled" ON "faab_bid"
  FOR SELECT USING ("status" <> 'pending');

-- A manager may submit / amend / cancel only their own pending bids.
CREATE POLICY "faab_bid_insert_own" ON "faab_bid"
  FOR INSERT WITH CHECK (
    "status" = 'pending'
    AND EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "faab_bid"."manager_id" AND m."user_id" = (auth.uid())::text
    )
  );

-- USING gates the pre-image (own pending bid); WITH CHECK pins the POST-image to pending too, so a
-- manager may amend/cancel-by-update a still-pending bid but can NEVER transition it out of pending
-- (self-settle to 'won'). Only the service-role batch — which bypasses RLS — settles bids.
CREATE POLICY "faab_bid_update_own_pending" ON "faab_bid"
  FOR UPDATE
  USING (
    "status" = 'pending'
    AND EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "faab_bid"."manager_id" AND m."user_id" = (auth.uid())::text
    )
  )
  WITH CHECK (
    "status" = 'pending'
    AND EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "faab_bid"."manager_id" AND m."user_id" = (auth.uid())::text
    )
  );

CREATE POLICY "faab_bid_delete_own_pending" ON "faab_bid"
  FOR DELETE USING (
    "status" = 'pending'
    AND EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "faab_bid"."manager_id" AND m."user_id" = (auth.uid())::text
    )
  );

-- ── Invariant 5: frozen periods (seam only — enforcement logic is a later prompt) ─────────────
-- The column already exists (period.frozen_at). Index it for the recompute sweeper's gate.
CREATE INDEX "period_frozen_at_idx" ON "period" ("frozen_at");
COMMENT ON COLUMN "period"."frozen_at" IS
  'Once set (~result_freeze_hours after the wave''s last FT), recompute is commissioner-only. The recompute sweeper gates on this column — TODO(prompt-NN).';
