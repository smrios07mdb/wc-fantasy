-- ── Lineup forfeit engine (C1): lineup_slot.voided_at + the one-way forfeit latch ─────────────────────
-- DECISIONS.md Theme B forfeit model: a player who has PLAYED is no longer hard-locked — his slot stays
-- movable. But moving a played starter to the bench is a FORFEIT: it is final and one-way. We record it by
-- stamping `voided_at` (and benching him). His earned points are forfeited for the period AND he can never
-- return to the starting XI this period.
--
-- This migration (1) adds the column and (2) EXTENDS enforce_lineup_lock() so the DB co-enforces the model:
--   • a locked row's is_starter is still frozen — EXCEPT the single sanctioned forfeit transition (a played
--     starter benched AND voided in the SAME update). That is the only `voided_at`-bearing write path;
--   • voided_at is a one-way latch: once set it is immutable (no un-void) and the slot can never start again.
-- `locked_at` is retired from MOVABILITY (the read sites now gate on voided_at/frozen_at) but is NOT removed:
-- the lock-on-play job still stamps it and the latch above still reads it (so a played BENCH player still
-- can't be promoted — no hindsight upside). Removing the stamping/latch is a proposed C2 follow-up.
--
-- Portable (plain Postgres + Supabase): current_setting lives in pg_catalog, so the function keeps the empty
-- search_path the security-followups migration asserts. CREATE OR REPLACE only swaps the body; the existing
-- trigger trg_lineup_slot_lock keeps pointing at it (no CREATE TRIGGER needed).

ALTER TABLE "lineup_slot" ADD COLUMN "voided_at" timestamptz;

CREATE OR REPLACE FUNCTION "enforce_lineup_lock"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  -- Commissioner carve-out (unchanged): a per-transaction GUC, set ONLY by the --allow-locked-slot override,
  -- exempts the latch for THIS transaction. Unset (normal path + the lock-on-play job) ⇒ NULL ⇒ enforce.
  IF current_setting('app.commish_override', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A slot is born unlocked AND un-voided; both columns are set only by later UPDATEs.
    IF NEW."locked_at" IS NOT NULL THEN
      RAISE EXCEPTION 'lineup_slot must be created unlocked (locked_at is set by the lock-on-play job only)';
    END IF;
    IF NEW."voided_at" IS NOT NULL THEN
      RAISE EXCEPTION 'lineup_slot must be created un-voided (voided_at is set by the forfeit bench only)';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD."locked_at" IS NOT NULL THEN
      RAISE EXCEPTION 'lineup_slot % is locked (locked_at=%) and cannot be deleted', OLD."id", OLD."locked_at";
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE.
  -- (V) voided_at is a ONE-WAY latch (independent of locked_at): once set it is immutable, and a voided
  --     (forfeited) slot can never start again. These guard the one-way door at the DB level.
  IF OLD."voided_at" IS NOT NULL THEN
    IF NEW."voided_at" IS DISTINCT FROM OLD."voided_at" THEN
      RAISE EXCEPTION 'lineup_slot % is voided (voided_at=%); the forfeit is final and voided_at is immutable', OLD."id", OLD."voided_at";
    END IF;
    IF NEW."is_starter" = true THEN
      RAISE EXCEPTION 'lineup_slot % is voided (forfeited); it cannot be returned to the starting XI', OLD."id";
    END IF;
  END IF;

  -- (L) Once locked, the swap-relevant fields are frozen — EXCEPT the single sanctioned FORFEIT transition:
  --     a played starter benched AND voided in the same UPDATE (is_starter true→false, voided_at NULL→set,
  --     locked_at/player_id/role unchanged). That is the only way a locked row's is_starter may change.
  IF OLD."locked_at" IS NOT NULL THEN
    IF NEW."locked_at" IS DISTINCT FROM OLD."locked_at" THEN
      RAISE EXCEPTION 'lineup_slot % is locked (locked_at=%); locked_at is immutable once set', OLD."id", OLD."locked_at";
    END IF;
    IF NOT (
      OLD."is_starter" = true AND NEW."is_starter" = false
      AND OLD."voided_at" IS NULL AND NEW."voided_at" IS NOT NULL
      AND NEW."player_id" IS NOT DISTINCT FROM OLD."player_id"
      AND NEW."role"      IS NOT DISTINCT FROM OLD."role"
    ) THEN
      IF NEW."player_id"  IS DISTINCT FROM OLD."player_id"
      OR NEW."role"       IS DISTINCT FROM OLD."role"
      OR NEW."is_starter" IS DISTINCT FROM OLD."is_starter" THEN
        RAISE EXCEPTION 'lineup_slot % is locked (locked_at=%); player/role/is_starter are immutable (except the forfeit bench)', OLD."id", OLD."locked_at";
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── Embedded self-test (Theme-F precedent) ─────────────────────────────────────────────────────────────
-- Proves the EXTENDED latch on real rows, then unwinds via a sentinel-RAISE rollback (the repo idiom). Four
-- assertions: (a) the forfeit transition (benched + voided) is PERMITTED on a locked row; (b) a NON-forfeit
-- is_starter flip of a locked row is still BLOCKED; (c) a voided slot can't start again; (d) voided_at can't
-- be un-set. VALID-UUID-format TEXT ids for the auth-flowing columns (app_user.id / manager.user_id) keep
-- them canonical (the `sub::uuid` shim trap) even though this test never invokes auth.uid(). updated_at has
-- no DB default ⇒ set explicitly.
DO $$
DECLARE
  v_user    text := '00000000-0000-0000-0000-0000000fcf01';
  v_league  text := '00000000-0000-0000-0000-0000000fcf02';
  v_mgr     text := '00000000-0000-0000-0000-0000000fcf03';
  v_period  text := '00000000-0000-0000-0000-0000000fcf04';
  v_team    text := '00000000-0000-0000-0000-0000000fcf05';
  v_p1      text := '00000000-0000-0000-0000-0000000fcf06'; -- forfeited (a,c,d)
  v_p2      text := '00000000-0000-0000-0000-0000000fcf07'; -- non-forfeit flip (b)
  v_slot1   text := '00000000-0000-0000-0000-0000000fcf08';
  v_slot2   text := '00000000-0000-0000-0000-0000000fcf09';
  v_forfeit_ok        boolean := false; -- (a) forfeit permitted
  v_nonforfeit_blocked boolean := false; -- (b) non-forfeit flip blocked
  v_start_voided_blocked boolean := false; -- (c) start-of-voided blocked
  v_unvoid_blocked    boolean := false; -- (d) un-void blocked
  v_fail text := NULL;
BEGIN
  BEGIN
    INSERT INTO "app_user" ("id", "email", "updated_at")
      VALUES (v_user, 'forfeit-selftest@example.com', CURRENT_TIMESTAMP);
    INSERT INTO "league" ("id", "name", "updated_at")
      VALUES (v_league, 'forfeit_selftest_league', CURRENT_TIMESTAMP);
    INSERT INTO "manager" ("id", "league_id", "user_id", "display_name", "updated_at")
      VALUES (v_mgr, v_league, v_user, 'Forfeit Selftest', CURRENT_TIMESTAMP);
    INSERT INTO "period" ("id", "league_id", "kind", "label", "updated_at")
      VALUES (v_period, v_league, 'group_md', 'FORFEIT_SELFTEST_MD', CURRENT_TIMESTAMP);
    INSERT INTO "fifa_team" ("id", "name", "updated_at")
      VALUES (v_team, 'Forfeit Selftest FC', CURRENT_TIMESTAMP);
    INSERT INTO "player" ("id", "balldontlie_player_id", "display_name", "position", "team_id", "updated_at")
      VALUES (v_p1, 1900000101, 'Forfeit Selftest P1', 'MID', v_team, CURRENT_TIMESTAMP);
    INSERT INTO "player" ("id", "balldontlie_player_id", "display_name", "position", "team_id", "updated_at")
      VALUES (v_p2, 1900000102, 'Forfeit Selftest P2', 'MID', v_team, CURRENT_TIMESTAMP);

    -- Two slots born unlocked + starting, then locked by play (the lock-on-play job stamping locked_at).
    INSERT INTO "lineup_slot" ("id", "manager_id", "period_id", "player_id", "role", "is_starter", "updated_at")
      VALUES (v_slot1, v_mgr, v_period, v_p1, 'MID', true, CURRENT_TIMESTAMP);
    INSERT INTO "lineup_slot" ("id", "manager_id", "period_id", "player_id", "role", "is_starter", "updated_at")
      VALUES (v_slot2, v_mgr, v_period, v_p2, 'MID', true, CURRENT_TIMESTAMP);
    UPDATE "lineup_slot" SET "locked_at" = CURRENT_TIMESTAMP WHERE "id" IN (v_slot1, v_slot2);

    -- (a) Forfeit transition: bench + void a LOCKED starter in one update → MUST succeed.
    BEGIN
      UPDATE "lineup_slot" SET "is_starter" = false, "voided_at" = CURRENT_TIMESTAMP WHERE "id" = v_slot1;
      v_forfeit_ok := true;
    EXCEPTION WHEN raise_exception THEN
      v_forfeit_ok := false; -- the latch wrongly blocked the sanctioned forfeit
    END;

    -- (b) Non-forfeit flip: bench a LOCKED starter WITHOUT voiding → MUST raise.
    BEGIN
      UPDATE "lineup_slot" SET "is_starter" = false WHERE "id" = v_slot2;
      v_nonforfeit_blocked := false; -- reached only if NO exception ⇒ the latch FAILED to block
    EXCEPTION WHEN raise_exception THEN
      v_nonforfeit_blocked := true; -- blocked as required
    END;

    -- (c) Start-of-voided: return the now-voided v_slot1 to the XI → MUST raise.
    BEGIN
      UPDATE "lineup_slot" SET "is_starter" = true WHERE "id" = v_slot1;
      v_start_voided_blocked := false;
    EXCEPTION WHEN raise_exception THEN
      v_start_voided_blocked := true;
    END;

    -- (d) Un-void: clear voided_at on v_slot1 → MUST raise (one-way).
    BEGIN
      UPDATE "lineup_slot" SET "voided_at" = NULL WHERE "id" = v_slot1;
      v_unvoid_blocked := false;
    EXCEPTION WHEN raise_exception THEN
      v_unvoid_blocked := true;
    END;

    IF NOT v_forfeit_ok THEN
      v_fail := 'the sanctioned forfeit transition (bench + void a locked starter) was wrongly BLOCKED';
    ELSIF NOT v_nonforfeit_blocked THEN
      v_fail := 'a NON-forfeit is_starter flip of a locked slot was NOT blocked';
    ELSIF NOT v_start_voided_blocked THEN
      v_fail := 'a voided (forfeited) slot was allowed back into the starting XI';
    ELSIF NOT v_unvoid_blocked THEN
      v_fail := 'voided_at was allowed to be un-set (the forfeit is not one-way)';
    END IF;

    RAISE EXCEPTION 'forfeit_selftest_rollback'; -- unwind ALL seed rows
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'forfeit_selftest_rollback' THEN
        RAISE; -- a real error propagates (never masked)
      END IF;
  END;

  IF v_fail IS NOT NULL THEN
    RAISE EXCEPTION 'enforce_lineup_lock forfeit self-test FAILED: %', v_fail;
  END IF;
END $$;
