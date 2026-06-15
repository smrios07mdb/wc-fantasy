-- Playoff transition — Theme C group→playoff SURVIVAL STATE. The `playoff_entry` table holds each
-- top-N field manager's guillotine state: their carried-verbatim group seed + a survival `status`
-- (alive → eliminated → champion) with the round + timestamp of their cut. The transition job writes the
-- `alive` rows at the transition; the later per-round prompt (Phase 2) flips them to `eliminated` /
-- `champion`; the theater screen (Phase 4) reads them. (The knockout `period.kind` value `knockout_round`
-- and `period.cut_count` column already exist from earlier migrations — this migration adds NO period
-- changes; the transition job writes the derived cut_counts onto the 5 knockout period rows it creates.)
--
-- RLS mirrors `standing` / `pool_pick`: LEAGUE-SCOPED SELECT (a member reads the whole field's survival
-- state — the theater screen shows everyone), and NO write policies — every write is server-side as the
-- table-owning `postgres` role (the transition / per-round jobs), which RLS does not bite. Default-deny
-- therefore blocks every browser write. Like the earlier RLS migrations this uses ENABLE (not FORCE) RLS,
-- so the owner role is UNAFFECTED; RLS bites only the JWT-scoped anon/authenticated roles.
--
-- Portable: runs on a plain Postgres (the DoD fresh-Postgres) AND on Supabase. No Realtime publication
-- entry — the screen polls / refreshes; there is no postgres_changes subscription on this table.

-- ── (1) DDL ───────────────────────────────────────────────────────────────────────────────────────
-- CreateEnum
CREATE TYPE "PlayoffEntryStatus" AS ENUM ('alive', 'eliminated', 'champion');

-- CreateTable
CREATE TABLE "playoff_entry" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "status" "PlayoffEntryStatus" NOT NULL DEFAULT 'alive',
    "eliminated_round" TEXT,
    "eliminated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "playoff_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "playoff_entry_league_id_manager_id_key" ON "playoff_entry"("league_id", "manager_id");

-- CreateIndex
CREATE INDEX "playoff_entry_league_id_status_idx" ON "playoff_entry"("league_id", "status");

-- AddForeignKey
ALTER TABLE "playoff_entry" ADD CONSTRAINT "playoff_entry_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playoff_entry" ADD CONSTRAINT "playoff_entry_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Portability shims (idempotent; no-ops on Supabase) ────────────────────────────────────────────
-- The `authenticated` role (the SELECT policy targets it) and `auth.uid()` (reads the JWT `sub` claim)
-- exist on Supabase but not on a bare Postgres. Mirror the earlier RLS migrations so `migrate deploy`
-- succeeds on the fresh-Postgres DoD. NB: the bare-Postgres shim returns TEXT, MASKING the `sub::uuid`
-- cast the real Supabase `auth.uid()` performs — so the FAITHFUL self-test below is run during
-- verification against a UUID-returning `auth.uid()` (pre-seeded so the `IF NOT EXISTS` guard skips this
-- stub). The valid-uuid literals make the self-test pass under BOTH shims.
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

-- ── (2) Enable RLS + the single SELECT policy ─────────────────────────────────────────────────────
ALTER TABLE "playoff_entry" ENABLE ROW LEVEL SECURITY;

-- SELECT — LEAGUE-SCOPED: any member of the row's league may read it (the whole field's survival state).
-- `playoff_entry` carries `league_id`, so the check references ONLY the caller's OWN manager row and the
-- row's own `league_id` (the standing/pool_pick idiom, RLS-safe on the subquery). No INSERT/UPDATE/DELETE
-- policy: writes are server-side as the table owner (default-deny blocks every JWT-scoped write).
CREATE POLICY "playoff_entry_select_league_member" ON "playoff_entry"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."league_id" = "playoff_entry"."league_id"
        AND m."user_id" = (auth.uid())::text
    )
  );

