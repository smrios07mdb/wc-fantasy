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
import type { SessionManagerOutcome } from "@app/auth";
import { createCommishStatStore, createCommishRescore } from "./commishStatStore";
import { handleCommishPenalty } from "./handleStatCorrection";
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

// A real (all-zero except a 90' appearance) feed stat line so the participant gate
// (`playerAppearedInMatch` → `statHasData`) passes and the re-score writes a `score_player_match`
// row. Mirrors the pure `commishStatScoring.test.ts` baseline, so the appearance-only score is stable
// and a delta between two re-scores that differ ONLY in the manual penalty row isolates the +2 term.
function zeroStatLine() {
  return {
    minutesPlayed: 90,
    goals: 0,
    assists: 0,
    keyPasses: 0,
    dribblesAttempted: 0,
    dribblesCompleted: 0,
    duelsWon: 0,
    duelsLost: 0,
    passesTotal: 0,
    passesAccurate: 0,
    longBallsTotal: 0,
    longBallsAccurate: 0,
    wasFouled: 0,
    clearances: 0,
    interceptions: 0,
    tacklesWon: 0,
    blockedShots: 0,
    saves: 0,
    savesInsideBox: 0,
    punches: 0,
    highClaims: 0,
    possessionLost: 0,
    shotsOnTarget: 0,
    ballRecoveries: 0,
    bigChancesCreated: 0,
    crossesAccurate: 0,
    touches: 0,
  };
}

function penaltyWrite(won: number, committed: number) {
  return {
    matchId: M1,
    playerId: P1,
    penaltyWon: won,
    penaltyCommitted: committed,
    reason: "VAR pen",
    enteredByUserId: USER,
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

  it("idempotent SET — re-submitting penalty_won=1 re-scores to the SAME +2 (never +4): one manual row, one audit per write", async () => {
    // The end-to-end proof that the ABSOLUTE upsert (penalty_won is SET to 1, never incremented) means a
    // re-run of the identical write does not accumulate: the engine keeps reading `penalty_won = 1` off the
    // single manual row, so the re-score lands on the same score. Exercises the REAL sync trigger
    // (`createCommishRescore` → `recomputePlayerMatch`) on Postgres, reading the persisted `score_player_match`.
    const rescore = createCommishRescore(db);
    // Feed footprint → the participant gate passes and each re-score persists a score row.
    await db.statPlayerMatch.create({ data: { matchId: M1, playerId: P1, ...zeroStatLine() } });

    const scoreNow = async () =>
      (await db.scorePlayerMatch.findUnique({
        where: { matchId_playerId: { matchId: M1, playerId: P1 } },
      }))!.points;

    // Baseline: 90' appearance only, no manual penalty row yet.
    expect((await rescore(M1, P1)).scored).toBe(true);
    const baseline = await scoreNow();

    // First SET: penalty_won = 1 → +2 over baseline.
    await store.applyPenalty({ write: penaltyWrite(1, 0), audit: auditFor() });
    expect((await rescore(M1, P1)).scored).toBe(true);
    const afterFirst = await scoreNow();
    expect(afterFirst - baseline).toBe(2);

    // Re-submit the IDENTICAL penalty_won = 1. Absolute upsert ⇒ still +2 over baseline, NOT +4.
    await store.applyPenalty({ write: penaltyWrite(1, 0), audit: auditFor() });
    expect((await rescore(M1, P1)).scored).toBe(true);
    const afterSecond = await scoreNow();
    expect(afterSecond - baseline).toBe(2);
    expect(afterSecond).toBe(afterFirst); // idempotent: the second re-score is a no-op on the total

    // Exactly ONE manual row (upsert keyed by (match, player)), penalty_won latched at 1 — never doubled.
    const manuals = await db.manualStatPlayerMatch.findMany({
      where: { matchId: M1, playerId: P1 },
    });
    expect(manuals).toHaveLength(1);
    expect(manuals[0]).toMatchObject({ penaltyWon: 1, penaltyCommitted: 0 });

    // Append-only ledger: exactly one audit row per write (2 writes → 2). No score-driven double-count.
    expect(await db.commishAudit.count({ where: { leagueId: LG } })).toBe(2);
  });

  it("frozen correction + re-score THROWS after commit → row + audit DURABLE, response is saved-but-restate-pending (not a 500)", async () => {
    // The transient-throw gap: the write + `commish_audit` row commit in one `$transaction`, THEN the sync
    // frozen-override re-score runs. If it throws, the write must stay durable and the handler must return a
    // distinguishable saved-but-restate-pending payload — never a bare 500 that hides the persisted correction.
    // We drive the REAL Prisma store on Postgres and inject a throwing `rescore` to force the post-commit failure.
    const FROZEN_PERIOD = "period_frozen_w";
    await db.period.create({
      data: {
        id: FROZEN_PERIOD,
        leagueId: LG,
        kind: "group_md",
        label: "MD1",
        frozenAt: new Date("2026-06-21T00:00:00Z"),
      },
    });
    await db.fifaMatch.update({ where: { id: M1 }, data: { periodId: FROZEN_PERIOD } });

    const commish: SessionManagerOutcome = {
      kind: "ok",
      manager: {
        id: MGR,
        userId: USER,
        email: "w-comm@example.com",
        isCommissioner: true,
        displayName: "comm",
      },
      isCommissioner: true,
    };
    const throwingRescore = async (): Promise<{ scored: boolean }> => {
      throw new Error("recomputeManagerPeriod blew up past the freeze gate");
    };

    const res = await handleCommishPenalty(
      { resolveManager: async () => commish, store, rescore: throwingRescore },
      {
        matchId: M1,
        playerId: P1,
        penaltyWon: 1,
        penaltyCommitted: 0,
        reason: "VAR pen, feed missed it",
      },
    );

    // Distinguishable, actionable payload — NOT a generic 500.
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      frozenOverride: true,
      scored: false,
      restatePending: true,
      warning: "restate_pending",
    });
    expect((res.body as { message: string }).message).toMatch(/re-submit/i);

    // The write + audit are DURABLE despite the post-commit re-score throw.
    const manual = await db.manualStatPlayerMatch.findUnique({
      where: { matchId_playerId: { matchId: M1, playerId: P1 } },
    });
    expect(manual).toMatchObject({ penaltyWon: 1, penaltyCommitted: 0, dirty: true });
    const audits = await db.commishAudit.findMany({ where: { leagueId: LG } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actionType: "penalty_applied" });
    expect(audits[0]!.detail?.toLowerCase()).toContain("frozen"); // override note recorded on the durable audit
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
