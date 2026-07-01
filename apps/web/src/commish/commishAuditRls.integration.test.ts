/**
 * Gated Postgres RLS proof for the `commish_audit` table (Commissioner console Thread 1). Mirrors
 * watchlistRls / poolPickRls: role-switched SELECT/INSERT under a uuid-casting auth.uid(), asserting the
 * COMMISSIONER-ONLY read + server-only writes + league scoping + anon/cross-league isolation.
 *
 * The commish_audit posture differs from watchlist's owner-only family: there is exactly ONE SELECT policy
 * and it is COMMISSIONER-ONLY (caller's own manager row shares the row's league AND is_commissioner), and
 * there are ZERO write policies — so RLS default-denies every client INSERT/UPDATE/DELETE; all rows are
 * written by the server owner client (recordCommishAudit), which bypasses RLS as the table owner.
 *
 * GATED on COMMISH_AUDIT_PG_TEST_URL (a THROWAWAY DB — the suite creates the `anon` role, GRANTs, installs a
 * uuid-casting auth.uid(), and WIPES tables); skipped in normal `pnpm test`, alongside the other
 * *_PG_TEST_URL integration suites. The policies live in a raw-SQL migration, so the DB must be set up with
 * `migrate deploy` (NOT `db push`, which skips raw migrations). The SAFE guard
 * (DATABASE_URL === COMMISH_AUDIT_PG_TEST_URL) refuses to run against any DB that is not the explicitly named
 * throwaway — mirroring the FAAB/watchlist wipe suites. To run it:
 *
 *   docker run -d --name wc-commish-audit-rls-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=commish_audit_rls_test -p 55444:5432 postgres:16
 *   export COMMISH_AUDIT_PG_TEST_URL="postgresql://postgres:postgres@127.0.0.1:55444/commish_audit_rls_test"
 *   DATABASE_URL="$COMMISH_AUDIT_PG_TEST_URL" DIRECT_URL="$COMMISH_AUDIT_PG_TEST_URL" \
 *     pnpm --filter @app/db exec prisma migrate deploy
 *   DATABASE_URL="$COMMISH_AUDIT_PG_TEST_URL" \
 *     pnpm --filter @app/web exec vitest run src/commish/commishAuditRls.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@app/db";

const TEST_URL = process.env.COMMISH_AUDIT_PG_TEST_URL;
const SAFE = !!TEST_URL && process.env.DATABASE_URL === TEST_URL;

// Valid-uuid auth ids so `(auth.uid())::text = manager.user_id` round-trips under the uuid-casting
// auth.uid() installed below (a non-uuid sub would 22P02 — the SEC-P1 trap, asserted in the last test).
const USER_COMM = "00000000-0000-0000-0000-000000000001"; // mgr_comm, league lg_in, is_commissioner
const USER_MEMBER = "00000000-0000-0000-0000-000000000002"; // mgr_member, SAME league lg_in, NOT commissioner
const USER_OUT_COMM = "00000000-0000-0000-0000-000000000003"; // mgr_out, DIFFERENT league lg_out, is_commissioner

describe.skipIf(!SAFE)("commish_audit commissioner-only RLS — real Postgres", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
    // Faithful uuid-cast auth.uid(): same TEXT signature as the migration shim, but casts THROUGH uuid so a
    // non-uuid sub 22P02s exactly like real Supabase's uuid-returning auth.uid() — the airtight verification
    // the bare text shim would silently mask. CREATE OR REPLACE keeps the signature, so the policy is untouched.
    await db.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION auth.uid() RETURNS text LANGUAGE sql STABLE AS $b$ SELECT (NULLIF(current_setting('request.jwt.claim.sub', true), ''))::uuid::text $b$;`,
    );
    // Self-provision the Supabase-equivalent roles + privileges on the THROWAWAY (idempotent). The migration
    // chain creates `authenticated`; `anon` is never created by a migration. RLS — not table privilege — is
    // the intended gate, so GRANT to mirror Supabase (otherwise a role-switched query hits permission-denied
    // and masks the RLS result we are asserting). We GRANT INSERT too, precisely so the "authenticated INSERT
    // is rejected" assertion proves RLS default-deny, not a missing table grant.
    await db.$executeRawUnsafe(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF; END $$;`,
    );
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO anon, authenticated`);
    await db.$executeRawUnsafe(`GRANT SELECT, INSERT ON "commish_audit" TO anon, authenticated`);
    await db.$executeRawUnsafe(`GRANT SELECT ON "manager" TO anon, authenticated`);
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  beforeEach(async () => {
    // Child-first wipe, then re-seed: two leagues, three users/managers (a commissioner + a plain member in
    // lg_in, a commissioner in lg_out), and audit rows in BOTH leagues. Seeded via Prisma (table owner,
    // RLS-bypassing) — this is exactly the server write path (recordCommishAudit uses the owner client).
    await db.commishAudit.deleteMany({});
    await db.manager.deleteMany({});
    await db.league.deleteMany({});
    await db.appUser.deleteMany({});

    await db.appUser.createMany({
      data: [
        { id: USER_COMM, email: "ca-comm@example.com" },
        { id: USER_MEMBER, email: "ca-member@example.com" },
        { id: USER_OUT_COMM, email: "ca-out@example.com" },
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
        {
          id: "mgr_comm",
          leagueId: "lg_in",
          userId: USER_COMM,
          displayName: "comm",
          isCommissioner: true,
        },
        {
          id: "mgr_member",
          leagueId: "lg_in",
          userId: USER_MEMBER,
          displayName: "member",
          isCommissioner: false,
        },
        {
          id: "mgr_out",
          leagueId: "lg_out",
          userId: USER_OUT_COMM,
          displayName: "out",
          isCommissioner: true,
        },
      ],
    });
    await db.commishAudit.createMany({
      data: [
        // a_in_1 / a_in_2: NULL actor (no actor_user_id). a_in_3: FOREIGN actor — authored by USER_MEMBER,
        // a DIFFERENT user than the commissioner reader (USER_COMM) and NOT a commissioner. Both shapes let
        // PART A / confirm-1 prove the SELECT gate is "reader is a commissioner in this league", never
        // "reader authored this row".
        { id: "a_in_1", leagueId: "lg_in", actionType: "penalty_applied", summary: "in-1" },
        { id: "a_in_2", leagueId: "lg_in", actionType: "stat_correction", summary: "in-2" },
        {
          id: "a_in_3",
          leagueId: "lg_in",
          actorUserId: USER_MEMBER,
          actionType: "rating_override",
          summary: "in-3-foreign-actor",
        },
        { id: "a_out_1", leagueId: "lg_out", actionType: "penalty_applied", summary: "out-1" },
      ],
    });
  });

  /** Audit-row ids VISIBLE under a role + JWT sub. The interactive tx pins ONE connection so SET LOCAL ROLE +
   *  the tx-local set_config apply to the SELECT and unwind at COMMIT (next Prisma call runs as owner). */
  async function visibleIds(role: "anon" | "authenticated", sub: string | null): Promise<string[]> {
    return db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`); // role is a hardcoded literal — safe to interpolate
      await tx.$queryRawUnsafe(`SELECT set_config('request.jwt.claim.sub', $1, true)`, sub ?? "");
      const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM commish_audit ORDER BY id`,
      );
      return rows.map((r) => r.id);
    });
  }

  /** INSERT an audit row under a role + sub; resolves on success, rejects on an RLS / constraint violation. */
  async function insertAs(
    role: "anon" | "authenticated",
    sub: string | null,
    row: { leagueId: string; actionType: string; summary: string },
  ): Promise<void> {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      await tx.$queryRawUnsafe(`SELECT set_config('request.jwt.claim.sub', $1, true)`, sub ?? "");
      await tx.$executeRawUnsafe(
        `INSERT INTO commish_audit (id, league_id, action_type, summary) VALUES ($1, $2, $3, $4)`,
        randomUUID(),
        row.leagueId,
        row.actionType,
        row.summary,
      );
    });
  }

  it("a commissioner reads EVERY audit row in their league", async () => {
    expect(await visibleIds("authenticated", USER_COMM)).toEqual(["a_in_1", "a_in_2", "a_in_3"]);
  });

  it("PART A/confirm-1: a commissioner reads a FOREIGN-actor row AND a NULL-actor row in their league — the gate is 'commissioner in this league', NOT 'authored this row'", async () => {
    // The audit-log loader path is the owner-bypass read; this asserts the RLS backstop on the Data API
    // surface has the SAME shape: a_in_3 was authored by USER_MEMBER (a different user), a_in_1 has a NULL
    // actor, and the commissioner (USER_COMM) sees BOTH. The SELECT policy never references actor_user_id, so
    // "who wrote the row" cannot narrow (or widen) what a commissioner reads. This is the completeness half of
    // the Thread-1 audit-read confirm PART B relies on (every write's audit row is visible to the commissioner
    // regardless of which commissioner — or system actor — authored it).
    const ids = await visibleIds("authenticated", USER_COMM);
    expect(ids).toContain("a_in_3"); // foreign-actor row (authored by USER_MEMBER)
    expect(ids).toContain("a_in_1"); // null-actor row (system/unattributed)
  });

  it("a NON-commissioner league-mate reads ZERO — even the row they AUTHORED (commissioner-only, not a league reveal, not an author reveal)", async () => {
    // USER_MEMBER authored a_in_3, yet reads nothing: the gate is is_commissioner, not authorship — the
    // converse of confirm-1, closing the "author can read their own row" loophole.
    expect(await visibleIds("authenticated", USER_MEMBER)).toEqual([]);
  });

  it("a commissioner of a DIFFERENT league reads ZERO of this league's rows (league-scoped)", async () => {
    // The lg_out commissioner sees only lg_out's row, never lg_in's — proves the m.league_id join.
    expect(await visibleIds("authenticated", USER_OUT_COMM)).toEqual(["a_out_1"]);
  });

  it("anon reads zero", async () => {
    expect(await visibleIds("anon", null)).toEqual([]);
  });

  it("the Prisma OWNER (the server's only reader/writer) reads EVERY row — RLS bypass, defense-in-depth", async () => {
    const rows = await db.commishAudit.findMany({ select: { id: true }, orderBy: { id: "asc" } });
    expect(rows.map((r) => r.id)).toEqual(["a_in_1", "a_in_2", "a_in_3", "a_out_1"]);
  });

  it("the Prisma OWNER (service-role path — recordCommishAudit) can INSERT a row", async () => {
    await db.commishAudit.create({
      data: { leagueId: "lg_in", actionType: "rating_override", summary: "owner-insert" },
    });
    const n = await db.commishAudit.count({ where: { leagueId: "lg_in" } });
    expect(n).toBe(4); // a_in_1 + a_in_2 + a_in_3 + the owner insert
  });

  it("an authenticated COMMISSIONER CANNOT INSERT (no write policy → RLS default-deny)", async () => {
    await expect(
      insertAs("authenticated", USER_COMM, {
        leagueId: "lg_in",
        actionType: "penalty_applied",
        summary: "client-insert",
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("anon CANNOT INSERT (no write policy → RLS default-deny)", async () => {
    await expect(
      insertAs("anon", null, {
        leagueId: "lg_in",
        actionType: "penalty_applied",
        summary: "anon-insert",
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("a non-uuid JWT sub 22P02s — proves the cast is real, not a text-shim false green", async () => {
    await expect(visibleIds("authenticated", "not-a-uuid")).rejects.toThrow(
      /invalid input syntax for type uuid|22P02/i,
    );
  });
});