-- ── (3) Self-test (Theme F): cross-league SELECT isolation + default-deny writes ──────────────────
-- Runs during `prisma migrate deploy` (vitest never executes SQL). Asserts the EFFECTIVE policy logic by
-- evaluating the SELECT predicate as the migration owner — faithful because the predicate filters
-- `manager.user_id = auth.uid()`, restricting to the caller's OWN manager row, so the owner-run result
-- (RLS bypassed) equals the role-run result (RLS active). It proves: (a) a member reads their league's
-- rows; (b) a member CANNOT read another league's rows, and a non-member CANNOT read the league's rows
-- (cross-league isolation); (c) NO write policy exists for `authenticated` (default-deny on writes). The
-- seed is ALWAYS unwound via a sentinel raise; NOTHING persists even on production; a real mismatch is
-- re-raised AFTER cleanup, failing the deploy loudly.
--
-- The two `sub` ids are driven into `request.jwt.claim.sub` and read back via `auth.uid()`. On Supabase
-- (and the UUID-returning verification shim) the real `auth.uid()` casts that claim to `uuid`, so they
-- MUST be valid uuids or `(auth.uid())::text` 22P02s on deploy. Canonical lowercase so `manager.user_id`
-- (text) = auth.uid()::text round-trips exactly.
DO $$
DECLARE
  v_lg        text := 'pe_selftest_lg_in';
  v_lg2       text := 'pe_selftest_lg_out';
  v_mgr_in    text := 'pe_selftest_mgr_in';     -- the caller's own manager (league lg_in)
  v_mgr_other text := 'pe_selftest_mgr_other';  -- ANOTHER manager in the SAME league (lg_in)
  v_mgr_out   text := 'pe_selftest_mgr_out';    -- a manager in a DIFFERENT league (lg_out)
  v_user_in   text := '00000000-0000-0000-0000-0000000000a1';  -- in-league caller's auth uid
  v_user_out  text := '00000000-0000-0000-0000-0000000000a2';  -- different-league caller's auth uid
  v_member_reads_in    boolean := false;  -- member reads their league's rows (own + others')
  v_member_reads_out   boolean := true;   -- member reads ANOTHER league's rows (must be FALSE)
  v_nonmember_reads_in boolean := true;   -- non-member reads the league's rows (must be FALSE)
  v_write_policy_count integer := -1;     -- # of write policies for `authenticated` (must be 0)
  v_fail text := NULL;
BEGIN
  BEGIN
    INSERT INTO "app_user" ("id", "email", "updated_at")
      VALUES (v_user_in, 'pe-selftest-in@example.com', CURRENT_TIMESTAMP),
             (v_user_out, 'pe-selftest-out@example.com', CURRENT_TIMESTAMP);
    INSERT INTO "league" ("id", "name", "updated_at")
      VALUES (v_lg, 'pe-selftest-in', CURRENT_TIMESTAMP),
             (v_lg2, 'pe-selftest-out', CURRENT_TIMESTAMP);
    INSERT INTO "manager" ("id", "league_id", "user_id", "display_name", "updated_at")
      VALUES (v_mgr_in, v_lg, v_user_in, 'in', CURRENT_TIMESTAMP),
             (v_mgr_other, v_lg, NULL, 'other', CURRENT_TIMESTAMP),
             (v_mgr_out, v_lg2, v_user_out, 'out', CURRENT_TIMESTAMP);
    -- Real playoff_entry rows so the seed exercises the DDL + FK + enum chain.
    INSERT INTO "playoff_entry" ("id", "league_id", "manager_id", "seed", "status", "updated_at")
      VALUES ('pe_selftest_in', v_lg, v_mgr_in, 1, 'alive', CURRENT_TIMESTAMP),
             ('pe_selftest_other', v_lg, v_mgr_other, 2, 'eliminated', CURRENT_TIMESTAMP),
             ('pe_selftest_out', v_lg2, v_mgr_out, 1, 'champion', CURRENT_TIMESTAMP);

    -- member (in-league user): the SELECT predicate is per-row-league → TRUE for lg_in (covers own +
    -- mgr_other's row), FALSE for lg_out.
    PERFORM set_config('request.jwt.claim.sub', v_user_in, true);
    v_member_reads_in := EXISTS (
      SELECT 1 FROM "manager" m WHERE m."league_id" = v_lg AND m."user_id" = (auth.uid())::text);
    v_member_reads_out := EXISTS (
      SELECT 1 FROM "manager" m WHERE m."league_id" = v_lg2 AND m."user_id" = (auth.uid())::text);

    -- non-member (user of a DIFFERENT league) must NOT read lg_in's rows.
    PERFORM set_config('request.jwt.claim.sub', v_user_out, true);
    v_nonmember_reads_in := EXISTS (
      SELECT 1 FROM "manager" m WHERE m."league_id" = v_lg AND m."user_id" = (auth.uid())::text);

    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- default-deny on writes: there must be NO INSERT/UPDATE/DELETE policy granting `authenticated`.
    SELECT count(*) INTO v_write_policy_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'playoff_entry'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
      AND 'authenticated' = ANY(roles);

    IF NOT v_member_reads_in THEN
      v_fail := 'league member cannot SELECT their league''s playoff_entry rows';
    ELSIF v_member_reads_out THEN
      v_fail := 'league member CAN SELECT another league''s playoff_entry rows (cross-league isolation broken)';
    ELSIF v_nonmember_reads_in THEN
      v_fail := 'non-member CAN SELECT the league''s playoff_entry rows';
    ELSIF v_write_policy_count <> 0 THEN
      v_fail := 'playoff_entry has a write policy for authenticated (writes must be default-deny / server-only)';
    END IF;

    RAISE EXCEPTION 'pe_selftest_rollback';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'pe_selftest_rollback' THEN
        PERFORM set_config('request.jwt.claim.sub', '', true);
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF v_fail IS NOT NULL THEN
    RAISE EXCEPTION 'playoff_entry RLS self-test FAILED: %', v_fail;
  END IF;
END $$;
