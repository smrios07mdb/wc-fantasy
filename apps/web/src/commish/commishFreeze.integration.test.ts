/**
 * Gated Postgres proof for the Thread-4 freeze/unfreeze surface — the handlers driving the REAL
 * Prisma store (`createCommishFreezeStore`) against a live database, plus the END-TO-END sweep
 * interaction the memory doubles cannot model. Pins:
 *
 *   • freeze stamps `period.frozen_at` + exactly ONE `commish_audit` row (`period_freeze`) — and the
 *     WORKER SWEEP (no `allowFrozen`) then SKIPS the period: its pending `manager_period` marker stays
 *     unprocessed (`processed_at` NULL) and no `score_manager_period` row is written;
 *   • unfreeze (`frozen_at` → NULL, ONE `period_unfreeze` audit row, `pendingDirty` surfaced) lets the
 *     very next plain sweep restate that pending marker — score row written, marker processed;
 *   • the commissioner-override path is UNAFFECTED: `recomputeManagerPeriod(..., {allowFrozen:true})`
 *     restates a frozen period exactly as before (Thread-2's sync rescore keeps working);
 *   • ATOMICITY: a failing audit insert (FK-violating leagueId) rolls the `frozen_at` stamp back —
 *     no unaudited freeze can exist;
 *   • RACE GUARD: the store's conditional update (`WHERE frozen_at IS NULL` / `IS NOT NULL`) returns
 *     null on a lost race — no write, NO audit row (the hourly cron stamping concurrently is benign).
 *
 * GATED on COMMISH_FREEZE_PG_TEST_URL — a THROWAWAY DB, DISTINCT from the other wipe-suite URLs
 * (COMMISH_REPAIR_PG_TEST_URL / COMMISH_WRITE_PG_TEST_URL / COMMISH_AUDIT_PG_TEST_URL /
 * FAAB_PG_TEST_URL / FAAB_CAP_PG_TEST_URL) so no two wipe-suites ever co-run. The SAFE guard
 * (DATABASE_URL === COMMISH_FREEZE_PG_TEST_URL) refuses any DB that is not the explicitly named
 * throwaway. Set up with `prisma migrate deploy`. To run:
 *
 *   docker run -d --name wc-commish-freeze-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=commish_freeze_test -p 55447:5432 postgres:16
 *   export COMMISH_FREEZE_PG_TEST_URL="postgresql://postgres:postgres@127.0.0.1:55447/commish_freeze_test"
 *   DATABASE_URL="$COMMISH_FREEZE_PG_TEST_URL" DIRECT_URL="$COMMISH_FREEZE_PG_TEST_URL" \
 *     pnpm --filter @app/db exec prisma migrate deploy
 *   DATABASE_URL="$COMMISH_FREEZE_PG_TEST_URL" \
 *     pnpm --filter @app/web exec vitest run src/commish/commishFreeze.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@app/db";
import type { SessionManagerOutcome } from "@app/auth";
import { sweep, recomputeManagerPeriod } from "@app/recompute";
import { createPrismaStore } from "@app/recompute/prisma";
import { handleFreeze, handleUnfreeze } from "./handleFreeze";
import { createCommishFreezeStore } from "./commishFreezeStore";

const TEST_URL = process.env.COMMISH_FREEZE_PG_TEST_URL;
const SAFE = !!TEST_URL && process.env.DATABASE_URL === TEST_URL;

const USER = "00000000-0000-0000-0000-0000000000c4";
const LG = "lg_freeze";
const COMMISH_MGR = "mgr_freeze_commish";
const MGR = "mgr_freeze_target";
const TEAM = "team_freeze";
const MD1 = "period_freeze_md1";

const OUTCOME: SessionManagerOutcome = {
  kind: "ok",
  manager: {
    id: COMMISH_MGR,
    userId: USER,
    email: "smrios07@gmail.com",
    isCommissioner: true,
    displayName: "Commish",
  },
  isCommissioner: true,
};

describe.skipIf(!SAFE)("Thread-4 freeze/unfreeze surface — real Postgres", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  beforeEach(async () => {
    await db.$executeRawUnsafe("TRUNCATE TABLE lineup_slot CASCADE");
    await db.commishAudit.deleteMany({});
    await db.scoreManagerPeriod.deleteMany({});
    await db.standing.deleteMany({});
    await db.recomputeDirty.deleteMany({});
    await db.rosterPlayer.deleteMany({});
    await db.fifaMatch.deleteMany({});
    await db.player.deleteMany({});
    await db.period.deleteMany({});
    await db.manager.deleteMany({});
    await db.appUser.deleteMany({});
    await db.fifaTeam.deleteMany({});
    await db.league.deleteMany({});

    await db.league.create({ data: { id: LG, name: "Freeze Test League", status: "group" } });
    await db.appUser.create({ data: { id: USER, email: "smrios07@gmail.com" } });
    await db.manager.create({
      data: {
        id: COMMISH_MGR,
        leagueId: LG,
        displayName: "Commish",
        userId: USER,
        isCommissioner: true,
      },
    });
    await db.manager.create({ data: { id: MGR, leagueId: LG, displayName: "Target" } });
    await db.fifaTeam.create({ data: { id: TEAM, balldontlieId: 9002, name: "Freeze FC" } });
    // MD1: closed, every fixture completed — the canonical freezable wave.
    await db.period.create({
      data: { id: MD1, leagueId: LG, kind: "group_md", label: "MD1", status: "closed" },
    });
    await db.fifaMatch.create({
      data: {
        id: "match_freeze_1",
        balldontlieId: 8801,
        homeTeamId: TEAM,
        awayTeamId: TEAM,
        kickoffAt: new Date("2026-06-15T18:00:00Z"),
        status: "completed",
        periodId: MD1,
      },
    });
  });

  function webDeps() {
    return {
      resolveManager: async () => OUTCOME,
      now: () => new Date(),
      store: createCommishFreezeStore(db),
    };
  }

  async function seedPendingMarker() {
    await db.recomputeDirty.create({
      data: { scope: "manager_period", managerId: MGR, periodId: MD1 },
    });
  }

  it("freeze stamps frozen_at + ONE audit row, and the plain worker sweep then SKIPS the period", async () => {
    await seedPendingMarker();

    const res = await handleFreeze(webDeps(), { periodId: MD1, reason: "early finalize" });
    expect(res.status).toBe(200);

    const period = await db.period.findUniqueOrThrow({ where: { id: MD1 } });
    expect(period.frozenAt).not.toBeNull();
    const audits = await db.commishAudit.findMany({});
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actionType: "period_freeze",
      leagueId: LG,
      actorUserId: USER,
      reversible: true,
    });

    // The worker's plain sweep (NO allowFrozen) must skip: marker unprocessed, no score row.
    const result = await sweep(createPrismaStore(db));
    expect(result.skippedFrozen).toBe(1);
    expect(result.managerPeriods).toBe(0);
    const marker = await db.recomputeDirty.findFirstOrThrow({
      where: { scope: "manager_period", managerId: MGR, periodId: MD1 },
    });
    expect(marker.processedAt).toBeNull();
    expect(await db.scoreManagerPeriod.count({ where: { managerId: MGR, periodId: MD1 } })).toBe(0);
  });

  it("unfreeze surfaces pendingDirty + ONE audit row, and the next plain sweep restates the marker", async () => {
    await db.period.update({ where: { id: MD1 }, data: { frozenAt: new Date() } });
    await seedPendingMarker();

    const res = await handleUnfreeze(webDeps(), { periodId: MD1, reason: "late correction" });
    expect(res.status).toBe(200);
    expect((res.body as { pendingDirty: number }).pendingDirty).toBe(1);

    const period = await db.period.findUniqueOrThrow({ where: { id: MD1 } });
    expect(period.frozenAt).toBeNull();
    const audits = await db.commishAudit.findMany({});
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actionType: "period_unfreeze", reversible: true });

    // The very next PLAIN sweep (no override) restates the pending marker.
    const result = await sweep(createPrismaStore(db));
    expect(result.skippedFrozen).toBe(0);
    expect(result.managerPeriods).toBe(1);
    const marker = await db.recomputeDirty.findFirstOrThrow({
      where: { scope: "manager_period", managerId: MGR, periodId: MD1 },
    });
    expect(marker.processedAt).not.toBeNull();
    expect(await db.scoreManagerPeriod.count({ where: { managerId: MGR, periodId: MD1 } })).toBe(1);
  });

  it("the commissioner-override path (allowFrozen) is UNAFFECTED by the new callers", async () => {
    await db.period.update({ where: { id: MD1 }, data: { frozenAt: new Date() } });
    const result = await recomputeManagerPeriod(createPrismaStore(db), MGR, MD1, {
      allowFrozen: true,
    });
    expect(result.skipped).toBe(false);
    expect(await db.scoreManagerPeriod.count({ where: { managerId: MGR, periodId: MD1 } })).toBe(1);
  });

  it("ATOMICITY: a failing audit insert rolls the frozen_at stamp back", async () => {
    const store = createCommishFreezeStore(db);
    await expect(
      store.freeze({
        periodId: MD1,
        now: new Date(),
        audit: {
          leagueId: "lg_does_not_exist", // FK violation on commish_audit.league_id
          actorUserId: USER,
          actionType: "period_freeze",
          summary: "will roll back",
          reason: "atomicity proof",
          targetRef: { periodId: MD1 },
          reversible: true,
        },
      }),
    ).rejects.toThrow();

    const period = await db.period.findUniqueOrThrow({ where: { id: MD1 } });
    expect(period.frozenAt).toBeNull(); // the stamp did NOT survive the failed audit
    expect(await db.commishAudit.count()).toBe(0);
  });

  it("RACE GUARD: freeze on an already-frozen row → null, no write, NO audit row (and unfreeze mirror)", async () => {
    const store = createCommishFreezeStore(db);
    const stamped = new Date("2026-07-01T00:00:00Z");
    await db.period.update({ where: { id: MD1 }, data: { frozenAt: stamped } });

    const audit = {
      leagueId: LG,
      actorUserId: USER,
      actionType: "period_freeze" as const,
      summary: "race",
      reason: "race",
      targetRef: { periodId: MD1 },
      reversible: true,
    };
    expect(await store.freeze({ periodId: MD1, now: new Date(), audit })).toBeNull();
    const period = await db.period.findUniqueOrThrow({ where: { id: MD1 } });
    expect(period.frozenAt?.toISOString()).toBe(stamped.toISOString()); // untouched

    await db.period.update({ where: { id: MD1 }, data: { frozenAt: null } });
    expect(
      await store.unfreeze({ periodId: MD1, audit: { ...audit, actionType: "period_unfreeze" } }),
    ).toBeNull();

    expect(await db.commishAudit.count()).toBe(0); // neither lost race wrote a ledger row
  });
});
