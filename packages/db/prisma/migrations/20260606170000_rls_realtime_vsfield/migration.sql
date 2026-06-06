-- "Vs the field" live screen (ARCHITECTURE.md §5, Prompt 11): open up the two derived tables the
-- browser reads — `score_manager_period` (a manager's live wave total) and `standing` (the all-play-all
-- power record) — so an authenticated league member can SELECT them (direct read + Realtime
-- postgres_changes), and add both to the Realtime publication so row changes actually broadcast.
--
-- Theme F invariant: any NEW table the browser reads (direct `.from()` OR a Realtime subscription) needs
-- its own `authenticated` SELECT policy, or the client sees ZERO rows. RLS is ALREADY enabled on both
-- tables (the 20260605170000 lockdown turned it on for every public table); adding a SELECT policy is
-- what opts them into browser-readability. NO INSERT/UPDATE/DELETE policies → every client write stays
-- default-denied; all writes go through the server (the recompute worker), which bypasses RLS as the
-- table-owning `postgres` role. No other table gains a policy → no other table becomes browser-readable.
--
-- Scope = WHOLE LEAGUE (all-play-all means a member sees the entire field), same intent as
-- draft/draft_pick: `auth.uid() = manager.user_id` via a `manager` league-membership check. Portable to
-- the DoD's plain-Postgres (the `authenticated` role stub + the `auth.uid()` shim from earlier
-- migrations; both re-included idempotently below so this migration is self-sufficient).

-- ── Portability shims (idempotent; no-ops on Supabase) ────────────────────────────────────────────
-- The `authenticated` role (policies target it) and `auth.uid()` (reads the JWT `sub` claim) exist on
-- Supabase but not on a bare Postgres. Mirror 20260605170000 / 20260603223500 so `migrate deploy`
-- succeeds on the fresh-Postgres DoD.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE "authenticated";
  END IF;
END $$;

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

-- ── (1) standing — direct league-scoped SELECT policy ──────────────────────────────────────────────
-- `standing` carries `league_id`, so the check references ONLY the caller's OWN manager row (visible via
-- the existing `manager_select_own` policy) and the row's own `league_id` — exactly the
-- draft_select_league_member idiom, and it survives RLS-on-the-subquery (no other manager row is read).
CREATE POLICY "standing_select_league_member" ON "standing"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."league_id" = "standing"."league_id"
        AND m."user_id" = (auth.uid())::text
    )
  );

-- ── (2) score_manager_period — league-scoped SELECT via a SECURITY DEFINER helper ──────────────────
-- This table has NO `league_id` (PK is manager_id+period_id); its league is reachable only through the
-- ROW's manager — but `manager_select_own` makes OTHER managers' rows invisible inside a policy
-- subquery, so a naive `JOIN manager owner ON owner.id = manager_id` would hide every other manager's
-- score (breaking the all-play-all field). The standard fix: a SECURITY DEFINER helper that bypasses
-- RLS for the league lookup, so a member sees the WHOLE field. Hardened per the Theme-F security
-- follow-ups: pinned `search_path`, EXECUTE revoked from PUBLIC and granted only to `authenticated`.
-- It is read-only (returns a membership boolean) and `auth.uid()` is schema-qualified.
CREATE OR REPLACE FUNCTION public.vsfield_caller_shares_league_with_manager(p_manager_id text)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM "manager" caller
    JOIN "manager" owner ON owner."id" = p_manager_id
    WHERE caller."user_id" = (auth.uid())::text
      AND caller."league_id" = owner."league_id"
  );
$fn$;

