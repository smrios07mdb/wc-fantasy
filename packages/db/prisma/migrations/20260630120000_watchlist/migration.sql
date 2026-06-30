-- T2 — Waiver Watchlist: the `watchlist` table + its owner-only Row-Level Security. A manager may "star"
-- any player as a private personal bookmark on /waivers. The starred set is theirs ALONE — never visible
-- to a rival, never a league-wide reveal. This is a PURE bookmark: it is fully DECOUPLED from the FAAB
-- engine — it touches NO budget, roster, bid, claim, or scoring row, marks NOTHING dirty, triggers NO
-- recompute, and has NO Realtime publication entry. Purely ADDITIVE: starts empty, no backfill, no
-- existing table touched.
--
-- RLS mirrors `faab_bid`'s STRICTLY-OWNER-ONLY policy family (auth.uid() → manager → the row's own
-- manager_id), NOT pool_pick's league-scoped reveal: a star is strategic information and revealing it
-- would leak intent to rivals. Four owner-only policies (one per CRUD verb), each `TO authenticated`, each
-- gating on the SAME ownership predicate (the SEC-P0 lesson: every policy carries BOTH a role clause AND
-- an identity predicate, so a permissive OR can never widen visibility). There is exactly ONE SELECT
-- policy and it is owner-only. No SECURITY DEFINER helper is needed — the predicate reads only `manager`,
-- which the caller's own row already resolves via `manager_select_own` (20260605170000); a helper is only
-- needed when a policy must read an RLS-default-deny table (e.g. pool_pick's kickoff helper reads
-- fifa_match), and watchlist reads none — exactly why faab_bid's owner-only policies need none either.
--
-- DDL-ONLY posture (mirrors group_standing 20260626120000 and fix_faab_settled_rls 20260620120000): this
-- migration performs NO data writes and carries NO embedded DO-block self-test. `prisma migrate deploy` —
-- which Render runs against the LIVE DB on every release — applies pure DDL + policy here and touches no
-- application rows. The role-switched RLS regression proof lives in a DB-gated integration suite, NOT in
-- this migration: apps/web/src/watchlist/watchlistRls.integration.test.ts (gated on WATCHLIST_RLS_PG_TEST_URL).
--
-- TODO(confirm) shim posture: this migration includes BOTH portability shims (the `authenticated` role
-- AND the `auth.uid()` function), copied verbatim from pool_pick (20260610130000). group_standing — the
-- most recent new-table migration — includes ONLY the `authenticated` shim and explicitly OMITS the
-- `auth.uid()` shim "because the policy is global (USING (true)), so it never reads the JWT". The
-- watchlist policies DO read the JWT via `(auth.uid())::text`, so by group_standing's own stated principle
-- the `auth.uid()` shim is required for this migration to apply in ISOLATION on a bare Postgres (in the
-- full chain `auth.uid()` already exists from 20260603223500_invariants, so the IF-NOT-EXISTS guard makes
-- it a no-op either way). Both shims are idempotent no-ops on Supabase and in-chain — pure upside.
--
-- TODO(confirm) filename timestamp: `20260630120000_watchlist` follows the repo's `YYYYMMDD120000_<name>`
-- convention (today = 2026-06-30; the `120000` slot is free — no other migration is dated 2026-06-30). It
-- sorts strictly after the chain tail (20260628130000), so lexical order = apply order.
--
-- Portable: runs on a plain Postgres (the DoD fresh-Postgres) AND on Supabase, using ENABLE (not FORCE)
-- RLS so the table-owning `postgres` role (Prisma server writes, the worker, provisioning, `prisma migrate
-- deploy`) is UNAFFECTED; RLS bites only the JWT-scoped anon/authenticated roles reachable via the Data API.

-- ── (1) DDL (exact `prisma migrate diff` output) ──────────────────────────────────────────────────
-- CreateTable
CREATE TABLE "watchlist" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "watchlist_manager_id_idx" ON "watchlist"("manager_id");

-- CreateIndex
CREATE INDEX "watchlist_league_id_idx" ON "watchlist"("league_id");

-- CreateIndex
CREATE INDEX "watchlist_player_id_idx" ON "watchlist"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_manager_player_uq" ON "watchlist"("manager_id", "player_id");

-- AddForeignKey
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Portability shims (idempotent; no-ops on Supabase) ────────────────────────────────────────────
-- The `authenticated` role (the policies target it) and `auth.uid()` (the predicate reads the JWT `sub`
-- claim) exist on Supabase but not on a bare Postgres. Mirror the earlier RLS migrations so `migrate
-- deploy` succeeds on the fresh-Postgres DoD AND so this migration applies in isolation. NB: the
-- bare-Postgres shim returns TEXT, which MASKS the `sub::uuid` cast the real Supabase `auth.uid()`
-- performs — so the gated RLS integration suite is verified against a UUID-returning `auth.uid()` with
-- valid-uuid `sub` literals (the SEC-P1 / 22P02 trap; DECISIONS.md → RLS verification).
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

-- ── (2) Enable RLS + owner-only policies ──────────────────────────────────────────────────────────
ALTER TABLE "watchlist" ENABLE ROW LEVEL SECURITY;

-- SELECT — OWNER-ONLY: a manager may read ONLY their own stars (the privacy guarantee — a rival, even a
-- league-mate, sees none). Exactly ONE SELECT policy, no league-visible reveal (copying pool_pick's
-- league-scoped SELECT or faab_bid's settled SELECT would leak the bookmark to rivals).
CREATE POLICY "watchlist_select_own" ON "watchlist"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "watchlist"."manager_id"
        AND m."user_id" = (auth.uid())::text
    )
  );

-- INSERT — a manager may star a player only for their OWN manager_id (mirrors faab_bid_insert_own, minus
-- the status gate — a star has no status).
CREATE POLICY "watchlist_insert_own" ON "watchlist"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "watchlist"."manager_id"
        AND m."user_id" = (auth.uid())::text
    )
  );

-- UPDATE — both the existing row (USING) and the new row (WITH CHECK) must belong to the caller. A star is
-- insert/delete only in practice, but the verb is included for completeness so no future amend path is
-- silently RLS-blocked (mirrors pool_pick_update_own, minus the status gate).
CREATE POLICY "watchlist_update_own" ON "watchlist"
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "watchlist"."manager_id"
        AND m."user_id" = (auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "watchlist"."manager_id"
        AND m."user_id" = (auth.uid())::text
    )
  );

-- DELETE — a manager may unstar only their OWN star (unstar = delete row). faab_bid gates DELETE on the
-- status; a star has none, so the predicate is owner-only.
CREATE POLICY "watchlist_delete_own" ON "watchlist"
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "watchlist"."manager_id"
        AND m."user_id" = (auth.uid())::text
    )
  );
