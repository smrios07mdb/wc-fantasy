/**
 * Real-Postgres integration suite for the `faab_bid` SELECT Row-Level Security (CODE_PROMPT_57, the P0
 * `faab_bid_select_settled` fix). The production migration 20260620120000_fix_faab_settled_rls is a
 * DDL-only policy swap with NO embedded self-test (no data writes on `migrate deploy`, which Render runs
 * against the LIVE DB each release). This suite is the standing regression coverage that proves the
 * policy: it role-switches to the REAL `anon` / `authenticated` roles and asserts the COMPOSED faab_bid
 * SELECT visibility — something the in-migration owner role can never prove (it bypasses RLS, ENABLE not
 * FORCE).
 *
 * Pins:
 *   1. anon reads ZERO faab_bid rows (the P0 — settled bids no longer leak to the anon key);
 *   2. a league member reads their league's SETTLED bids (own + league-mates') — league-wide;
 *   3. a league member reads only their OWN pending bid (anti-copying: league-mates' pending stay hidden);
 *   4. cross-league isolation — a member of another league reads NONE of this league's settled bids.
 *
 * GATED on FAAB_RLS_PG_TEST_URL (a THROWAWAY DB — the suite creates the `anon` role, GRANTs SELECT, and
 * wipes tables); skipped in normal `pnpm test`, alongside the other *_PG_TEST_URL integration suites. The
 * policy lives in a raw-SQL migration, so the DB must be set up with `migrate deploy` (NOT `db push`,
 * which skips raw migrations). To run it:
 *
 *   docker run -d --name wc-faab-rls-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=faab_rls_test -p 55441:5432 postgres:16
 *   export FAAB_RLS_PG_TEST_URL="postgresql://postgres:postgres@127.0.0.1:55441/faab_rls_test"
 *   DATABASE_URL="$FAAB_RLS_PG_TEST_URL" DIRECT_URL="$FAAB_RLS_PG_TEST_URL" \
 *     pnpm --filter @app/db exec prisma migrate deploy
 *   pnpm vitest run packages/faab/src/faabSettledRls.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@app/db";

const TEST_URL = process.env.FAAB_RLS_PG_TEST_URL;

// Valid-uuid auth ids so `(auth.uid())::text = manager.user_id` round-trips under BOTH the bare-Postgres
// text auth.uid() shim AND the real Supabase uuid-returning auth.uid() (which casts the JWT sub to uuid).
const USER_IN = "00000000-0000-0000-0000-000000000001";
const USER_OUT = "00000000-0000-0000-0000-000000000002";

describe.skipIf(!TEST_URL)("faab_bid settled-bid SELECT RLS — real Postgres", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
    // Self-provision the Supabase-equivalent roles + privileges on the THROWAWAY (idempotent). The
    // migration chain creates `authenticated`; `anon` is never created by a migration. RLS — not table
    // privilege — is the intended gate, so grant SELECT to mirror Supabase (otherwise a role-switched
    // SELECT would hit permission-denied and mask the RLS result we are asserting).
    await db.$executeRawUnsafe(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF; END $$;`,
    );
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO anon, authenticated`);
    await db.$executeRawUnsafe(`GRANT SELECT ON "faab_bid", "manager" TO anon, authenticated`);
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  // Cross-league fixture: lg_in has an owner (mgr_in ↔ USER_IN) and a league-mate (mgr_other, no user);
  // lg_out has an unrelated member (mgr_out ↔ USER_OUT). Bids cover settled (own/mate/other-league) and
  // pending (own/mate) so every visibility branch is exercised.
  beforeEach(async () => {
    await db.faabBid.deleteMany({});
    await db.player.deleteMany({});
    await db.manager.deleteMany({});
    await db.league.deleteMany({});
    await db.appUser.deleteMany({});

    await db.appUser.createMany({
      data: [
        { id: USER_IN, email: "faab-rls-in@example.com" },
        { id: USER_OUT, email: "faab-rls-out@example.com" },
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
    await db.player.create({
      data: { id: "plr", balldontlieId: 990_000_001, displayName: "RLS Player", position: "FWD" },
    });
    await db.faabBid.createMany({
      data: [
        {
          id: "settled_in",
          leagueId: "lg_in",
          managerId: "mgr_in",
          playerAddId: "plr",
          amount: 10,
          status: "won",
        },
        {
          id: "settled_other",
          leagueId: "lg_in",
          managerId: "mgr_other",
          playerAddId: "plr",
          amount: 8,
          status: "lost",
        },
        {
          id: "settled_out",
          leagueId: "lg_out",
          managerId: "mgr_out",
          playerAddId: "plr",
          amount: 5,
          status: "won",
        },
        {
          id: "pending_own",
          leagueId: "lg_in",
          managerId: "mgr_in",
          playerAddId: "plr",
          amount: 7,
          status: "pending",
        },
        {
          id: "pending_other",
          leagueId: "lg_in",
          managerId: "mgr_other",
          playerAddId: "plr",
          amount: 9,
          status: "pending",
        },
      ],
    });
  });

  // Read the faab_bid ids visible as `role` with the given JWT sub, exercising the REAL composed RLS. An
  // interactive transaction pins ONE connection so `SET LOCAL ROLE` + the local jwt-claim apply to the
  // SELECT and unwind at COMMIT. `role` is a hardcoded literal (not user input), so interpolation is safe.
  async function visibleBidIds(
    role: "anon" | "authenticated",
    sub: string | null,
  ): Promise<string[]> {
    return db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      await tx.$queryRawUnsafe(`SELECT set_config('request.jwt.claim.sub', $1, true)`, sub ?? "");
      const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM faab_bid ORDER BY id`,
      );
      return rows.map((r) => r.id);
    });
  }

  it("anon sees ZERO faab_bid rows (P0: settled bids no longer leak to the anon key)", async () => {
    expect(await visibleBidIds("anon", null)).toEqual([]);
  });

  it("a league member sees league-wide SETTLED bids + only their OWN pending", async () => {
    const ids = await visibleBidIds("authenticated", USER_IN);
    // own settled + league-mate's settled + own pending; NOT the league-mate's pending, NOT lg_out.
    expect(ids).toEqual(["pending_own", "settled_in", "settled_other"]);
    expect(ids).not.toContain("pending_other"); // anti-copying
    expect(ids).not.toContain("settled_out"); // cross-league isolation
  });

  it("cross-league isolation: a member of another league sees none of this league's settled", async () => {
    // mgr_out only sees their OWN league's settled bid (and has no pending of their own).
    expect(await visibleBidIds("authenticated", USER_OUT)).toEqual(["settled_out"]);
  });
});
