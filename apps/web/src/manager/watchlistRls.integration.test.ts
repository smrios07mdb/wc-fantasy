/**
 * Gated Postgres RLS proof for the `watchlist` table (T2 — Waiver Watchlist). Mirrors
 * poolPickRls / faabSettledRls / groupStandingRls: role-switched SELECT/INSERT/DELETE under a
 * uuid-casting auth.uid(), asserting owner-only privacy + cross-league/anon isolation + the unique key.
 *
 * GATED on WATCHLIST_RLS_PG_TEST_URL (a THROWAWAY DB — the suite creates the `anon` role, GRANTs, installs
 * a uuid-casting auth.uid(), and WIPES tables); skipped in normal `pnpm test`, alongside the other
 * *_PG_TEST_URL integration suites. The owner-only policies live in a raw-SQL migration, so the DB must be
 * set up with `migrate deploy` (NOT `db push`, which skips raw migrations). The SAFE guard
 * (DATABASE_URL === WATCHLIST_RLS_PG_TEST_URL) refuses to run against any DB that is not the explicitly
 * named throwaway — mirroring the FAAB wipe suites. To run it:
 *
 *   docker run -d --name wc-watchlist-rls-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=watchlist_rls_test -p 55443:5432 postgres:16
 *   export WATCHLIST_RLS_PG_TEST_URL="postgresql://postgres:postgres@127.0.0.1:55443/watchlist_rls_test"
 *   DATABASE_URL="$WATCHLIST_RLS_PG_TEST_URL" DIRECT_URL="$WATCHLIST_RLS_PG_TEST_URL" \
 *     pnpm --filter @app/db exec prisma migrate deploy
 *   DATABASE_URL="$WATCHLIST_RLS_PG_TEST_URL" \
 *     pnpm --filter @app/web exec vitest run src/manager/watchlistRls.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@app/db";

const TEST_URL = process.env.WATCHLIST_RLS_PG_TEST_URL;
const SAFE = !!TEST_URL && process.env.DATABASE_URL === TEST_URL;

// Valid-uuid auth ids so `(auth.uid())::text = manager.user_id` round-trips under the uuid-casting
// auth.uid() installed below (a non-uuid sub would 22P02 — the SEC-P1 trap, asserted in the last test).
const USER_IN = "00000000-0000-0000-0000-000000000001"; // mgr_in, league lg_in
const USER_B = "00000000-0000-0000-0000-000000000002"; // mgr_b, SAME league lg_in
const USER_OUT = "00000000-0000-0000-0000-000000000003"; // mgr_out, DIFFERENT league lg_out

describe.skipIf(!SAFE)("watchlist owner-only RLS — real Postgres", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
    // Faithful uuid-cast auth.uid(): same TEXT signature as the migration shim, but casts THROUGH uuid so a
    // non-uuid sub 22P02s exactly like real Supabase's uuid-returning auth.uid() — the airtight verification
    // the bare text shim would silently mask. CREATE OR REPLACE keeps the signature, so dependent policies
    // are untouched.
    await db.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION auth.uid() RETURNS text LANGUAGE sql STABLE AS $b$ SELECT (NULLIF(current_setting('request.jwt.claim.sub', true), ''))::uuid::text $b$;`,
    );
    // Self-provision the Supabase-equivalent roles + privileges on the THROWAWAY (idempotent). The migration
    // chain creates `authenticated`; `anon` is never created by a migration. RLS — not table privilege — is
    // the intended gate, so GRANT to mirror Supabase (otherwise a role-switched query hits permission-denied
    // and masks the RLS result we are asserting).
    await db.$executeRawUnsafe(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF; END $$;`,
    );
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO anon, authenticated`);
    await db.$executeRawUnsafe(
      `GRANT SELECT, INSERT, DELETE ON "watchlist" TO anon, authenticated`,
    );
    await db.$executeRawUnsafe(`GRANT SELECT ON "manager" TO anon, authenticated`);
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  beforeEach(async () => {
    // Child-first wipe, then re-seed: two leagues, three users/managers (two in lg_in), two players, two
    // stars (mgr_in→plr1, mgr_b→plr2). Seeded via Prisma (table owner, RLS-bypassing; sets @updatedAt).
    await db.watchlist.deleteMany({});
    await db.player.deleteMany({});
    await db.manager.deleteMany({});
    await db.league.deleteMany({});
    await db.appUser.deleteMany({});

    await db.appUser.createMany({
      data: [
        { id: USER_IN, email: "wl-in@example.com" },
        { id: USER_B, email: "wl-b@example.com" },
        { id: USER_OUT, email: "wl-out@example.com" },
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
        { id: "mgr_b", leagueId: "lg_in", userId: USER_B, displayName: "b" },
        { id: "mgr_out", leagueId: "lg_out", userId: USER_OUT, displayName: "out" },
      ],
    });
    await db.player.createMany({
      data: [
        { id: "plr1", balldontlieId: 990_100_001, displayName: "P1", position: "FWD" },
        { id: "plr2", balldontlieId: 990_100_002, displayName: "P2", position: "MID" },
      ],
    });
    await db.watchlist.createMany({
      data: [
        { id: "w_in", leagueId: "lg_in", managerId: "mgr_in", playerId: "plr1" },
        { id: "w_b", leagueId: "lg_in", managerId: "mgr_b", playerId: "plr2" },
      ],
    });
  });

  /** Player ids VISIBLE under a role + JWT sub. The interactive tx pins ONE connection so SET LOCAL ROLE +
   *  the tx-local set_config apply to the SELECT and unwind at COMMIT (next Prisma call runs as owner). */
  async function visiblePlayerIds(
    role: "anon" | "authenticated",
    sub: string | null,
  ): Promise<string[]> {
    return db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`); // role is a hardcoded literal — safe to interpolate
      await tx.$queryRawUnsafe(`SELECT set_config('request.jwt.claim.sub', $1, true)`, sub ?? "");
      const rows = await tx.$queryRawUnsafe<{ player_id: string }[]>(
        `SELECT player_id FROM watchlist ORDER BY player_id`,
      );
      return rows.map((r) => r.player_id);
    });
  }

  /** INSERT a star under a role + sub; resolves on success, rejects on an RLS / constraint violation. */
  async function insertAs(
    role: "anon" | "authenticated",
    sub: string | null,
    row: { leagueId: string; managerId: string; playerId: string },
  ): Promise<void> {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      await tx.$queryRawUnsafe(`SELECT set_config('request.jwt.claim.sub', $1, true)`, sub ?? "");
      await tx.$executeRawUnsafe(
        `INSERT INTO watchlist (id, league_id, manager_id, player_id) VALUES ($1, $2, $3, $4)`,
        randomUUID(),
        row.leagueId,
        row.managerId,
        row.playerId,
      );
    });
  }

  /** DELETE a star under a role + sub; returns the affected-row count. */
  async function deleteAs(
    role: "anon" | "authenticated",
    sub: string | null,
    where: { managerId: string; playerId: string },
  ): Promise<number> {
    return db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      await tx.$queryRawUnsafe(`SELECT set_config('request.jwt.claim.sub', $1, true)`, sub ?? "");
      return tx.$executeRawUnsafe(
        `DELETE FROM watchlist WHERE manager_id = $1 AND player_id = $2`,
        where.managerId,
        where.playerId,
      );
    });
  }

  it("the owner reads ONLY their own star", async () => {
    expect(await visiblePlayerIds("authenticated", USER_IN)).toEqual(["plr1"]);
  });

  it("a league-mate reads ONLY their own star, NOT the owner's (the privacy guarantee)", async () => {
    const seen = await visiblePlayerIds("authenticated", USER_B);
    expect(seen).toEqual(["plr2"]);
    expect(seen).not.toContain("plr1");
  });

  it("a manager in a DIFFERENT league reads zero", async () => {
    expect(await visiblePlayerIds("authenticated", USER_OUT)).toEqual([]);
  });

  it("anon reads zero", async () => {
    expect(await visiblePlayerIds("anon", null)).toEqual([]);
  });

  it("the Prisma OWNER (the server's only reader) reads EVERY row — RLS bypass, defense-in-depth", async () => {
    const rows = await db.watchlist.findMany({
      select: { playerId: true },
      orderBy: { playerId: "asc" },
    });
    expect(rows.map((r) => r.playerId)).toEqual(["plr1", "plr2"]);
  });

  it("the owner can INSERT their own star", async () => {
    await insertAs("authenticated", USER_IN, {
      leagueId: "lg_in",
      managerId: "mgr_in",
      playerId: "plr2",
    });
    expect(await visiblePlayerIds("authenticated", USER_IN)).toEqual(["plr1", "plr2"]);
  });

  it("the owner can DELETE their own star", async () => {
    const n = await deleteAs("authenticated", USER_IN, { managerId: "mgr_in", playerId: "plr1" });
    expect(n).toBe(1);
    expect(await visiblePlayerIds("authenticated", USER_IN)).toEqual([]);
  });

  it("a manager CANNOT INSERT a star for ANOTHER manager (WITH CHECK blocks it)", async () => {
    await expect(
      insertAs("authenticated", USER_B, {
        leagueId: "lg_in",
        managerId: "mgr_in",
        playerId: "plr2",
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("anon CANNOT INSERT (no policy → default deny)", async () => {
    await expect(
      insertAs("anon", null, { leagueId: "lg_in", managerId: "mgr_in", playerId: "plr2" }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("the (manager_id, player_id) unique key blocks a duplicate star", async () => {
    await expect(
      insertAs("authenticated", USER_IN, {
        leagueId: "lg_in",
        managerId: "mgr_in",
        playerId: "plr1",
      }),
    ).rejects.toThrow(/duplicate key|unique|23505/i);
  });

  it("a non-uuid JWT sub 22P02s — proves the cast is real, not a text-shim false green", async () => {
    await expect(visiblePlayerIds("authenticated", "not-a-uuid")).rejects.toThrow(
      /invalid input syntax for type uuid|22P02/i,
    );
  });
});
