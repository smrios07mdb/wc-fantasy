-- ── Lock-on-play commissioner carve-out (closes the Invariant-3 TODO; ARCHITECTURE.md §3) ─────────
-- The lock-on-play latch `enforce_lineup_lock()` (migration 20260603223500_invariants) freezes a played
-- player's lineup_slot. The legitimate commissioner override (abandoned/postponed matches, a lock-on-play
-- fallback our missing FA/lineup UI blocked) needs a scoped exemption — WITHOUT relaxing the latch for the
-- normal write path or the lock-on-play job (which also runs as service_role and must stay subject to it).
--
-- The exemption is a TRANSACTION-LOCAL GUC `app.commish_override`, set ONLY by commish:lineup's
-- --allow-locked-slot path (`SET LOCAL app.commish_override = 'on'` inside its own write transaction). The
-- trigger reads it via current_setting(..., true) (missing_ok ⇒ NULL when unset ⇒ enforce). No role
-- exemption, no global flag: a blanket service-role exemption would also free the lock-on-play job.
--
-- Portable: runs on a plain Postgres (the DoD's fresh-Postgres) AND on Supabase. current_setting lives in
-- pg_catalog (always on the search_path), so the function stays pinned to the empty search_path the
-- security-followups migration (20260606180000) asserts. CREATE OR REPLACE only swaps the body; the
-- existing trigger trg_lineup_slot_lock keeps pointing at it (no CREATE TRIGGER needed).

CREATE OR REPLACE FUNCTION "enforce_lineup_lock"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  -- Commissioner carve-out: a per-transaction GUC, set ONLY by the --allow-locked-slot override, exempts
  -- the latch for THIS transaction. Unset (the normal path + the lock-on-play job) ⇒ NULL ⇒ enforce below.
  IF current_setting('app.commish_override', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

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
$$;

-- ── Embedded self-test: blocked WITHOUT the GUC, allowed WITH it ───────────────────────────────────
-- Seeds the minimal FK chain (owner context ⇒ RLS bypassed), locks a slot, then asserts the latch blocks
-- a locked-slot is_starter flip with NO GUC and the SAME flip succeeds under the per-tx GUC. All writes are
-- unwound by a sentinel-RAISE rollback (the repo's self-test idiom). VALID-UUID-format TEXT ids: app_user.id
-- / manager.user_id are the auth-flowing columns (the `sub::uuid` shim trap), so they stay canonical even
-- though this test never invokes auth.uid(). updated_at has no DB default ⇒ set explicitly.
DO $$
DECLARE
  v_user    text := '00000000-0000-0000-0000-00000000ab01';
  v_league  text := '00000000-0000-0000-0000-00000000ab02';
  v_mgr     text := '00000000-0000-0000-0000-00000000ab03';
  v_period  text := '00000000-0000-0000-0000-00000000ab04';
  v_team    text := '00000000-0000-0000-0000-00000000ab05';
  v_player  text := '00000000-0000-0000-0000-00000000ab06';
  v_slot    text := '00000000-0000-0000-0000-00000000ab07';
  v_blocked_without_guc boolean := false;
  v_allowed_with_guc    boolean := false;
  v_fail text := NULL;
BEGIN
  BEGIN
    INSERT INTO "app_user" ("id", "email", "updated_at")
      VALUES (v_user, 'lockoverride-selftest@example.com', CURRENT_TIMESTAMP);
    INSERT INTO "league" ("id", "name", "updated_at")
      VALUES (v_league, 'lockoverride_selftest_league', CURRENT_TIMESTAMP);
    INSERT INTO "manager" ("id", "league_id", "user_id", "display_name", "updated_at")
      VALUES (v_mgr, v_league, v_user, 'Lock Override Selftest', CURRENT_TIMESTAMP);
    INSERT INTO "period" ("id", "league_id", "kind", "label", "updated_at")
      VALUES (v_period, v_league, 'group_md', 'LOCK_SELFTEST_MD', CURRENT_TIMESTAMP);
    INSERT INTO "fifa_team" ("id", "name", "updated_at")
      VALUES (v_team, 'Lock Selftest FC', CURRENT_TIMESTAMP);
    INSERT INTO "player" ("id", "balldontlie_player_id", "display_name", "position", "team_id", "updated_at")
      VALUES (v_player, 1900000001, 'Lock Selftest Player', 'MID', v_team, CURRENT_TIMESTAMP);

    -- A slot born UNLOCKED (the trigger requires INSERT.locked_at IS NULL), starting.
    INSERT INTO "lineup_slot" ("id", "manager_id", "period_id", "player_id", "role", "is_starter", "updated_at")
      VALUES (v_slot, v_mgr, v_period, v_player, 'MID', true, CURRENT_TIMESTAMP);
    -- Lock it (NULL -> ts is allowed: the lock-on-play job stamping it). is_starter is now frozen.
    UPDATE "lineup_slot" SET "locked_at" = CURRENT_TIMESTAMP WHERE "id" = v_slot;

    -- (a) WITHOUT the GUC: flipping a locked slot's is_starter MUST raise (the latch holds).
    BEGIN
      UPDATE "lineup_slot" SET "is_starter" = false WHERE "id" = v_slot;
      v_blocked_without_guc := false; -- reached only if NO exception ⇒ the latch FAILED to block
    EXCEPTION
      WHEN raise_exception THEN
        v_blocked_without_guc := true; -- the trigger RAISEd as required
    END;

    -- (b) WITH the per-transaction GUC: the SAME flip MUST succeed (the commissioner carve-out).
    PERFORM set_config('app.commish_override', 'on', true);
    BEGIN
      UPDATE "lineup_slot" SET "is_starter" = false WHERE "id" = v_slot;
      v_allowed_with_guc := true; -- no exception ⇒ the carve-out worked
    EXCEPTION
      WHEN raise_exception THEN
        v_allowed_with_guc := false; -- the carve-out FAILED (trigger still blocked)
    END;
    PERFORM set_config('app.commish_override', 'off', true);

    IF NOT v_blocked_without_guc THEN
      v_fail := 'lock-on-play latch did NOT block a locked-slot is_starter change WITHOUT the GUC';
    ELSIF NOT v_allowed_with_guc THEN
      v_fail := 'app.commish_override GUC did NOT exempt the locked-slot change';
    END IF;

    RAISE EXCEPTION 'lockoverride_selftest_rollback'; -- unwind ALL seed rows
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'lockoverride_selftest_rollback' THEN
        RAISE; -- a real error propagates (never masked)
      END IF;
  END;

  IF v_fail IS NOT NULL THEN
    RAISE EXCEPTION 'enforce_lineup_lock commish-override self-test FAILED: %', v_fail;
  END IF;
END $$;
