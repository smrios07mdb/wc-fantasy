-- P0 live-security fix — close the anonymous read of every settled FAAB bid.
--
-- BUG: `faab_bid_select_settled` (created in 20260603223500_invariants) was
--   CREATE POLICY "faab_bid_select_settled" ON "faab_bid" FOR SELECT USING ("status" <> 'pending');
-- i.e. TO public (no role clause) with NO identity predicate. RLS is permissive (policies OR
-- together), so this OPENED every non-pending bid to ANYONE who can reach the PostgREST Data API
-- with the anon key — across ALL leagues. Confirmed live: an anon SELECT returned all settled rows.
--
-- FIX (this migration): DROP that policy and re-CREATE it league-scoped.
--   * status <> 'pending' keeps it limited to SETTLED bids (won / lost / voided_refunded — the public
--     FAAB outcomes). Own PENDING bids stay owner-only under the UNCHANGED `faab_bid_select_own_pending`.
--   * TO authenticated is the BELT — the anon role is excluded at the role level.
--   * the league-member EXISTS is the SUSPENDERS — even an authenticated caller only sees a settled bid
--     when they are a manager in the SAME league as that bid.
--
-- VISIBILITY MODEL (the crux):
--   * Settled bids are LEAGUE-WIDE: any authenticated member of the bid's league may read them
--     (FAAB results are public WITHIN a league) — BROADER than the owner-only siblings.
--   * A signed-in member of a DIFFERENT league must NOT read them — NARROWER than "any authenticated".
--   * Anon reads ZERO.
--
-- LINKAGE — why the denormalized `faab_bid.league_id`, NOT a join through the bid owner:
--   `faab_bid` carries its own NOT-NULL `league_id` (FK to league), exactly like `standing` / `draft` /
--   `pool_pick`. So this reuses the codebase's canonical league-membership idiom
--   (`draft_select_league_member`, `standing_select_league_member`, `pool_pick_select_league_member`):
--   reference ONLY the caller's OWN manager row (the one `manager_select_own` makes visible) and the
--   ROW's own `league_id`. This is RLS-safe inside the policy subquery.
--   We deliberately do NOT join `manager bid_owner ON bid_owner.id = faab_bid.manager_id` to discover the
--   league: under the real `authenticated` role, `manager_select_own` HIDES every manager row except the
--   caller's, so a bid-owner join returns nothing whenever the viewer ≠ the owner — collapsing
--   "league-wide" back to "owner-only" and silently re-hiding settled bids from league-mates. The
--   `score_manager_period` table needed a SECURITY DEFINER helper for exactly this reason; `faab_bid`
--   does NOT, because its league is on the row.
--
-- Untouched: `faab_bid_select_own_pending`, `faab_bid_insert_own`, `faab_bid_update_own_pending`,
-- `faab_bid_delete_own_pending`. RLS is already ENABLED on `faab_bid` (20260603223500); we only swap one
-- SELECT policy. Composed SELECT visibility after this migration:
--   own pending           → owner-only      (faab_bid_select_own_pending, unchanged)
--   settled, my league    → any league member (faab_bid_select_settled, this migration)
--   others' pending       → hidden          (anti-copying preserved — neither policy matches)
--   settled, other league → hidden          (cross-league isolation)
--   anon                  → nothing
--
-- DDL-ONLY: this migration is a pure policy swap (DROP POLICY + CREATE POLICY). It performs NO data
-- writes, so `prisma migrate deploy` — which Render runs as a preDeployCommand against the LIVE DB during
-- each release — touches no application rows and runs no seed/assert/rollback. The role-switched RLS
-- regression coverage lives in a DB-gated integration suite, NOT in this migration:
-- packages/faab/src/faabSettledRls.integration.test.ts (gated on FAAB_RLS_PG_TEST_URL).
--
-- No portability shims are needed: `migrate deploy` always applies the full chain in order, and the
-- `authenticated` role (20260605170000) and `auth.uid()` (20260603223500) already exist before this
-- migration runs — verified by applying the whole chain on a bare Postgres with NO pre-seed. ENABLE (not
-- FORCE) RLS, so the table-owning `postgres` role (Prisma, the FAAB batch worker, provisioning, migrate
-- deploy) is UNAFFECTED; RLS bites only the JWT-scoped anon/authenticated roles reachable via the Data
-- API. faab_bid is NOT in the `supabase_realtime` publication, so the Data API SELECT is the entire anon
-- surface, and this policy closes it.

DROP POLICY "faab_bid_select_settled" ON "faab_bid";

-- A settled (non-pending) bid is readable by any authenticated MEMBER of the bid's league. Same idiom as
-- draft_select_league_member: the subquery touches only the caller's own manager row + the row's own
-- league_id, so it is RLS-safe and resolves correctly even with `manager_select_own` on `manager`.
CREATE POLICY "faab_bid_select_settled" ON "faab_bid"
  FOR SELECT TO authenticated
  USING (
    "status" <> 'pending'
    AND EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."league_id" = "faab_bid"."league_id"
        AND m."user_id" = (auth.uid())::text
    )
  );
