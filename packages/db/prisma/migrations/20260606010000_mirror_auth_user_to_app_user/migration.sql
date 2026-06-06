-- Mirror Supabase auth users → public.app_user, so provisioning `bind` (and any user_id linkage) can
-- resolve a signed-in person by email. Sign-in creates an `auth.users` row, but the app's
-- /auth/callback intentionally does NOT touch app_user — this closes that gap at the DB layer, for
-- every entry path (magic-link, OAuth, admin-created).
--
-- Portable: `auth.users` exists on Supabase but NOT on a plain Postgres (the DoD's fresh-Postgres).
-- The function is always created; the trigger + one-time backfill are guarded on `auth.users` existing.

-- The mirror function. SECURITY DEFINER so it runs as the OWNER (the migration role, which bypasses
-- RLS): the sign-in path inserts `auth.users` as `supabase_auth_admin`, which otherwise cannot write
-- the RLS-protected `public.app_user`. `SET search_path = ''` + fully-qualified names so it is NOT
-- flagged by `function_search_path_mutable` and can't be hijacked via a mutable search_path.
CREATE OR REPLACE FUNCTION public.mirror_auth_user_to_app_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW; -- email-less auth users (e.g. phone/anon) have nothing to mirror; app_user.email is NOT NULL
  END IF;
  INSERT INTO public.app_user (id, email, updated_at)
  VALUES (NEW.id::text, NEW.email, pg_catalog.now())
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email, updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

-- A SECURITY DEFINER function in `public` is EXECUTE-able by PUBLIC (anon/authenticated) by default;
-- revoke that. The trigger still fires regardless — triggers don't check the firing role's EXECUTE
-- privilege on the function.
REVOKE EXECUTE ON FUNCTION public.mirror_auth_user_to_app_user() FROM PUBLIC;

-- Trigger + one-time backfill — only where `auth.users` exists (Supabase; skipped on plain Postgres).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth' AND c.relname = 'users'
  ) THEN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users; -- idempotent re-apply
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.mirror_auth_user_to_app_user();

    -- Backfill users created BEFORE this trigger existed (it only fires on future inserts). Idempotent.
    INSERT INTO public.app_user (id, email, updated_at)
    SELECT u.id::text, u.email, pg_catalog.now()
    FROM auth.users u
    WHERE u.email IS NOT NULL
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = pg_catalog.now();
  END IF;
END $$;
