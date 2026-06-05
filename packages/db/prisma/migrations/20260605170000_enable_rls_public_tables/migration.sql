-- Lock down the Data API: enable Row-Level Security on EVERY public table so the anon / authenticated
-- keys can no longer read or write tables directly (Supabase Security Advisor: "rls_disabled_in_public").
-- Writes stay SERVER-ONLY; the browser keeps exactly the reads the draft room's Realtime needs, scoped
-- to league membership.
--
-- Portable: runs on a plain Postgres (the DoD's fresh-Postgres) AND on Supabase. It does NOT touch the
-- Supabase-only `supabase_realtime` publication (a dashboard/operator concern) and never uses FORCE.
--
-- WHY NOT FORCE RLS: with ENABLE (not FORCE) the table OWNER bypasses RLS. Prisma — the app's reads/
-- writes, the worker, provisioning, and `prisma migrate deploy` — all connect as the table-owning
-- `postgres` role, so every server-side path is UNAFFECTED (same rationale as faab_bid in
-- 20260603223500_invariants). Supabase's service_role also bypasses. RLS therefore bites only the
-- JWT-scoped anon/authenticated roles reachable via the Data API and Realtime.

-- ── Portability shim ─────────────────────────────────────────────────────────────────────────────
-- The policies below target the `authenticated` role, which exists on Supabase but not on a bare
-- Postgres. Create a stub when absent so `TO authenticated` is portable (a no-op on Supabase, where the
-- role already exists — mirrors the auth.uid() shim in 20260603223500_invariants).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE "authenticated";
  END IF;
END $$;

-- ── (1) Enable RLS on every public base table that doesn't already have it ────────────────────────
-- faab_bid was enabled in 20260603223500_invariants; this covers the remaining app tables plus
-- Prisma's _prisma_migrations bookkeeping table, clearing every "rls_disabled_in_public" advisor error.
-- A table with RLS enabled and NO policy denies anon/authenticated entirely (default-deny) — exactly
-- what we want for all tables except the three the browser legitimately reads (policies in step 2).
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- ── (2) Browser READ policies (anon-key client + the signed-in user's JWT → `authenticated`) ──────
-- Identity is auth.uid() = manager.user_id — the same idiom as the faab_bid policies. We add NO
-- INSERT/UPDATE/DELETE policies, so RLS default-denies every client write: all mutations go through the
-- server (the gated /api/draft/pick, the worker, provisioning), which bypasses RLS as the table owner.

-- manager: a signed-in user may read ONLY their OWN manager row. This is the minimum that lets the RLS
-- subqueries below — AND the existing faab_bid policies, which also `EXISTS (SELECT 1 FROM manager ...)`
-- — resolve the caller's identity now that `manager` itself has RLS. Other managers' rows reach the
-- draft room only via the server-rendered snapshot (Prisma, RLS-bypassing), never the anon key.
CREATE POLICY "manager_select_own" ON "manager"
  FOR SELECT TO authenticated
  USING ("user_id" = (auth.uid())::text);

-- draft: a league member may read their league's draft row (the pointer + pick_deadline the room
-- subscribes to via Realtime). Scoped by league membership — authorization, not just authentication.
CREATE POLICY "draft_select_league_member" ON "draft"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."league_id" = "draft"."league_id"
        AND m."user_id" = (auth.uid())::text
    )
  );

-- draft_pick: a league member may read the picks of their league's draft (the per-pick Realtime feed).
CREATE POLICY "draft_pick_select_league_member" ON "draft_pick"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "manager" m
      JOIN "draft" d ON d."id" = "draft_pick"."draft_id"
      WHERE m."league_id" = d."league_id"
        AND m."user_id" = (auth.uid())::text
    )
  );
