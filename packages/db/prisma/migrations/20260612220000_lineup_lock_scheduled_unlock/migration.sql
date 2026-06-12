-- ── Lock-on-play SELF-HEAL: permit clearing a PREMATURE lock while its source fixture is 'scheduled' ──────
-- DECISIONS.md lock-on-play (the 2026-06-12 recurrence). `enforce_lineup_lock()` makes `locked_at` a
-- monotonic, immutable-once-set latch — correct for a played slot, but it also FROZE the premature stamps the
-- cross-match leak produced, so the cleanup SQL could only run under a manual commissioner override. This
-- migration opens exactly one sanctioned door: a slot may be UNLOCKED (locked_at set→NULL) IFF its lock-source
-- fixture — the match in this slot's period whose home/away team is the player's team — is still 'scheduled'.
-- That is, by definition, a lock that should never have been stamped (a future fixture). Everything else stays
-- immutable: a played (in_progress/completed) slot can never be unlocked, locked_at can never be re-stamped,
-- and player/role/is_starter stay frozen except the sanctioned forfeit bench. The normal write path never NULLs
-- locked_at, so this cannot widen the swap surface for a played slot — it only lets the self-heal cleanup land
-- WITHOUT the commish override, and lets a future deploy NULL a premature stamp the new gate now also prevents.
--
-- Preserves the commissioner carve-out (20260611120000) and the forfeit/voided_at latch (20260612120000)
-- verbatim — this CREATE OR REPLACE only INSERTS the self-heal branch (S) ahead of the locked-row freeze (L).
-- Portable (plain Postgres + Supabase): current_setting + the schema-qualified table reads keep the function on
-- the empty search_path the security-followups migration (20260606180000) asserts. The trigger
-- trg_lineup_slot_lock keeps pointing at it (no CREATE TRIGGER needed).

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
  --     (forfeited) slot can never start again.
  IF OLD."voided_at" IS NOT NULL THEN
    IF NEW."voided_at" IS DISTINCT FROM OLD."voided_at" THEN
      RAISE EXCEPTION 'lineup_slot % is voided (voided_at=%); the forfeit is final and voided_at is immutable', OLD."id", OLD."voided_at";
    END IF;
    IF NEW."is_starter" = true THEN
      RAISE EXCEPTION 'lineup_slot % is voided (forfeited); it cannot be returned to the starting XI', OLD."id";
    END IF;
  END IF;

  -- (S) SELF-HEAL (2026-06-12 recurrence): clearing a PREMATURE lock (locked_at set→NULL) is permitted IFF the
  --     slot's lock-source fixture (the match in THIS slot's period whose home/away team is the player's team)
  --     is still 'scheduled' — i.e. the lock was never legitimate (a future fixture). This is the ONLY
  --     locked_at change permitted once set. player/role/is_starter MUST be unchanged (a pure unlock, never an
  --     edit) so the door can never be used to also mutate a frozen field. If the source match is already
  --     in-play-or-later, this does NOT match → the (L) freeze below raises, so a PLAYED lock stays immutable.
  IF OLD."locked_at" IS NOT NULL AND NEW."locked_at" IS NULL THEN
    IF NEW."player_id"  IS NOT DISTINCT FROM OLD."player_id"
       AND NEW."role"       IS NOT DISTINCT FROM OLD."role"
       AND NEW."is_starter" IS NOT DISTINCT FROM OLD."is_starter"
       AND EXISTS (
         SELECT 1
         FROM public."player" p
         JOIN public."fifa_match" m
           ON m."period_id" = NEW."period_id"
          AND (m."home_team_id" = p."team_id" OR m."away_team_id" = p."team_id")
         WHERE p."id" = NEW."player_id"
           AND m."status"::text = 'scheduled'
       )
    THEN
      RETURN NEW; -- sanctioned self-heal unlock of a premature (future-fixture) stamp
    END IF;
  END IF;

  -- (L) Once locked, the swap-relevant fields are frozen — EXCEPT the single sanctioned FORFEIT transition (a
  --     played starter benched AND voided in the same UPDATE). locked_at itself is immutable once set (the
  --     self-heal above is the sole exception, and only for a still-scheduled source fixture).
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

