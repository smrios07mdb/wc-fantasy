-- Prompt 40 — Pick'em pool data layer: the `pool_pick` table + its Row-Level Security + Realtime
-- publication entry. Managers predict each fixture's result (+1 per correct pick — a SEPARATE scoring
-- system from the §1–§8 player engine; see SCORING.md). The group-vs-knockout phase + result are
-- derived in app code from the linked `period.kind`, NEVER from `fifa_match.round` (raw feed text;
-- DECISIONS.md → Pool). This migration adds NO feed/ingest changes — it reads results that already land
-- in `fifa_match`.
--
-- RLS mirrors `faab_bid` (auth.uid() → manager → league), with two differences that the prompt pins:
--   * SELECT is LEAGUE-SCOPED, not own-only — a member may read the whole field's picks (the leaderboard
--     + the post-kickoff reveal). The blind-bid secrecy faab_bid uses is NOT wanted here.
--   * Anti-copying — hiding OTHER managers' picks before kickoff — is NOT an RLS predicate (there is no
--     clock in RLS). RLS only league-scopes reads; the time gate lives in the read QUERY (apps/web §3).
--   * INSERT/UPDATE are restricted to the caller's OWN manager_id (defence-in-depth; every write also
--     goes through the server, which bypasses RLS as the table owner). No DELETE policy (default-deny —
--     the write path is submit/upsert only).
--
-- Portable: runs on a plain Postgres (the DoD fresh-Postgres) AND on Supabase. Like the earlier RLS
-- migrations it uses ENABLE (not FORCE) RLS, so the table-owning `postgres` role (Prisma, the worker,
-- provisioning, `prisma migrate deploy`) is UNAFFECTED; RLS bites only the JWT-scoped anon/authenticated
-- roles reachable via the Data API + Realtime.

-- ── (1) DDL (exact `prisma migrate diff` output) ──────────────────────────────────────────────────
-- CreateEnum
CREATE TYPE "PoolPrediction" AS ENUM ('HOME', 'DRAW', 'AWAY');

-- CreateTable
CREATE TABLE "pool_pick" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "prediction" "PoolPrediction" NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pool_pick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pool_pick_league_id_match_id_idx" ON "pool_pick"("league_id", "match_id");

-- CreateIndex
CREATE INDEX "pool_pick_match_id_idx" ON "pool_pick"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "pool_pick_manager_match_uq" ON "pool_pick"("manager_id", "match_id");

-- AddForeignKey
ALTER TABLE "pool_pick" ADD CONSTRAINT "pool_pick_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_pick" ADD CONSTRAINT "pool_pick_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_pick" ADD CONSTRAINT "pool_pick_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "fifa_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Portability shims (idempotent; no-ops on Supabase) ────────────────────────────────────────────
-- The `authenticated` role (policies target it) and `auth.uid()` (reads the JWT `sub` claim) exist on
-- Supabase but not on a bare Postgres. Mirror the earlier RLS migrations so `migrate deploy` succeeds on
-- the fresh-Postgres DoD. NB: the bare-Postgres shim returns TEXT, which MASKS the `sub::uuid` cast the
-- real Supabase `auth.uid()` performs — so the FAITHFUL self-test below is run during verification
-- against a UUID-returning `auth.uid()` (pre-seeded so the `IF NOT EXISTS` guard skips this stub). The
-- valid-uuid literals make the self-test pass under BOTH shims (DECISIONS.md → Pool / RLS verification).
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

-- ── (2) Enable RLS + policies ─────────────────────────────────────────────────────────────────────
ALTER TABLE "pool_pick" ENABLE ROW LEVEL SECURITY;

-- SELECT — LEAGUE-SCOPED: any member of the row's league may read it (own + every other manager's pick).
-- `pool_pick` carries `league_id`, so the check references ONLY the caller's OWN manager row (visible via
-- `manager_select_own`) and the row's own `league_id` — the standing/draft idiom, RLS-safe on the
-- subquery (no other manager row is read). The pre-kickoff anti-copying gate is applied in the read
-- query, NOT here.
CREATE POLICY "pool_pick_select_league_member" ON "pool_pick"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."league_id" = "pool_pick"."league_id"
        AND m."user_id" = (auth.uid())::text
    )
  );

-- INSERT — a manager may create only their OWN pick (mirrors faab_bid_insert_own).
CREATE POLICY "pool_pick_insert_own" ON "pool_pick"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "pool_pick"."manager_id"
        AND m."user_id" = (auth.uid())::text
    )
  );

