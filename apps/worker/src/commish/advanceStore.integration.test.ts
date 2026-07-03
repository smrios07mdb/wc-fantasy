/**
 * Real-Postgres integration suite for the playoff cut-application adapter (`createPrismaPlayoffAdvanceStore`,
 * DECISIONS.md → Theme C). The memory double models the status flips faithfully (plain column updates, no
 * trigger), but this pins the REAL adapter's reads + writes against a live DB:
 *   1. `loadRoundContext` assembles the alive field, the round score (0 where no row), the cumulative
 *      tournament total (Σ across ALL the league's periods, via the period relation), and the frozen /
 *      cut_count / alreadyCut / uncutPriorRounds preconditions;
 *   2. `applyRoundCut` flips `alive → eliminated` with `eliminated_round` + `eliminated_at`, leaves the
 *      survivors `alive`, and is idempotent (a re-run is a no-op via the conditional claim);
 *   3. the final round flips the lone survivor `alive → champion`.
 *
 * GATED on PLAYOFF_PG_TEST_URL (a THROWAWAY DB — the suite wipes tables); skipped in normal `pnpm test`.
 * This thread adds NO migration, so the DB only needs the existing schema applied. Run it:
 *
 *   docker run -d --name wc-playoff-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=playoff_test -p 5468:5432 postgres:16
 *   export PLAYOFF_PG_TEST_URL="postgresql://postgres:postgres@127.0.0.1:5468/playoff_test"
 *   DATABASE_URL="$PLAYOFF_PG_TEST_URL" DIRECT_URL="$PLAYOFF_PG_TEST_URL" \
 *     pnpm --filter @app/db exec prisma migrate deploy
 *   pnpm exec vitest run apps/worker/src/commish/advanceStore.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@app/db";
import { createPrismaPlayoffAdvanceStore } from "@app/commish-core/advanceStore";

const TEST_URL = process.env.PLAYOFF_PG_TEST_URL;

const LEAGUE = "adv-league";
const MD1 = "adv-md1";
const R32 = "adv-r32";
const FINAL = "adv-final";
const FROZEN = new Date("2026-07-01T12:00:00.000Z");
const AT = new Date("2026-07-02T18:00:00.000Z");

describe.skipIf(!TEST_URL)("playoff advance adapter — real Postgres", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  // Wipe the FK chain this suite owns, child-first.
  beforeEach(async () => {
    await db.scoreManagerPeriod.deleteMany({});
    await db.playoffEntry.deleteMany({});
    await db.period.deleteMany({});
    await db.manager.deleteMany({});
    await db.league.deleteMany({});

    await db.league.create({
      data: { id: LEAGUE, name: "Advance Test League", status: "playoff" },
    });
    for (const i of [1, 2, 3, 4]) {
      await db.manager.create({
        data: { id: `m${i}`, leagueId: LEAGUE, displayName: `Team ${i}` },
      });
    }
    // A frozen group period — its scores feed the cumulative tournament total.
    await db.period.create({
      data: { id: MD1, leagueId: LEAGUE, kind: "group_md", label: "MD1", frozenAt: FROZEN },
    });
  });

  async function alive(managerId: string, seed: number) {
    await db.playoffEntry.create({ data: { leagueId: LEAGUE, managerId, seed, status: "alive" } });
  }
  async function score(periodId: string, managerId: string, points: number) {
    await db.scoreManagerPeriod.create({ data: { periodId, managerId, points } });
  }
  async function entry(managerId: string) {
    return db.playoffEntry.findUnique({
      where: { leagueId_managerId: { leagueId: LEAGUE, managerId } },
    });
  }

  it("loadRoundContext assembles the alive field, round scores, cumulative totals, and preconditions", async () => {
    await db.period.create({
      data: {
        id: R32,
        leagueId: LEAGUE,
        kind: "knockout_round",
        label: "R32",
        cutCount: 2,
        frozenAt: FROZEN,
      },
    });
    for (const i of [1, 2, 3, 4]) await alive(`m${i}`, i);
    // group scores
    await score(MD1, "m1", 50);
    await score(MD1, "m2", 40);
    await score(MD1, "m3", 30);
    // R32 scores (m4 has NO row → round score defaults to 0)
    await score(R32, "m1", 5);
    await score(R32, "m2", 9);
    await score(R32, "m3", 20);

    const store = createPrismaPlayoffAdvanceStore(db);
    const ctx = (await store.loadRoundContext(LEAGUE, "R32"))!;

    expect(ctx.round).toMatchObject({ label: "R32", cutCount: 2 });
    expect(ctx.round.frozenAt?.toISOString()).toBe(FROZEN.toISOString());
    expect(ctx.alreadyCut).toBe(false);
    expect(ctx.uncutPriorRounds).toEqual([]); // R32 is the first knockout round

    const by = Object.fromEntries(ctx.alive.map((a) => [a.managerId, a]));
    expect(by.m1).toEqual({ managerId: "m1", roundPoints: 5, cumulativeTotal: 55 });
    expect(by.m2).toEqual({ managerId: "m2", roundPoints: 9, cumulativeTotal: 49 });
    expect(by.m3).toEqual({ managerId: "m3", roundPoints: 20, cumulativeTotal: 50 });
    expect(by.m4).toEqual({ managerId: "m4", roundPoints: 0, cumulativeTotal: 0 }); // no scores at all
  });

  it("applyRoundCut flips alive → eliminated (round + timestamp), survivors stay alive, idempotent re-run", async () => {
    await db.period.create({
      data: {
        id: R32,
        leagueId: LEAGUE,
        kind: "knockout_round",
        label: "R32",
        cutCount: 2,
        frozenAt: FROZEN,
      },
    });
    for (const i of [1, 2, 3, 4]) await alive(`m${i}`, i);
    const store = createPrismaPlayoffAdvanceStore(db);

    expect(
      await store.applyRoundCut({
        leagueId: LEAGUE,
        roundLabel: "R32",
        eliminated: ["m1", "m2"],
        champion: null,
        at: AT,
      }),
    ).toBe("applied");

    const m1 = await entry("m1");
    expect(m1!.status).toBe("eliminated");
    expect(m1!.eliminatedRound).toBe("R32");
    expect(m1!.eliminatedAt?.toISOString()).toBe(AT.toISOString());
    expect((await entry("m2"))!.status).toBe("eliminated");
    expect((await entry("m3"))!.status).toBe("alive");
    expect((await entry("m4"))!.status).toBe("alive");

    // Idempotent: the conditional claim matches 0 alive → no-op.
    expect(
      await store.applyRoundCut({
        leagueId: LEAGUE,
        roundLabel: "R32",
        eliminated: ["m1", "m2"],
        champion: null,
        at: new Date(),
      }),
    ).toBe("already-cut");
    expect((await entry("m1"))!.eliminatedAt?.toISOString()).toBe(AT.toISOString()); // unchanged
  });

  it("applyRoundCut flips the lone survivor alive → champion on the final round", async () => {
    await db.period.create({
      data: {
        id: FINAL,
        leagueId: LEAGUE,
        kind: "knockout_round",
        label: "Final",
        cutCount: 1,
        frozenAt: FROZEN,
      },
    });
    await alive("m1", 1);
    await alive("m2", 2);
    const store = createPrismaPlayoffAdvanceStore(db);

    expect(
      await store.applyRoundCut({
        leagueId: LEAGUE,
        roundLabel: "Final",
        eliminated: ["m1"],
        champion: "m2",
        at: AT,
      }),
    ).toBe("applied");

    expect((await entry("m1"))!.status).toBe("eliminated");
    const champ = await entry("m2");
    expect(champ!.status).toBe("champion");
    expect(champ!.eliminatedRound).toBeNull(); // the champion is not eliminated
  });
});
