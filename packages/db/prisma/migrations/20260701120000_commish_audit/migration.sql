-- Commissioner console Thread 1 — `commish_audit`: the append-only governance ledger + its RLS. Every
-- later commissioner WRITE slice (penalty entry, stat correction, rating override, roster/lineup repair,
-- period freeze, field lock, ops config) records ONE row here through the server-side `recordCommishAudit`
-- helper. This is the cross-cutting dependency every write slice writes into; THIS migration ships the
-- table EMPTY (no backfill, no caller wired) and touches NO existing table. Purely ADDITIVE.
--
-- `action_type` is a free TEXT column DELIBERATELY (not a pg enum): the closed set lives as the app-level
-- `CommishActionType` union in @app/shared, so a new slice's action string needs NO migration. `target_ref`
-- is JSONB (a structured pointer: {matchId,playerId} | {managerId} | {periodId}); `delta` is a display
-- string; a reversible row can later be undone (stamps reversed_at / reversed_by_user_id).
--
-- RLS POSTURE — commissioner-only SELECT, server-only writes (mirrors the notification_sent server-write
-- ledger for the write side, and standing_select_league_member for the read side, plus an is_commissioner
-- clause):
--   • ENABLE (not FORCE) RLS, so the table-owning `postgres` role (Prisma server reads/writes, the worker,
--     `prisma migrate deploy`) is UNAFFECTED; RLS bites only the JWT-scoped anon/authenticated roles
--     reachable via the Supabase Data API.
--   • Exactly ONE SELECT policy, commissioner-only: the caller's OWN manager row (visible via
--     `manager_select_own`, 20260605170000) must share the audit row's league AND carry is_commissioner.
--     No SECURITY DEFINER helper is needed — the predicate reads only `manager`, which the caller's own row
--     already resolves; a helper is only required when a policy must read an RLS-default-deny table (e.g.
--     pool_pick's kickoff helper reads fifa_match) or a foreign manager's row. commish_audit carries its
--     OWN league_id, so the inline predicate suffices (same reasoning as watchlist / standing).
--   • NO INSERT/UPDATE/DELETE policies. Per the 20260605170000 lockdown rationale, RLS then default-denies
--     every client write: all inserts go through the server owner client (`recordCommishAudit`), which
--     bypasses RLS as the table owner. This is defense-in-depth — the app never reads this table over the
--     Data API (the console read path is the owner-bypass loader), so the SELECT policy is a belt-and-braces
--     guard on the Data API surface, not the app's read path.
--   • NOT published to Realtime: this migration emits NO `ALTER PUBLICATION supabase_realtime ADD TABLE`
--     block, so commissioner-only rows are never exposed on the Realtime / postgres_changes surface.
--
-- Note the app-layer vs RLS-layer asymmetry (documented in DECISIONS.md): the /commish app gate honors
-- is_commissioner OR the smrios07@gmail.com email fallback (parity with the worker CLI); this RLS policy is
-- is_commissioner-flag ONLY (RLS cannot cheaply express the email fallback, and it never gates the app's
-- real owner-bypass read — it only hardens the Data API). Strictly safe: flag-only RLS is the tighter set.
--
-- DDL-ONLY posture (mirrors watchlist 20260630120000 / group_standing 20260626120000): NO data writes, NO
-- embedded DO-block self-test. The role-switched RLS regression proof lives in the DB-gated integration
-- suite apps/web/src/commish/commishAuditRls.integration.test.ts (gated on COMMISH_AUDIT_PG_TEST_URL).
--
-- Filename `20260701120000_commish_audit` follows `YYYYMMDD120000_<name>` (today = 2026-07-01; the 120000
-- slot is free) and sorts strictly after the chain tail (20260630120000_watchlist), so lexical = apply order.

-- ── (1) DDL (exact `prisma migrate diff` output) ──────────────────────────────────────────────────
-- CreateTable
CREATE TABLE "commish_audit" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action_type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "reason" TEXT,
    "target_ref" JSONB,
    "delta" TEXT,
    "reversible" BOOLEAN NOT NULL DEFAULT false,
    "reversed_at" TIMESTAMPTZ(6),
    "reversed_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commish_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — (league_id, created_at) supports the console log read (ORDER BY created_at DESC via a
-- backward btree scan; the repo uses no DESC index keys, so a plain composite index stays consistent).
CREATE INDEX "commish_audit_league_id_created_at_idx" ON "commish_audit"("league_id", "created_at");

-- AddForeignKey
ALTER TABLE "commish_audit" ADD CONSTRAINT "commish_audit_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey — actor is NULLABLE (SetNull) so a future 'system'/automated row can carry a null actor.
ALTER TABLE "commish_audit" ADD CONSTRAINT "commish_audit_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commish_audit" ADD CONSTRAINT "commish_audit_reversed_by_user_id_fkey" FOREIGN KEY ("reversed_by_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Portability shims (idempotent; no-ops on Supabase and in-chain) ────────────────────────────────
-- The `authenticated` role (the SELECT policy targets it) and `auth.uid()` (the predicate reads the JWT
-- `sub` claim) exist on Supabase but not on a bare Postgres. Copy the watchlist/pool_pick shims verbatim so
-- `migrate deploy` succeeds on the fresh-Postgres DoD AND so this migration applies in ISOLATION. NB: the
-- bare-Postgres shim returns TEXT, which MASKS the `sub::uuid` cast the real Supabase `auth.uid()` performs
-- — so the gated RLS integration suite is verified against a UUID-returning `auth.uid()` with valid-uuid
-- `sub` literals (the SEC-P1 / 22P02 trap; DECISIONS.md → RLS verification).
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

-- ── (2) Enable RLS + the single commissioner-only SELECT policy ────────────────────────────────────
ALTER TABLE "commish_audit" ENABLE ROW LEVEL SECURITY;

-- SELECT — COMMISSIONER-ONLY: a caller may read an audit row ONLY if their own manager row (resolved via
-- manager_select_own) is in the row's league AND is_commissioner. A non-commissioner league-mate sees none;
-- an out-of-league user sees none; anon sees none. No SELECT reveal to ordinary members (widening the read
-- to all league members later = change this one predicate; see DECISIONS.md).
CREATE POLICY "commish_audit_select_commish" ON "commish_audit"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."league_id" = "commish_audit"."league_id"
        AND m."user_id" = (auth.uid())::text
        AND m."is_commissioner"
    )
  );

-- (intentionally NO INSERT / UPDATE / DELETE policy → RLS default-denies every client write; all inserts go
--  through the server owner client via recordCommishAudit, which bypasses RLS as the table owner.)
