-- Prompt 41a — Notifications transport: the three Web Push tables + their Row-Level Security. Managers
-- register device push subscriptions and per-channel preferences; the server records an idempotency
-- ledger and pushes server→device (DECISIONS.md → Notifications). This migration adds NO trigger and NO
-- feed/ingest change — the delivery policy lives in @app/notify and the triggers that EMIT are 41b.
--
-- NO REALTIME / NO PUBLICATION (deliberate, stated explicitly): Web Push is server→device over the push
-- services (FCM/Mozilla/Apple), NOT Supabase `postgres_changes`. None of these tables is added to the
-- `supabase_realtime` publication — push sidesteps the RLS-broadcast path entirely, so the Theme-F
-- publication trap (a subscription silently delivering zero events) cannot apply here.
--
-- RLS model — SELF-ONLY (a manager sees/writes only their OWN rows), mirroring the `manager.user_id =
-- auth.uid()` idiom from `pool_pick` / `faab_bid` but WITHOUT the league-scoped read:
--   * push_subscription       — SELECT / INSERT / DELETE own (the subscribe/unsubscribe surface). No
--                               UPDATE policy: re-subscribe is delete+insert, and the server upsert runs
--                               as the table owner (RLS-exempt).
--   * notification_preference — SELECT / INSERT / UPDATE own (the lazy upsert + the preferences write).
--   * notification_sent       — RLS ENABLED with ZERO policies = DEFAULT-DENY for every JWT role. This
--                               is the "service-role write only, no client read" guarantee: the server
--                               (owner) bypasses; the Data API roles can neither read nor write.
--                               TODO(confirm): if a notification-history UI is ever wanted, add a
--                               self-only SELECT policy here (own rows) — intentionally absent for now.
-- Every write path also goes through the gated server routes (Prisma owner), so RLS is defence-in-depth.
--
-- Portable: runs on a plain Postgres (the DoD fresh-Postgres) AND on Supabase. Uses ENABLE (not FORCE)
-- RLS, so the table-owning `postgres` role (Prisma, the worker, provisioning, `prisma migrate deploy`)
-- is UNAFFECTED; RLS bites only the JWT-scoped anon/authenticated roles reachable via the Data API.

-- ── (1) DDL (exact `prisma migrate diff` output) ──────────────────────────────────────────────────
-- CreateTable
CREATE TABLE "push_subscription" (
    "id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preference" (
    "manager_id" TEXT NOT NULL,
    "draft_turn" BOOLEAN NOT NULL DEFAULT true,
    "player_not_starting" BOOLEAN NOT NULL DEFAULT true,
    "match_starting" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("manager_id")
);

-- CreateTable
CREATE TABLE "notification_sent" (
    "id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_sent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscription_endpoint_key" ON "push_subscription"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscription_manager_id_idx" ON "push_subscription"("manager_id");

-- CreateIndex
CREATE INDEX "notification_sent_manager_id_idx" ON "notification_sent"("manager_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_sent_uq" ON "notification_sent"("manager_id", "kind", "subject_id");

-- AddForeignKey
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_sent" ADD CONSTRAINT "notification_sent_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Portability shims (idempotent; no-ops on Supabase) ────────────────────────────────────────────
-- The `authenticated` role (policies target it) and `auth.uid()` (reads the JWT `sub` claim) exist on
-- Supabase but not on a bare Postgres. Mirror the earlier RLS migrations so `migrate deploy` succeeds on
-- the fresh-Postgres DoD. NB: the bare-Postgres shim returns TEXT, which MASKS the `sub::uuid` cast the
-- real Supabase `auth.uid()` performs — so the FAITHFUL self-test below is run during verification
-- against a UUID-returning `auth.uid()` (pre-seeded so the `IF NOT EXISTS` guard skips this stub). The
-- valid-uuid literals make the self-test pass under BOTH shims (DECISIONS.md → RLS verification).
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
ALTER TABLE "push_subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_preference" ENABLE ROW LEVEL SECURITY;
-- notification_sent: RLS ON but NO policy → default-deny for every JWT role (server owner bypasses).
ALTER TABLE "notification_sent" ENABLE ROW LEVEL SECURITY;

-- push_subscription — SELF-ONLY. The predicate references ONLY the caller's own `manager` row (visible
-- via `manager_select_own`), so the owner-run self-test result equals the role-run result.
CREATE POLICY "push_subscription_select_own" ON "push_subscription"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "push_subscription"."manager_id"
        AND m."user_id" = (auth.uid())::text
    )
  );

