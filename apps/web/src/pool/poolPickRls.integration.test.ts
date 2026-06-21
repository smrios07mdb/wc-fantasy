/**
 * Real-Postgres integration suite for the `pool_pick` SELECT Row-Level Security (the P1
 * `pool_pick_select_league_member` clock-gate fix). The production migration
 * 20260621120000_fix_pool_pick_realtime_rls is a DDL-only policy swap + SECURITY DEFINER helper with NO
 * embedded self-test (no data writes on `migrate deploy`, which Render runs against the LIVE DB each
 * release). This suite is the standing regression coverage that proves the policy: it role-switches to the
 * REAL `anon` / `authenticated` roles and asserts the COMPOSED pool_pick SELECT visibility — something the
 * in-migration owner role can never prove (it bypasses RLS, ENABLE not FORCE) and, crucially, would
 * silently MISS the nested-RLS trap (the kickoff branch joins RLS-default-deny `fifa_match`, so an
 * owner-run check would over-report visibility).
 *
 * The pool's pre-kickoff secrecy ("anti-copying") is enforced in the loader query
 * (`prismaStore.ts → readVisiblePicks`); this policy enforces the SAME rule at the RLS layer so the Data
 * API / Realtime subscription cannot bypass it. Pins:
 *   (a) a league member sees their OWN pick even BEFORE its fixture kicks off;
 *   (b) a league member does NOT see ANOTHER member's pick before that fixture kicks off (the P1 leak);
 *   (c) a league member DOES see another member's pick AFTER that fixture has kicked off (reveal works —
 *       proves the SECURITY DEFINER kickoff helper is reached, NOT killed by fifa_match's default-deny RLS);
 *   (d) anon reads ZERO pool_pick rows;
 *   plus cross-league isolation — a member of another league sees NONE of this league's picks, even
 *   post-kickoff (only their own).
 *
 * GATED on POOL_PICK_RLS_PG_TEST_URL (a THROWAWAY DB — the suite creates the `anon` role, GRANTs SELECT,
 * and wipes tables); skipped in normal `pnpm test`, alongside the other *_PG_TEST_URL integration suites.
 * The policy lives in a raw-SQL migration, so the DB must be set up with `migrate deploy` (NOT `db push`,
 * which skips raw migrations). To run it:
 *
 *   docker run -d --name wc-pool-rls-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=pool_rls_test -p 55442:5432 postgres:16
 *   export POOL_PICK_RLS_PG_TEST_URL="postgresql://postgres:postgres@127.0.0.1:55442/pool_rls_test"
 *   DATABASE_URL="$POOL_PICK_RLS_PG_TEST_URL" DIRECT_URL="$POOL_PICK_RLS_PG_TEST_URL" \
 *     pnpm --filter @app/db exec prisma migrate deploy
 *   pnpm vitest run apps/web/src/pool/poolPickRls.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@app/db";

const TEST_URL = process.env.POOL_PICK_RLS_PG_TEST_URL;

// Valid-uuid auth ids so `(auth.uid())::text = manager.user_id` round-trips under BOTH the bare-Postgres
// text auth.uid() shim AND the real Supabase uuid-returning auth.uid() (which casts the JWT sub to uuid).
const USER_IN = "00000000-0000-0000-0000-000000000001";
const USER_OUT = "00000000-0000-0000-0000-000000000002";

// Kickoff anchors with generous margins so DB now() lands unambiguously between them.
const KICKED_OFF = new Date(Date.now() - 60 * 60 * 1000); // 1h ago — fixture has started
const NOT_YET = new Date(Date.now() + 24 * 60 * 60 * 1000); // +1d — fixture not started

describe.skipIf(!TEST_URL)("pool_pick clock-gated SELECT RLS — real Postgres", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
    // Self-provision the Supabase-equivalent roles + privileges on the THROWAWAY (idempotent). The
    // migration chain creates `authenticated` (and GRANTs EXECUTE on the kickoff helper); `anon` is never
    // created by a migration. RLS — not table privilege — is the intended gate, so grant SELECT to mirror
    // Supabase (otherwise a role-switched SELECT would hit permission-denied and mask the RLS result we
    // are asserting). No fifa_match grant: the kickoff helper is SECURITY DEFINER and reads it as owner.
    await db.$executeRawUnsafe(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF; END $$;`,
    );
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO anon, authenticated`);
    await db.$executeRawUnsafe(`GRANT SELECT ON "pool_pick", "manager" TO anon, authenticated`);
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  // Cross-league fixture: lg_in has an owner (mgr_in ↔ USER_IN) and a league-mate (mgr_other, no user);
  // lg_out has an unrelated member (mgr_out ↔ USER_OUT). Two fixtures — one already kicked off, one not —
  // and picks spanning own/mate × pre/post-kickoff so every visibility branch is exercised.
  beforeEach(async () => {
    await db.poolPick.deleteMany({});
    await db.fifaMatch.deleteMany({});
    await db.manager.deleteMany({});
    await db.league.deleteMany({});
    await db.appUser.deleteMany({});

    await db.appUser.createMany({
      data: [
        { id: USER_IN, email: "pool-rls-in@example.com" },
        { id: USER_OUT, email: "pool-rls-out@example.com" },
      ],
    });
    await db.league.createMany({
      data: [
        { id: "lg_in", name: "lg-in" },
        { id: "lg_out", name: "lg-out" },
      ],
    });
    await db.manager.createMany({
      data: [
        { id: "mgr_in", leagueId: "lg_in", userId: USER_IN, displayName: "in" },
        { id: "mgr_other", leagueId: "lg_in", userId: null, displayName: "other" },
        { id: "mgr_out", leagueId: "lg_out", userId: USER_OUT, displayName: "out" },
      ],
    });
    await db.fifaMatch.createMany({
      data: [
        { id: "match_past", balldontlieId: 990_100_001, kickoffAt: KICKED_OFF },
        { id: "match_future", balldontlieId: 990_100_002, kickoffAt: NOT_YET },
      ],
    });
    await db.poolPick.createMany({
      data: [
        // caller's OWN picks — visible regardless of kickoff
        {
          id: "p_own_pre",
          leagueId: "lg_in",
          managerId: "mgr_in",
          matchId: "match_future",
          prediction: "HOME",
        },
        {
          id: "p_own_post",
          leagueId: "lg_in",
          managerId: "mgr_in",
          matchId: "match_past",
          prediction: "AWAY",
        },
        // league-mate's picks — hidden pre-kickoff, revealed post-kickoff
        {
          id: "p_other_pre",
          leagueId: "lg_in",
          managerId: "mgr_other",
          matchId: "match_future",
          prediction: "DRAW",
        },
        {
          id: "p_other_post",
          leagueId: "lg_in",
          managerId: "mgr_other",
          matchId: "match_past",
          prediction: "HOME",
        },
        // another league's pick (post-kickoff) — never visible to lg_in (cross-league isolation)
        {
          id: "p_out_post",
          leagueId: "lg_out",
          managerId: "mgr_out",
          matchId: "match_past",
          prediction: "AWAY",
        },
      ],
    });
  });

  // Read the pool_pick ids visible as `role` with the given JWT sub, exercising the REAL composed RLS. An
  // interactive transaction pins ONE connection so `SET LOCAL ROLE` + the local jwt-claim apply to the
  // SELECT and unwind at COMMIT. `role` is a hardcoded literal (not user input), so interpolation is safe.
  async function visiblePickIds(
    role: "anon" | "authenticated",
    sub: string | null,
  ): Promise<string[]> {
    return db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      await tx.$queryRawUnsafe(`SELECT set_config('request.jwt.claim.sub', $1, true)`, sub ?? "");
      const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM pool_pick ORDER BY id`,
      );
      return rows.map((r) => r.id);
    });
  }

  it("anon sees ZERO pool_pick rows", async () => {
    expect(await visiblePickIds("anon", null)).toEqual([]);
  });

  it("a league member sees own picks (any time) + league-mates' ONLY post-kickoff", async () => {
    const ids = await visiblePickIds("authenticated", USER_IN);
    // own pre + own post + league-mate's POST-kickoff; NOT the league-mate's pre-kickoff, NOT lg_out.
    expect(ids).toEqual(["p_other_post", "p_own_post", "p_own_pre"]);
    expect(ids).toContain("p_own_pre"); // (a) own pre-kickoff pick is visible
    expect(ids).not.toContain("p_other_pre"); // (b) the P1 leak: rival's pre-kickoff pick stays hidden
    expect(ids).toContain("p_other_post"); // (c) rival's pick revealed once the fixture kicks off
    expect(ids).not.toContain("p_out_post"); // cross-league isolation
  });

  it("cross-league isolation: a member of another league sees only their OWN pick, none of lg_in's", async () => {
    // mgr_out sees only their own (post-kickoff) pick; none of lg_in's picks, pre- or post-kickoff.
    expect(await visiblePickIds("authenticated", USER_OUT)).toEqual(["p_out_post"]);
  });
});