-- UPDATE — a manager may amend only their OWN pick (the upsert path); both the existing row (USING) and
-- the new row (WITH CHECK) must belong to the caller (mirrors faab_bid_update_own_pending, minus the
-- status gate — a pick has no status; lock is time-based and enforced server-side).
CREATE POLICY "pool_pick_update_own" ON "pool_pick"
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "pool_pick"."manager_id"
        AND m."user_id" = (auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "pool_pick"."manager_id"
        AND m."user_id" = (auth.uid())::text
    )
  );

-- ── (3) Realtime publication ──────────────────────────────────────────────────────────────────────
-- postgres_changes only broadcast for tables in the `supabase_realtime` publication. Add `pool_pick`
-- NOW so Prompt 41's subscription doesn't silently deliver zero events (the Theme-F trap). Guarded: the
-- publication does not exist on plain-Postgres (skip), and a table already in it is skipped (idempotent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
        AND tablename = 'pool_pick'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.pool_pick;
    END IF;
  END IF;
END $$;

-- ── (4) Self-test (Theme F): cross-league isolation + own-row write enforcement ───────────────────
-- Runs during `prisma migrate deploy` (vitest never executes SQL). Asserts the EFFECTIVE policy logic by
-- evaluating each policy's exact predicate as the migration owner — faithful because every predicate
-- filters `manager.user_id = auth.uid()`, which restricts to the caller's OWN manager row, so the
-- owner-run result (RLS bypassed, sees all) equals the role-run result (RLS active, sees only own). It
-- proves: (a) a member reads their league's rows (own + others'); (b) a member CANNOT read another
-- league's rows, and a non-member CANNOT read the league's rows (cross-league isolation); (c) a manager
-- can write their OWN pick but NOT another manager's or another league's (own-row write enforcement).
-- The seed is ALWAYS unwound via a sentinel raise (the inner sub-block rolls its DB changes back), so
-- NOTHING persists even on production; a real mismatch is recorded and re-raised AFTER cleanup, failing
-- the deploy loudly. The live JWT-authed `postgres_changes` delivery on real Supabase is a separate
-- provision-time gate.
--
-- The two `sub` ids below are driven into `request.jwt.claim.sub` and read back via `auth.uid()`. On
-- Supabase (and the UUID-returning verification shim) the real `auth.uid()` casts that claim to `uuid`,
-- so they MUST be valid uuids or `(auth.uid())::text` 22P02s on `prisma migrate deploy`. Canonical
-- lowercase so `manager.user_id` (text) = auth.uid()::text round-trips exactly.
DO $$
DECLARE
  v_lg        text := 'pool_selftest_lg_in';
  v_lg2       text := 'pool_selftest_lg_out';
  v_mgr_in    text := 'pool_selftest_mgr_in';     -- the caller's own manager (league lg_in)
  v_mgr_other text := 'pool_selftest_mgr_other';  -- ANOTHER manager in the SAME league (lg_in)
  v_mgr_out   text := 'pool_selftest_mgr_out';    -- a manager in a DIFFERENT league (lg_out)
  v_match     text := 'pool_selftest_match';
  v_user_in   text := '00000000-0000-0000-0000-000000000001';  -- in-league caller's auth uid
  v_user_out  text := '00000000-0000-0000-0000-000000000002';  -- different-league caller's auth uid
  v_member_reads_in        boolean := false;  -- member reads their league's rows (own + others')
  v_member_reads_out       boolean := true;   -- member reads ANOTHER league's rows (must be FALSE)
  v_nonmember_reads_in     boolean := true;   -- non-member reads the league's rows (must be FALSE)
  v_member_writes_own      boolean := false;  -- member writes their OWN pick (must be TRUE)
  v_member_writes_other    boolean := true;   -- member writes ANOTHER manager's pick (must be FALSE)
  v_member_writes_cross_lg boolean := true;   -- member writes ANOTHER league's pick (must be FALSE)
  v_fail text := NULL;