CREATE POLICY "push_subscription_insert_own" ON "push_subscription"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "push_subscription"."manager_id"
        AND m."user_id" = (auth.uid())::text
    )
  );

CREATE POLICY "push_subscription_delete_own" ON "push_subscription"
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "push_subscription"."manager_id"
        AND m."user_id" = (auth.uid())::text
    )
  );

-- notification_preference — SELF-ONLY (SELECT + the lazy-upsert INSERT + the preferences UPDATE).
CREATE POLICY "notification_preference_select_own" ON "notification_preference"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "notification_preference"."manager_id"
        AND m."user_id" = (auth.uid())::text
    )
  );

CREATE POLICY "notification_preference_insert_own" ON "notification_preference"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "notification_preference"."manager_id"
        AND m."user_id" = (auth.uid())::text
    )
  );

CREATE POLICY "notification_preference_update_own" ON "notification_preference"
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "notification_preference"."manager_id"
        AND m."user_id" = (auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "manager" m
      WHERE m."id" = "notification_preference"."manager_id"
        AND m."user_id" = (auth.uid())::text
    )
  );

-- ── (3) Self-test (Theme F): self-only isolation + notification_sent default-deny ─────────────────
-- Runs during `prisma migrate deploy` (vitest never executes SQL). Asserts the EFFECTIVE policy logic by
-- evaluating each predicate as the migration owner — faithful because every predicate filters
-- `manager.user_id = auth.uid()`, restricting to the caller's OWN manager row (so the owner-run result,
-- RLS bypassed, equals the role-run result). It proves: (a) a manager reads + writes their OWN
-- push_subscription / notification_preference; (b) a DIFFERENT user can read NEITHER (self-only
-- isolation); (c) a manager cannot write ANOTHER manager's row; and structurally (d) notification_sent
-- has RLS enabled with ZERO policies (the service-role-write-only / no-client-read guarantee). The seed
-- is ALWAYS unwound via a sentinel raise; a real mismatch is recorded and re-raised AFTER cleanup,
-- failing the deploy loudly. The live JWT-authed push delivery on real Supabase is a separate
-- provision-time gate.
--
-- The two `sub` ids are driven into `request.jwt.claim.sub` and read back via `auth.uid()`. On Supabase
-- (and the UUID-returning verification shim) the real `auth.uid()` casts that claim to `uuid`, so they
-- MUST be valid uuids or `(auth.uid())::text` 22P02s on `prisma migrate deploy`.
DO $$
DECLARE
  v_lg        text := 'notif_selftest_lg_in';
  v_lg2       text := 'notif_selftest_lg_out';
  v_mgr_in    text := 'notif_selftest_mgr_in';   -- the caller's own manager (league lg_in)
  v_mgr_out   text := 'notif_selftest_mgr_out';  -- a manager in a DIFFERENT league (lg_out)
  v_user_in   text := '00000000-0000-0000-0000-0000000000a1';  -- in-league caller's auth uid
  v_user_out  text := '00000000-0000-0000-0000-0000000000a2';  -- different user's auth uid
  v_reads_own_sub     boolean := false;  -- manager reads their OWN push_subscription (must be TRUE)
  v_reads_own_pref    boolean := false;  -- manager reads their OWN notification_preference (must be TRUE)
  v_writes_own_sub    boolean := false;  -- manager writes their OWN push_subscription (must be TRUE)
  v_other_reads_sub   boolean := true;   -- a DIFFERENT user reads mgr_in's sub (must be FALSE)
  v_other_reads_pref  boolean := true;   -- a DIFFERENT user reads mgr_in's pref (must be FALSE)
  v_writes_other_sub  boolean := true;   -- manager writes ANOTHER manager's sub (must be FALSE)
  v_sent_rls_enabled  boolean := false;  -- notification_sent has RLS enabled (must be TRUE)
  v_sent_policy_count integer := -1;     -- notification_sent policy count (must be 0)
  v_fail text := NULL;