-- ── Embedded self-test (Theme-F precedent) ─────────────────────────────────────────────────────────────────
-- Proves the self-heal on REAL rows, then unwinds via a sentinel-RAISE rollback (the repo idiom). NEW: (a) a
-- scheduled-source slot's locked_at CAN be cleared (set→NULL); (b) a completed-source slot's locked_at CANNOT.
-- REGRESSIONS (must still hold): (c) a completed-source locked_at RE-STAMP still raises; (d) the forfeit bench
-- (is_starter→false + voided_at set) of a locked slot still succeeds. VALID-UUID-format TEXT ids for the
-- auth-flowing columns (app_user.id / manager.user_id) keep them canonical (the `sub::uuid` shim trap) even
-- though this test never invokes auth.uid(). fifa_match.updated_at has no DB default ⇒ set explicitly.
DO $$
DECLARE
  v_user    text := '00000000-0000-0000-0000-0000005c0001';
  v_league  text := '00000000-0000-0000-0000-0000005c0002';
  v_mgr     text := '00000000-0000-0000-0000-0000005c0003';
  v_period  text := '00000000-0000-0000-0000-0000005c0004';
  v_team_a  text := '00000000-0000-0000-0000-0000005c0005'; -- scheduled match home (player A's team)
  v_team_b  text := '00000000-0000-0000-0000-0000005c0006'; -- scheduled match away
  v_team_c  text := '00000000-0000-0000-0000-0000005c0007'; -- completed match home (player C's team)
  v_team_d  text := '00000000-0000-0000-0000-0000005c0008'; -- completed match away
  v_m_sched text := '00000000-0000-0000-0000-0000005c0009';
  v_m_done  text := '00000000-0000-0000-0000-0000005c000a';
  v_p_sched text := '00000000-0000-0000-0000-0000005c000b'; -- future-fixture player (premature lock)
  v_p_done  text := '00000000-0000-0000-0000-0000005c000c'; -- played player (legitimate lock)
  v_s_sched text := '00000000-0000-0000-0000-0000005c000d';
  v_s_done  text := '00000000-0000-0000-0000-0000005c000e';
  v_sched_clear_ok      boolean := false; -- (a) scheduled-source clear permitted
  v_done_clear_blocked  boolean := false; -- (b) completed-source clear raises
  v_done_restamp_blocked boolean := false; -- (c) completed-source re-stamp raises (regression)
  v_forfeit_ok          boolean := false; -- (d) forfeit bench still permitted (regression)
  v_fail text := NULL;
BEGIN
  BEGIN
    INSERT INTO "app_user" ("id", "email", "updated_at")
      VALUES (v_user, 'lockunlock-selftest@example.com', CURRENT_TIMESTAMP);
    INSERT INTO "league" ("id", "name", "updated_at")
      VALUES (v_league, 'lockunlock_selftest_league', CURRENT_TIMESTAMP);
    INSERT INTO "manager" ("id", "league_id", "user_id", "display_name", "updated_at")
      VALUES (v_mgr, v_league, v_user, 'Lock Unlock Selftest', CURRENT_TIMESTAMP);
    INSERT INTO "period" ("id", "league_id", "kind", "label", "updated_at")
      VALUES (v_period, v_league, 'group_md', 'LOCK_UNLOCK_SELFTEST_MD', CURRENT_TIMESTAMP);
    INSERT INTO "fifa_team" ("id", "name", "updated_at") VALUES
      (v_team_a, 'Unlock Selftest A', CURRENT_TIMESTAMP),
      (v_team_b, 'Unlock Selftest B', CURRENT_TIMESTAMP),
      (v_team_c, 'Unlock Selftest C', CURRENT_TIMESTAMP),
      (v_team_d, 'Unlock Selftest D', CURRENT_TIMESTAMP);
    -- The lock-source fixtures: one still scheduled, one completed — same period.
    INSERT INTO "fifa_match" ("id", "balldontlie_match_id", "kickoff_at", "status", "period_id", "home_team_id", "away_team_id", "updated_at")
      VALUES (v_m_sched, 1905100001, CURRENT_TIMESTAMP + interval '2 days', 'scheduled', v_period, v_team_a, v_team_b, CURRENT_TIMESTAMP);
    INSERT INTO "fifa_match" ("id", "balldontlie_match_id", "kickoff_at", "status", "period_id", "home_team_id", "away_team_id", "updated_at")
      VALUES (v_m_done, 1905100002, CURRENT_TIMESTAMP - interval '3 hours', 'completed', v_period, v_team_c, v_team_d, CURRENT_TIMESTAMP);
    INSERT INTO "player" ("id", "balldontlie_player_id", "display_name", "position", "team_id", "updated_at")
      VALUES (v_p_sched, 1905200001, 'Unlock Selftest Sched', 'MID', v_team_a, CURRENT_TIMESTAMP);
    INSERT INTO "player" ("id", "balldontlie_player_id", "display_name", "position", "team_id", "updated_at")
      VALUES (v_p_done, 1905200002, 'Unlock Selftest Done', 'MID', v_team_c, CURRENT_TIMESTAMP);

    -- Two slots, born unlocked + starting, then locked (NULL→ts is the lock-on-play job stamping).
    INSERT INTO "lineup_slot" ("id", "manager_id", "period_id", "player_id", "role", "is_starter", "updated_at")
      VALUES (v_s_sched, v_mgr, v_period, v_p_sched, 'MID', true, CURRENT_TIMESTAMP);
    INSERT INTO "lineup_slot" ("id", "manager_id", "period_id", "player_id", "role", "is_starter", "updated_at")
      VALUES (v_s_done, v_mgr, v_period, v_p_done, 'MID', true, CURRENT_TIMESTAMP);
    UPDATE "lineup_slot" SET "locked_at" = CURRENT_TIMESTAMP WHERE "id" IN (v_s_sched, v_s_done);

    -- (a) Scheduled-source slot: clear locked_at (set→NULL) → MUST succeed (the self-heal).
    BEGIN
      UPDATE "lineup_slot" SET "locked_at" = NULL WHERE "id" = v_s_sched;
      v_sched_clear_ok := true;
    EXCEPTION WHEN raise_exception THEN
      v_sched_clear_ok := false; -- the latch wrongly blocked the sanctioned self-heal
    END;

    -- (b) Completed-source slot: clear locked_at → MUST raise (a played lock is immutable).
    BEGIN
      UPDATE "lineup_slot" SET "locked_at" = NULL WHERE "id" = v_s_done;
      v_done_clear_blocked := false; -- reached only if NO exception ⇒ the latch FAILED to block
    EXCEPTION WHEN raise_exception THEN
      v_done_clear_blocked := true;
    END;

    -- (c) Completed-source slot: re-stamp locked_at (ts→ts') → MUST raise (immutable once set; regression).
    BEGIN
      UPDATE "lineup_slot" SET "locked_at" = CURRENT_TIMESTAMP + interval '1 hour' WHERE "id" = v_s_done;
      v_done_restamp_blocked := false;
    EXCEPTION WHEN raise_exception THEN
      v_done_restamp_blocked := true;
    END;

    -- (d) Forfeit bench of a locked slot (is_starter→false + voided_at set) → MUST still succeed (regression).
    BEGIN
      UPDATE "lineup_slot" SET "is_starter" = false, "voided_at" = CURRENT_TIMESTAMP WHERE "id" = v_s_done;
      v_forfeit_ok := true;
    EXCEPTION WHEN raise_exception THEN
      v_forfeit_ok := false;
    END;

    RAISE EXCEPTION 'lockunlock_selftest_rollback'; -- unwind ALL seed rows
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'lockunlock_selftest_rollback' THEN
        RAISE; -- a real error propagates (never masked)
      END IF;
  END;

  IF NOT v_sched_clear_ok THEN
    v_fail := 'a scheduled-source premature lock could NOT be cleared (self-heal wrongly blocked)';
  ELSIF NOT v_done_clear_blocked THEN
    v_fail := 'a completed-source (played) lock WAS cleared — the immutability latch failed';
  ELSIF NOT v_done_restamp_blocked THEN
    v_fail := 'a completed-source locked_at was allowed to be re-stamped';
  ELSIF NOT v_forfeit_ok THEN
    v_fail := 'the forfeit bench (is_starter→false + voided_at) of a locked slot was wrongly blocked';
  END IF;

  IF v_fail IS NOT NULL THEN
    RAISE EXCEPTION 'enforce_lineup_lock scheduled-unlock self-test FAILED: %', v_fail;
  END IF;
END $$;