REVOKE EXECUTE ON FUNCTION public.vsfield_caller_shares_league_with_manager(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vsfield_caller_shares_league_with_manager(text) TO "authenticated";

CREATE POLICY "score_manager_period_select_league_member" ON "score_manager_period"
  FOR SELECT TO authenticated
  USING (public.vsfield_caller_shares_league_with_manager("manager_id"));

-- ── (3) Realtime publication ──────────────────────────────────────────────────────────────────────
-- postgres_changes only broadcast for tables in the `supabase_realtime` publication (draft/draft_pick
-- were added via the Supabase dashboard; this is the first migration to manage it in SQL). Guarded: the
-- publication does not exist on plain-Postgres (skip), and a table already in it is skipped (idempotent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
        AND tablename = 'score_manager_period'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.score_manager_period;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
        AND tablename = 'standing'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.standing;
    END IF;
  END IF;
END $$;

-- ── (4) Self-test (Theme F): a league member CAN read the league's rows; a non-member CANNOT ────────
-- Runs during `prisma migrate deploy` (vitest never executes SQL). Asserts the EFFECTIVE policy logic:
-- `standing` via its predicate, and `score_manager_period` via the SECURITY DEFINER helper that the
-- policy uses (the helper bypasses RLS, so its result here — run as the migration owner — is identical
-- to the role-switched policy result; this is what makes an owner-run self-test faithful, unlike a raw
-- subquery which the owner would over-see). Critically it checks a member can see ANOTHER manager's
-- score (the all-play-all field), not just their own. The seed is ALWAYS unwound via a sentinel raise
-- (an inner sub-block rolls its DB changes back), so NOTHING persists even on production; a real
-- mismatch is recorded and re-raised AFTER cleanup, failing the deploy loudly. The live JWT-authed
-- `postgres_changes` delivery on real Supabase is the separate provision-time gate.
DO $$
DECLARE
  v_lg        text := 'rls_selftest_lg_in';
  v_lg2       text := 'rls_selftest_lg_out';
  v_mgr_in    text := 'rls_selftest_mgr_in';     -- the caller's own manager (league lg)
  v_mgr_other text := 'rls_selftest_mgr_other';  -- ANOTHER manager in the SAME league
  v_mgr_out   text := 'rls_selftest_mgr_out';    -- a manager in a DIFFERENT league
  v_period    text := 'rls_selftest_period';
  v_standing  text := 'rls_selftest_standing';
  v_user_in   text := 'rls_selftest_user_in';
  v_user_out  text := 'rls_selftest_user_out';
  v_member_sees_own   boolean := false;
  v_member_sees_other boolean := false;  -- the all-play-all property the naive policy broke
  v_nonmember_sees    boolean := true;
  v_std_member        boolean := false;
  v_std_nonmember     boolean := true;
  v_fail text := NULL;
BEGIN
  BEGIN
    -- `manager.user_id` FKs to `app_user.id`; in the real app both equal the Supabase auth uid, so
    -- seed app_user rows whose ids match the JWT `sub` we drive auth.uid() with below.
    INSERT INTO "app_user" ("id", "email", "updated_at")
      VALUES (v_user_in, 'rls-selftest-in@example.com', CURRENT_TIMESTAMP),
             (v_user_out, 'rls-selftest-out@example.com', CURRENT_TIMESTAMP);
    INSERT INTO "league" ("id", "name", "updated_at")
      VALUES (v_lg, 'rls-selftest-in', CURRENT_TIMESTAMP),
             (v_lg2, 'rls-selftest-out', CURRENT_TIMESTAMP);
    INSERT INTO "manager" ("id", "league_id", "user_id", "display_name", "updated_at")
      VALUES (v_mgr_in, v_lg, v_user_in, 'in', CURRENT_TIMESTAMP),
             (v_mgr_other, v_lg, NULL, 'other', CURRENT_TIMESTAMP),
             (v_mgr_out, v_lg2, v_user_out, 'out', CURRENT_TIMESTAMP);
    INSERT INTO "period" ("id", "league_id", "kind", "label", "updated_at")
      VALUES (v_period, v_lg, 'group_md', 'RLS-SELFTEST-MD1', CURRENT_TIMESTAMP);
    INSERT INTO "score_manager_period" ("manager_id", "period_id", "points")
      VALUES (v_mgr_in, v_period, 10), (v_mgr_other, v_period, 20);
    INSERT INTO "standing" ("id", "league_id", "manager_id", "scope", "total_points")
      VALUES (v_standing, v_lg, v_mgr_in, 'group_stage', 50);

    -- member (in-league user)
    PERFORM set_config('request.jwt.claim.sub', v_user_in, true);
    v_member_sees_own   := public.vsfield_caller_shares_league_with_manager(v_mgr_in);
    v_member_sees_other := public.vsfield_caller_shares_league_with_manager(v_mgr_other);
    v_std_member := EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."league_id" = v_lg AND m."user_id" = (auth.uid())::text);

    -- non-member (user of a DIFFERENT league)
    PERFORM set_config('request.jwt.claim.sub', v_user_out, true);
    v_nonmember_sees := public.vsfield_caller_shares_league_with_manager(v_mgr_in)
                     OR public.vsfield_caller_shares_league_with_manager(v_mgr_other);
    v_std_nonmember := EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."league_id" = v_lg AND m."user_id" = (auth.uid())::text);

    PERFORM set_config('request.jwt.claim.sub', '', true);

    IF NOT v_member_sees_own THEN
      v_fail := 'league member cannot SELECT their own score_manager_period';
    ELSIF NOT v_member_sees_other THEN
      v_fail := 'league member cannot SELECT another manager''s score_manager_period (all-play-all broken)';
    ELSIF v_nonmember_sees THEN
      v_fail := 'non-member CAN SELECT score_manager_period';
    ELSIF NOT v_std_member THEN
      v_fail := 'league member cannot SELECT standing';
    ELSIF v_std_nonmember THEN
      v_fail := 'non-member CAN SELECT standing';
    END IF;

    RAISE EXCEPTION 'rls_selftest_rollback';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'rls_selftest_rollback' THEN
        PERFORM set_config('request.jwt.claim.sub', '', true);
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF v_fail IS NOT NULL THEN
    RAISE EXCEPTION 'RLS self-test FAILED: %', v_fail;
  END IF;
END $$;