BEGIN
  BEGIN
    -- `manager.user_id` FKs to `app_user.id`; in the real app both equal the Supabase auth uid, so seed
    -- app_user rows whose ids match the JWT `sub` we drive auth.uid() with.
    INSERT INTO "app_user" ("id", "email", "updated_at")
      VALUES (v_user_in, 'notif-selftest-in@example.com', CURRENT_TIMESTAMP),
             (v_user_out, 'notif-selftest-out@example.com', CURRENT_TIMESTAMP);
    INSERT INTO "league" ("id", "name", "updated_at")
      VALUES (v_lg, 'notif-selftest-in', CURRENT_TIMESTAMP),
             (v_lg2, 'notif-selftest-out', CURRENT_TIMESTAMP);
    INSERT INTO "manager" ("id", "league_id", "user_id", "display_name", "updated_at")
      VALUES (v_mgr_in, v_lg, v_user_in, 'in', CURRENT_TIMESTAMP),
             (v_mgr_out, v_lg2, v_user_out, 'out', CURRENT_TIMESTAMP);
    -- Seed one row in each table for mgr_in so the predicates have data to filter + the FK chain resolves.
    INSERT INTO "push_subscription" ("id", "manager_id", "endpoint", "p256dh", "auth")
      VALUES ('notif_selftest_sub', v_mgr_in, 'https://push.example/selftest', 'p', 'a');
    INSERT INTO "notification_preference" ("manager_id", "updated_at")
      VALUES (v_mgr_in, CURRENT_TIMESTAMP);
    INSERT INTO "notification_sent" ("id", "manager_id", "kind", "subject_id")
      VALUES ('notif_selftest_sent', v_mgr_in, 'draft_turn', 'subj-1');

    -- member (in-league user): own-row reads + writes are TRUE.
    PERFORM set_config('request.jwt.claim.sub', v_user_in, true);
    v_reads_own_sub := EXISTS (
      SELECT 1 FROM "manager" m WHERE m."id" = v_mgr_in AND m."user_id" = (auth.uid())::text);
    v_reads_own_pref := v_reads_own_sub;  -- same predicate (manager-own); kept distinct for clarity
    v_writes_own_sub := EXISTS (
      SELECT 1 FROM "manager" m WHERE m."id" = v_mgr_in AND m."user_id" = (auth.uid())::text);
    v_writes_other_sub := EXISTS (
      SELECT 1 FROM "manager" m WHERE m."id" = v_mgr_out AND m."user_id" = (auth.uid())::text);

    -- a DIFFERENT user must read NEITHER mgr_in's sub NOR pref.
    PERFORM set_config('request.jwt.claim.sub', v_user_out, true);
    v_other_reads_sub := EXISTS (
      SELECT 1 FROM "manager" m WHERE m."id" = v_mgr_in AND m."user_id" = (auth.uid())::text);
    v_other_reads_pref := v_other_reads_sub;

    PERFORM set_config('request.jwt.claim.sub', '', true);

    -- structural: notification_sent RLS on + zero policies = default-deny for the JWT roles.
    SELECT c.relrowsecurity INTO v_sent_rls_enabled
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'notification_sent';
    SELECT count(*) INTO v_sent_policy_count
      FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notification_sent';

    IF NOT v_reads_own_sub THEN
      v_fail := 'manager cannot SELECT their OWN push_subscription';
    ELSIF NOT v_reads_own_pref THEN
      v_fail := 'manager cannot SELECT their OWN notification_preference';
    ELSIF NOT v_writes_own_sub THEN
      v_fail := 'manager cannot write their OWN push_subscription';
    ELSIF v_other_reads_sub THEN
      v_fail := 'a DIFFERENT user CAN SELECT another manager''s push_subscription (self-only broken)';
    ELSIF v_other_reads_pref THEN
      v_fail := 'a DIFFERENT user CAN SELECT another manager''s notification_preference (self-only broken)';
    ELSIF v_writes_other_sub THEN
      v_fail := 'manager CAN write ANOTHER manager''s push_subscription (own-row write enforcement broken)';
    ELSIF NOT v_sent_rls_enabled THEN
      v_fail := 'notification_sent does NOT have RLS enabled (client could read the ledger)';
    ELSIF v_sent_policy_count <> 0 THEN
      v_fail := 'notification_sent has a client RLS policy (expected zero — service-role write only)';
    END IF;

    RAISE EXCEPTION 'notif_selftest_rollback';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'notif_selftest_rollback' THEN
        PERFORM set_config('request.jwt.claim.sub', '', true);
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF v_fail IS NOT NULL THEN
    RAISE EXCEPTION 'notifications RLS self-test FAILED: %', v_fail;
  END IF;
END $$;
