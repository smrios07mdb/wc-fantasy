/**
 * Real-Postgres integration suite for the `group_standing` SELECT Row-Level Security (T18). The production
 * migration 20260626120000_group_standing enables RLS and adds a single `group_standing_select_all` policy
 * (`FOR SELECT TO authenticated USING (true)`) with NO realtime publication and NO anon grant — group
 * standings are non-sensitive reference data, like `match_lineup_entry`. The migration is DDL/policy-only
 * (no data writes on `migrate deploy`, which Render runs against the LIVE DB each release), so this suite is
 * the standing regression coverage: it role-switches to the REAL `anon` / `authenticated` roles — something
 * the in-migration owner role can never prove (it bypasses RLS, ENABLE not FORCE).
 *
 * Pins:
 *   1. anon reads ZERO group_standing rows (RLS on + no anon policy = default-deny);
 *   2. ANY authenticated client reads EVERY row (`USING (true)` — tournament-wide reference data);
 *   3. the owner (Prisma, the server's only reader) reads every row (RLS bypass — defense-in-depth policy).
 *
 * GATED on GROUP_STANDING_RLS_PG_TEST_URL (a THROWAWAY DB — the suite creates `anon`, GRANTs SELECT, and
 * wipes tables); skipped in normal `pnpm test`, alongside the other *_PG_TEST_URL suites. The policy lives
 * in a raw-SQL migration, so set the DB up with `migrate deploy` (NOT `db push`). To run it:
 *
 *   docker run -d --name wc-gs-rls-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=gs_rls_test -p 55442:5432 postgres:16
 *   export GROUP_STANDING_RLS_PG_TEST_URL="postgresql://postgres:postgres@127.0.0.1:55442/gs_rls_test"
 *   DATABASE_URL="$GROUP_STANDING_RLS_PG_TEST_URL" DIRECT_URL="$GROUP_STANDING_RLS_PG_TEST_URL" \
 *     pnpm --filter @app/db exec prisma migrate deploy
 *   pnpm vitest run packages/ingest/src/groupStandingRls.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@app/db";

const TEST_URL = process.env.GROUP_STANDING_RLS_PG_TEST_URL;

// A valid uuid sub so `(auth.uid())::text` round-trips under BOTH the bare-Postgres text shim AND the real
// Supabase uuid-returning auth.uid() — though the USING(true) policy never reads it.
const ANY_SUB = "00000000-0000-0000-0000-000000000001";

describe.skipIf(!TEST_URL)("group_standing SELECT RLS — real Postgres", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
    // Self-provision the Supabase-equivalent roles + privileges on the THROWAWAY (idempotent). The
    // migration chain creates `authenticated`; `anon` is never created by a migration. RLS — not table
    // privilege — is the intended gate, so grant SELECT to both so a role-switched SELECT reaches RLS
    // rather than a permission-denied (which would mask the result we assert).
    await db.$executeRawUnsafe(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF; END $$;`,
    );
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO anon, authenticated`);
    await db.$executeRawUnsafe(
      `GRANT SELECT ON "group_standing", "fifa_team" TO anon, authenticated`,
    );
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  beforeEach(async () => {
    await db.groupStanding.deleteMany({}); // child first (FK → fifa_team)
    await db.fifaTeam.deleteMany({});
    await db.fifaTeam.create({ data: { id: "t1", balldontlieId: 990_000_101, name: "Mexico" } });
    await db.groupStanding.create({
      data: {
        teamId: "t1",
        bdlGroupId: 1,
        groupName: "Group A",
        season: 2026,
        position: 1,
        played: 3,
        won: 3,
        drawn: 0,
        lost: 0,
        goalsFor: 6,
        goalsAgainst: 0,
        goalDifference: 6,
        points: 9,
      },
    });
  });

  // Read the group_standing team_ids visible as `role` with the given JWT sub, exercising the REAL policy.
  // An interactive transaction pins ONE connection so `SET LOCAL ROLE` applies to the SELECT and unwinds at
  // COMMIT. `role` is a hardcoded literal (not user input), so interpolation is safe.
  async function visibleTeamIds(
    role: "anon" | "authenticated",
    sub: string | null,
  ): Promise<string[]> {
    return db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      await tx.$queryRawUnsafe(`SELECT set_config('request.jwt.claim.sub', $1, true)`, sub ?? "");
      const rows = await tx.$queryRawUnsafe<{ team_id: string }[]>(
        `SELECT team_id FROM group_standing ORDER BY team_id`,
      );
      return rows.map((r) => r.team_id);
    });
  }

  it("anon sees ZERO group_standing rows (RLS on + no anon policy = default-deny)", async () => {
    expect(await visibleTeamIds("anon", null)).toEqual([]);
  });

  it("any authenticated client sees EVERY row (USING(true) — tournament-wide reference data)", async () => {
    expect(await visibleTeamIds("authenticated", ANY_SUB)).toEqual(["t1"]);
    // No JWT sub at all still reads — the policy never inspects the JWT.
    expect(await visibleTeamIds("authenticated", null)).toEqual(["t1"]);
  });

  it("the owner (Prisma, the server's only reader) reads every row — RLS bypass, defense-in-depth", async () => {
    const rows = await db.groupStanding.findMany({ select: { teamId: true } });
    expect(rows.map((r) => r.teamId)).toEqual(["t1"]);
  });
});
