/**
 * Gated Postgres proof for the Thread-2 write STORE (`createCommishStatStore`) — the transactional
 * write+audit path on real Postgres. Complements the pure handler tests (spy store) and the pure engine
 * proofs by exercising the actual Prisma UPSERT/DELETE + the shared `recordCommishAudit` seam INSIDE one
 * `$transaction`: exactly one `commish_audit` row lands per write, the manual row carries `dirty=true` +
 * reason + entered_by, and the rating set/clear round-trips.
 *
 * GATED on COMMISH_WRITE_PG_TEST_URL — a THROWAWAY DB, DISTINCT from COMMISH_AUDIT_PG_TEST_URL so the two
 * commish wipe-suites never co-run (mirrors the FAAB_CAP_PG_TEST_URL / FAAB_PG_TEST_URL split). The SAFE guard
 * (DATABASE_URL === COMMISH_WRITE_PG_TEST_URL) refuses any DB that is not the explicitly named throwaway. Set
 * up with `prisma migrate deploy` (NOT `db push`). To run:
 *
 *   docker run -d --name wc-commish-write-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=commish_write_test -p 55445:5432 postgres:16
 *   export COMMISH_WRITE_PG_TEST_URL="postgresql://postgres:postgres@127.0.0.1:55445/commish_write_test"
 *   DATABASE_URL="$COMMISH_WRITE_PG_TEST_URL" DIRECT_URL="$COMMISH_WRITE_PG_TEST_URL" \
 *     pnpm --filter @app/db exec prisma migrate deploy
 *   DATABASE_URL="$COMMISH_WRITE_PG_TEST_URL" \
 *     pnpm --filter @app/web exec vitest run src/commish/commishStatWrite.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@app/db";
import { createCommishStatStore } from "./commishStatStore";
import type { RecordCommishAuditInput } from "./recordCommishAudit";

const TEST_URL = process.env.COMMISH_WRITE_PG_TEST_URL;
const SAFE = !!TEST_URL && process.env.DATABASE_URL === TEST_URL;

const USER = "00000000-0000-0000-0000-0000000000a1";
const LG = "lg_w";
const MGR = "mgr_w";
const TA = "team_a";
const TB = "team_b";
const P1 = "player_1";
const M1 = "match_1";

function auditFor(overrides: Partial<RecordCommishAuditInput> = {}): RecordCommishAuditInput {
  return {
    leagueId: LG,
    actorUserId: USER,
    actionType: "penalty_applied",
    summary: "test",
    reason: "test reason",
    targetRef: { matchId: M1, playerId: P1 },
    reversible: true,
    ...overrides,
  };
}

describe.skipIf(!SAFE)("commish stat write store — real Postgres (write + audit atomic)", () => {
  let db: PrismaClient;
  let store: ReturnType<typeof createCommishStatStore>;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
    store = createCommishStatStore(db);
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  beforeEach(async () => {
    await db.manualStatPlayerMatch.deleteMany({});
    await db.ratingPlayerMatch.deleteMany({});
    await db.commishAudit.deleteMany({});
    await db.player.deleteMany({});
    await db.fifaMatch.deleteMany({});
    await db.manager.deleteMany({});
    await db.league.deleteMany({});
    await db.appUser.deleteMany({});
    await db.fifaTeam.deleteMany({});

    await db.appUser.create({ data: { id: USER, email: "w-comm@example.com" } });
    await db.league.create({ data: { id: LG, name: "lg-w" } });
    await db.manager.create({
      data: { id: MGR, leagueId: LG, userId: USER, displayName: "comm", isCommissioner: true },
    });
    await db.fifaTeam.createMany({
      data: [
        { id: TA, name: "Team A" },
        { id: TB, name: "Team B" },
      ],
    });
    await db.player.create({
      data: { id: P1, balldontlieId: 5001, displayName: "Striker", position: "FWD", teamId: TA },
    });
    await db.fifaMatch.create({
      data: {
        id: M1,
        balldontlieId: 6001,
        kickoffAt: new Date("2026-06-20T18:00:00Z"),
        homeTeamId: TA,
        awayTeamId: TB,
      },
    });
  });

  it("applyPenalty writes the manual row (dirty + reason + entered_by) AND exactly one audit row, atomically", async () => {
    const res = await store.applyPenalty({
      write: {
        matchId: M1,
        playerId: P1,
        penaltyWon: 1,
        penaltyCommitted: 0,
        reason: "VAR pen the feed missed",
        enteredByUserId: USER,
      },
      audit: auditFor({ summary: "Penalty entry: 1 won / 0 committed", delta: "+2 pts" }),
    });
    expect(res.auditId).toBeTruthy();

    const manual = await db.manualStatPlayerMatch.findUnique({
      where: { matchId_playerId: { matchId: M1, playerId: P1 } },
    });
    expect(manual).toMatchObject({
      penaltyWon: 1,
      penaltyCommitted: 0,
      reason: "VAR pen the feed missed",
      enteredByUserId: USER,
      dirty: true,
    });

    const audits = await db.commishAudit.findMany({ where: { leagueId: LG } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actionType: "penalty_applied",
      reason: "test reason",
      reversible: true,
      actorUserId: USER,
    });
    expect(audits[0]!.targetRef).toEqual({ matchId: M1, playerId: P1 });
  });

  it("penalty Clear (0/0) is an idempotent UPSERT — one manual row updated, a SECOND append-only audit row", async () => {
    const write = (won: number, committed: number) => ({
      matchId: M1,
      playerId: P1,
      penaltyWon: won,
      penaltyCommitted: committed,
      reason: "r",
      enteredByUserId: USER,
    });
    await store.applyPenalty({ write: write(1, 0), audit: auditFor() });
    await store.applyPenalty({
      write: write(0, 0),
      audit: auditFor({ summary: "Penalty entry cleared" }),
    });

    const manuals = await db.manualStatPlayerMatch.findMany({
      where: { matchId: M1, playerId: P1 },
    });
    expect(manuals).toHaveLength(1); // absolute upsert — the same (match, player) row, now 0/0
    expect(manuals[0]).toMatchObject({ penaltyWon: 0, penaltyCommitted: 0, dirty: true });
    expect(await db.commishAudit.count({ where: { leagueId: LG } })).toBe(2); // append-only ledger
  });

  it("applyRating set writes source='manual' (dirty), clear DELETEs it — each with its own audit row", async () => {
    await store.applyRating({
      write: { kind: "set", matchId: M1, playerId: P1, rating: 7.5 },
      audit: auditFor({ actionType: "rating_override", summary: "Rating override → 7.5" }),
    });
    const set = await db.ratingPlayerMatch.findUnique({
      where: { matchId_playerId_source: { matchId: M1, playerId: P1, source: "manual" } },
    });
    expect(set).toMatchObject({ rating: 7.5, dirty: true });

    await store.applyRating({
      write: { kind: "clear", matchId: M1, playerId: P1 },
      audit: auditFor({ actionType: "rating_override", summary: "Rating override cleared" }),
    });
    const afterClear = await db.ratingPlayerMatch.findMany({
      where: { matchId: M1, playerId: P1, source: "manual" },
    });
    expect(afterClear).toHaveLength(0); // clear = delete the manual override row

    const overrides = await db.commishAudit.count({
      where: { leagueId: LG, actionType: "rating_override" },
    });
    expect(overrides).toBe(2); // one per write (set + clear)
  });
});
