-- P1 live-security fix — close the pre-kickoff read of rivals' pick'em picks via the Data API / Realtime.
--
-- BUG: `pool_pick_select_league_member` (created in 20260610130000_pool_pick) gates SELECT on LEAGUE
--   MEMBERSHIP ALONE — no kickoff predicate, by design (the original migration's comment says the
--   anti-copying clock "lives in the read QUERY, NOT here"). But `pool_pick` IS in the
--   `supabase_realtime` publication, so any authenticated league member can read EVERY league-mate's
--   pick for a NOT-YET-KICKED-OFF fixture straight off the PostgREST Data API or a Realtime subscription,
--   bypassing the loader-only reveal gate (`apps/web/src/pool/prismaStore.ts → readVisiblePicks`). That
--   leaks rivals' predictions before lock — the exact pre-kickoff secrecy the pool depends on.
--   anon reads ZERO (RLS default-deny, no anon policy), so this is CROSS-MEMBER-WITHIN-LEAGUE, not public.
--
-- FIX (this migration): DROP + re-CREATE the policy so the SAME rule the loader already enforces is also
--   enforced at the RLS layer — own picks ALWAYS; OTHER managers' picks ONLY once their fixture kicks off.
--   The composed USING is:  league-member  AND  ( own-pick  OR  fixture-kicked-off ).
--     * league-member      — UNCHANGED from the original: EXISTS a `manager` row in the pool_pick's league
--                            owned by the caller. Cross-league isolation (kept).
--     * own-pick           — EXISTS the pool_pick's OWN `manager` row owned by the caller. Own picks are
--                            always visible (mirrors the loader's `OR managerId = viewer`).
--     * fixture-kicked-off — the pool_pick's `fifa_match.kickoff_at <= now()` (mirrors the loader's
--                            `OR match.kickoffAt <= now`). Resolved via a SECURITY DEFINER helper — see
--                            the nested-RLS note below.
--   This MATCHES `readVisiblePicks` exactly: leagueId scope + (own OR match kicked off). The leaderboard
--   read (`buildPoolLeaderboardView`) is a SEPARATE server/Prisma path that bypasses RLS as table owner,
--   so it is UNAFFECTED — only the browser-reachable anon/authenticated surface is tightened.
--
-- NESTED-RLS DECISION (the P0 lesson — why a SECURITY DEFINER helper for the kickoff check, NOT a join):
--   `fifa_match` has RLS ENABLED (the 20260605170000 blanket lockdown) but NO SELECT policy → under the
--   real `authenticated` role a subquery `SELECT 1 FROM fifa_match WHERE ...` returns ZERO rows
--   (default-deny). A naive in-policy join to `fifa_match` to read `kickoff_at` would therefore NEVER
--   match, hiding league-mates' picks FOREVER, even post-kickoff — a silent false-negative the
--   migration-owner self-test (RLS bypassed) would not catch. This is the same trap `score_manager_period`
--   hit (`20260606170000_rls_realtime_vsfield`); the standard fix is a SECURITY DEFINER helper that reads
--   `fifa_match` as its owner (RLS bypassed, ENABLE not FORCE). The OWN-PICK and LEAGUE-MEMBER subqueries
--   need NO helper: they touch only `manager`, and `manager_select_own` already makes the caller's OWN
--   manager row visible inside a policy subquery (the load-bearing idiom shared by draft/standing/faab/
--   the original pool policy). We deliberately do NOT denormalize `kickoff_at` onto `pool_pick`: that
--   would require a write-path change + a backfill + an ongoing sync invariant that the feed's fixture
--   RESCHEDULES would violate (a stale copy could reveal early or hide late) — `fifa_match.kickoff_at`
--   stays the single source of truth, read live, exactly as the loader reads it.
--
-- The helper is hardened per the Theme-F security follow-ups (mirrors vsfield_caller_shares_league_with
-- _manager): pinned `search_path`, EXECUTE revoked from PUBLIC and granted only to `authenticated`,
-- read-only (returns a boolean), schema-qualified. It reads only `kickoff_at` for ONE match id — it leaks
-- no row data; "has this fixture started?" is public information.
--
-- DDL-ONLY: a pure policy swap + helper create. It performs NO data writes, so `prisma migrate deploy` —
-- which Render runs as a `preDeployCommand` against the LIVE DB each release — touches no application rows
-- and runs no seed/assert/rollback. The role-switched composed-RLS regression coverage lives in a
-- DB-gated integration suite, NOT in this migration:
-- apps/web/src/pool/poolPickRls.integration.test.ts (gated on POOL_PICK_RLS_PG_TEST_URL).
--
-- No portability shims are needed: `migrate deploy` always applies the full chain in order, so the
-- `authenticated` role (20260605170000) and `auth.uid()` (20260603223500) already exist before this
-- migration runs (the helper itself uses neither — only `now()` + `fifa_match`). ENABLE (not FORCE) RLS,
-- so the table-owning `postgres` role (Prisma, the worker, provisioning, migrate deploy) is UNAFFECTED;
-- RLS bites only the JWT-scoped anon/authenticated roles reachable via the Data API + Realtime.

-- ── (1) SECURITY DEFINER kickoff helper ─────────────────────────────────────────────────────────────
-- TRUE iff the given match has kicked off (kickoff_at <= now()). SECURITY DEFINER so it reads `fifa_match`
-- as the function owner, bypassing that table's default-deny RLS; STABLE because `now()` and the read are
-- stable within a statement. CREATE OR REPLACE for re-runnability.
CREATE OR REPLACE FUNCTION public.pool_pick_match_kicked_off(p_match_id text)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM "fifa_match" fm
    WHERE fm."id" = p_match_id
      AND fm."kickoff_at" <= now()
  );
$fn$;

-- Lock the helper down: not callable by PUBLIC (incl. anon); only the authenticated role the policy runs as.
REVOKE ALL ON FUNCTION public.pool_pick_match_kicked_off(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pool_pick_match_kicked_off(text) TO "authenticated";

-- ── (2) Replace the SELECT policy with the clock-gated rule ──────────────────────────────────────────
DROP POLICY "pool_pick_select_league_member" ON "pool_pick";

-- A pick is readable by an authenticated MEMBER of its league, AND only when it is the caller's OWN pick
-- OR its fixture has kicked off. Same league-member / own-row idioms as the original (manager subqueries
-- resolve correctly under `manager_select_own`); the kickoff branch goes through the SECURITY DEFINER
-- helper because `fifa_match` is RLS default-deny. This mirrors `readVisiblePicks` exactly.
CREATE POLICY "pool_pick_select_league_member" ON "pool_pick"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."league_id" = "pool_pick"."league_id"
        AND m."user_id" = (auth.uid())::text
    )
    AND (
      EXISTS (
        SELECT 1 FROM "manager" m
        WHERE m."id" = "pool_pick"."manager_id"
          AND m."user_id" = (auth.uid())::text
      )
      OR public.pool_pick_match_kicked_off("pool_pick"."match_id")
    )
  );