BEGIN
  BEGIN
    -- `manager.user_id` FKs to `app_user.id`; in the real app both equal the Supabase auth uid, so seed
    -- app_user rows whose ids match the JWT `sub` we drive auth.uid() with.
    INSERT INTO "app_user" ("id", "email", "updated_at")
      VALUES (v_user_in, 'pool-selftest-in@example.com', CURRENT_TIMESTAMP),
             (v_user_out, 'pool-selftest-out@example.com', CURRENT_TIMESTAMP);
    INSERT INTO "league" ("id", "name", "updated_at")
      VALUES (v_lg, 'pool-selftest-in', CURRENT_TIMESTAMP),
             (v_lg2, 'pool-selftest-out', CURRENT_TIMESTAMP);
    INSERT INTO "manager" ("id", "league_id", "user_id", "display_name", "updated_at")
      VALUES (v_mgr_in, v_lg, v_user_in, 'in', CURRENT_TIMESTAMP),
             (v_mgr_other, v_lg, NULL, 'other', CURRENT_TIMESTAMP),
             (v_mgr_out, v_lg2, v_user_out, 'out', CURRENT_TIMESTAMP);
    -- A real fixture + pool_pick rows so the seed exercises the DDL + FK chain (the predicates below read
    -- only `manager`, but inserting picks proves the table is writable and the enum/FKs resolve).
    INSERT INTO "fifa_match" ("id", "balldontlie_match_id", "kickoff_at", "updated_at")
      VALUES (v_match, 999999999, TIMESTAMPTZ '2026-06-12 16:00:00+00', CURRENT_TIMESTAMP);
    INSERT INTO "pool_pick" ("id", "league_id", "manager_id", "match_id", "prediction", "updated_at")
      VALUES ('pool_selftest_pick_in', v_lg, v_mgr_in, v_match, 'HOME', CURRENT_TIMESTAMP),
             ('pool_selftest_pick_other', v_lg, v_mgr_other, v_match, 'AWAY', CURRENT_TIMESTAMP),
             ('pool_selftest_pick_out', v_lg2, v_mgr_out, v_match, 'DRAW', CURRENT_TIMESTAMP);

    -- member (in-league user): the SELECT predicate is per-row-league, so a TRUE for lg_in covers BOTH
    -- the member's own pick and mgr_other's pick (league-wide read); a row in lg_out must be FALSE.
    PERFORM set_config('request.jwt.claim.sub', v_user_in, true);
    v_member_reads_in := EXISTS (
      SELECT 1 FROM "manager" m WHERE m."league_id" = v_lg AND m."user_id" = (auth.uid())::text);
    v_member_reads_out := EXISTS (
      SELECT 1 FROM "manager" m WHERE m."league_id" = v_lg2 AND m."user_id" = (auth.uid())::text);
    v_member_writes_own := EXISTS (
      SELECT 1 FROM "manager" m WHERE m."id" = v_mgr_in AND m."user_id" = (auth.uid())::text);
    v_member_writes_other := EXISTS (
      SELECT 1 FROM "manager" m WHERE m."id" = v_mgr_other AND m."user_id" = (auth.uid())::text);
    v_member_writes_cross_lg := EXISTS (
      SELECT 1 FROM "manager" m WHERE m."id" = v_mgr_out AND m."user_id" = (auth.uid())::text);

    -- non-member (user of a DIFFERENT league) must NOT read lg_in's rows.
    PERFORM set_config('request.jwt.claim.sub', v_user_out, true);
    v_nonmember_reads_in := EXISTS (
      SELECT 1 FROM "manager" m WHERE m."league_id" = v_lg AND m."user_id" = (auth.uid())::text);

    PERFORM set_config('request.jwt.claim.sub', '', true);

    IF NOT v_member_reads_in THEN
      v_fail := 'league member cannot SELECT their league''s pool_pick rows';
    ELSIF v_member_reads_out THEN
      v_fail := 'league member CAN SELECT another league''s pool_pick rows (cross-league isolation broken)';
    ELSIF v_nonmember_reads_in THEN
      v_fail := 'non-member CAN SELECT the league''s pool_pick rows';
    ELSIF NOT v_member_writes_own THEN
      v_fail := 'manager cannot write their OWN pool_pick';
    ELSIF v_member_writes_other THEN
      v_fail := 'manager CAN write ANOTHER manager''s pool_pick (own-row write enforcement broken)';
    ELSIF v_member_writes_cross_lg THEN
      v_fail := 'manager CAN write a pool_pick in ANOTHER league';
    END IF;

    RAISE EXCEPTION 'pool_selftest_rollback';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'pool_selftest_rollback' THEN
        PERFORM set_config('request.jwt.claim.sub', '', true);
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF v_fail IS NOT NULL THEN
    RAISE EXCEPTION 'pool_pick RLS self-test FAILED: %', v_fail;
  END IF;
END $$;
