-- Pre-prod security follow-ups from the Supabase Security Advisor (DECISIONS.md →
-- "Security follow-ups (non-blocking, pre-prod)"). Function privilege + search_path hardening ONLY —
-- NO function-logic / behaviour change, NO RLS / policy / publication change. Both function BODIES are
-- left byte-for-byte intact; this migration only adjusts GRANTs and the pinned `search_path` setting.
--
-- Inspect findings (current `main`, before this migration):
--   • `public.mirror_auth_user_to_app_user()` (20260606010000): SECURITY DEFINER trigger fn, search_path
--     ALREADY pinned to '' (line 17 there) AND EXECUTE ALREADY revoked from PUBLIC (line 34 there). It is
--     invoked ONLY by the `on_auth_user_created` trigger on `auth.users` — never by app code / RPC.
--   • `public.enforce_lineup_lock()` (20260603223500): SECURITY INVOKER trigger fn with a MUTABLE
--     search_path (no `SET search_path`) — the one genuinely-open item. Its body references ZERO schema
--     objects (only NEW/OLD/TG_OP, record fields, pg_catalog operators & RAISE), so pinning needs NO body
--     change and '' is the minimal safe value (pg_catalog stays implicitly first in the path).
--
-- So item 1 + the mirror search_path pin were already shipped by 20260606010000; this migration
-- re-asserts them idempotently (so the consolidated "security follow-ups" posture lives in one place and
-- the self-test below guards it against drift) and adds the genuinely-missing item-2 pin. Portable to the
-- DoD's plain Postgres: every statement is catalog-only or role-existence-guarded.

-- ── Item 1: mirror_auth_user_to_app_user — keep EXECUTE off PUBLIC / anon / authenticated ────────────
-- A SECURITY DEFINER function in `public` is EXECUTE-able by PUBLIC (and thus anon/authenticated, which
-- inherit it) by default. 20260606010000 already revoked PUBLIC; this REVOKE is therefore idempotent
-- (a no-op when already revoked). KEEP SECURITY DEFINER — the mirror must run as the owner to write the
-- RLS-protected public.app_user from the supabase_auth_admin sign-in path; switching to INVOKER would
-- break the signup mirror. The trigger keeps firing regardless: Postgres does NOT check EXECUTE at
-- trigger-fire time.
REVOKE EXECUTE ON FUNCTION public.mirror_auth_user_to_app_user() FROM PUBLIC;

-- No EXPLICIT anon/authenticated grant exists on this function (inspect: proacl is owner-only after the
-- PUBLIC revoke), but revoke defensively + idempotently so an accidental future grant can't reopen the
-- hole. Role-existence-guarded: `anon` does not exist on the plain-Postgres DoD (only `authenticated` is
-- shimmed by earlier migrations), and REVOKE on a missing role would error.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION public.mirror_auth_user_to_app_user() FROM "anon";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.mirror_auth_user_to_app_user() FROM "authenticated";
  END IF;
END $$;

-- ── Item 2: enforce_lineup_lock — pin search_path (the genuinely-open advisor item) ──────────────────
-- Closes `function_search_path_mutable` / the search-path-injection vector. PIN ONLY — the body (the
-- load-bearing lock-on-play latch invariant, ARCHITECTURE.md §4 / Invariant 3) is unchanged. '' is safe
-- AND minimal: the body fully-qualifies every object reference vacuously (it references none), and
-- pg_catalog is always implicitly searched first, so its comparison operators / RAISE still resolve.
ALTER FUNCTION public.enforce_lineup_lock() SET search_path = '';

-- ── Self-test (catalog-only) ────────────────────────────────────────────────────────────────────────
-- Runs during `prisma migrate deploy` (the Theme F self-test habit). Reads ONLY the catalog
-- (has_function_privilege / pg_proc.proconfig) — NO auth.uid()/JWT context, so none of the Prompt-13
-- 22P02 ("string_to_uuid") class can occur, and the assertions behave identically on Supabase and the
-- plain-Postgres DoD. Asserts the END STATE regardless of which migration achieved it; RAISE on failure
-- fails the deploy loudly. No rows are written, so no rollback dance is needed.
DO $$
DECLARE
  v_fail text := NULL;
BEGIN
  -- (a) mirror fn is NOT EXECUTE-able by PUBLIC (always checkable) …
  IF has_function_privilege('public', 'public.mirror_auth_user_to_app_user()', 'EXECUTE') THEN
    v_fail := 'PUBLIC can EXECUTE mirror_auth_user_to_app_user';
  -- … nor by anon / authenticated where those roles exist (Supabase; guarded for plain Postgres).
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
        AND has_function_privilege('anon', 'public.mirror_auth_user_to_app_user()', 'EXECUTE') THEN
    v_fail := 'anon can EXECUTE mirror_auth_user_to_app_user';
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
        AND has_function_privilege('authenticated', 'public.mirror_auth_user_to_app_user()', 'EXECUTE') THEN
    v_fail := 'authenticated can EXECUTE mirror_auth_user_to_app_user';
  -- (b) both functions have search_path pinned to the EMPTY value '' — value-exact, not mere
  -- presence: for the SECURITY DEFINER mirror fn the empty path IS the security property, so a future
  -- drift to `search_path = public` must go RED (presence-only `LIKE 'search_path=%'` would not).
  -- The empty path serialises to `search_path=""` on PG16 (verified); we ALSO accept a bare
  -- `search_path=` to absorb any PG version that emits the unquoted empty form — both mean "empty",
  -- and the reject-set is unchanged (`public` -> `search_path=public`, `pg_catalog` ->
  -- `search_path=pg_catalog` still fail). Deeper fallback: if some PG ever emits a THIRD empty form
  -- this both-forms check misses, the assertion RAISEs and the single-txn migration fail-safe rolls
  -- back (nothing persists) — that is the point at which you would widen to `LIKE 'search_path=%'`.
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mirror_auth_user_to_app_user'
      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c IN ('search_path=""', 'search_path='))
  ) THEN
    v_fail := 'mirror_auth_user_to_app_user search_path is not pinned to the empty value';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'enforce_lineup_lock'
      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c IN ('search_path=""', 'search_path='))
  ) THEN
    v_fail := 'enforce_lineup_lock search_path is not pinned to the empty value';
  END IF;

  IF v_fail IS NOT NULL THEN
    RAISE EXCEPTION 'security_followups self-test FAILED: %', v_fail;
  END IF;
END $$;
