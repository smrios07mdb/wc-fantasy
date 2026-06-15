/**
 * Real-Postgres integration suite for the playoff READ loader (`loadPlayoffs`, ARCHITECTURE.md §21). The
 * pure `buildPlayoffsView` suite pins the assembly logic; this pins the Prisma EDGE end-to-end across a
 * representative MIXED ladder — a `past` round (cut), one `live` round (provisional cut via the same
 * selector the apply path uses), and a `future` skeleton — including the seeds' group standings, the
 * cumulative tiebreak (Σ over ALL periods), and the threaded `loadLineup` / `loadWaivers` reads.
 *
 * GATED on PLAYOFF_PG_TEST_URL **and** DATABASE_URL pointing at the SAME throwaway DB (the loader reads via
 * the `@app/db` singleton, which binds DATABASE_URL — so the seed and the read must hit one DB). Skipped in
 * normal `pnpm test`. This thread adds NO migration, so the DB only needs the existing schema applied. Run:
 *
 *   docker run -d --name wc-playoff-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=playoff_test -p 5469:5432 postgres:16
 *   export PLAYOFF_PG_TEST_URL="postgresql://postgres:postgres@127.0.0.1:5469/playoff_test"
 *   DATABASE_URL="$PLAYOFF_PG_TEST_URL" DIRECT_URL="$PLAYOFF_PG_TEST_URL" \
 *     pnpm --filter @app/db exec prisma migrate deploy
 *   DATABASE_URL="$PLAYOFF_PG_TEST_URL" DIRECT_URL="$PLAYOFF_PG_TEST_URL" \
 *     pnpm exec vitest run apps/web/app/playoffs/loadPlayoffs.integration.test.ts
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@app/db";
import { loadPlayoffs } from "./loadPlayoffs";

const TEST_URL = process.env.PLAYOFF_PG_TEST_URL;
// Safety latch: only run when the singleton the loader reads is bound to the SAME throwaway DB we seed.
const SAFE = !!TEST_URL && process.env.DATABASE_URL === TEST_URL;

const LEAGUE = "po-load-league";

describe.skipIf(!SAFE)("loadPlayoffs — real Postgres", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Wipe the FK chain this suite (and the threaded loaders) touch, child-first.
    await prisma.faabBid.deleteMany({});
    await prisma.rosterPlayer.deleteMany({});
    await prisma.lineupSlot.deleteMany({});
    await prisma.scorePlayerMatch.deleteMany({});
    await prisma.scoreManagerPeriod.deleteMany({});
    await prisma.fifaMatch.deleteMany({});
    await prisma.playoffEntry.deleteMany({});
    await prisma.period.deleteMany({});
    await prisma.manager.deleteMany({});
    await prisma.league.deleteMany({});

    await prisma.league.create({
      data: { id: LEAGUE, name: "Playoff Load League", status: "playoff" },
    });
    for (const i of [1, 2, 3, 4, 5]) {
      await prisma.manager.create({
        data: { id: `m${i}`, leagueId: LEAGUE, displayName: `Team ${i}` },
      });
    }

    // One group period (final group standings → seeds' gW/gL/gPts).
    await prisma.period.create({
      data: { id: "MD1", leagueId: LEAGUE, kind: "group_md", label: "MD1" },
    });
    // The knockout ladder: R32 cut 2 (PAST), R16 cut 1 (LIVE), QF cut 1 (FUTURE).
    await prisma.period.create({
      data: { id: "R32", leagueId: LEAGUE, kind: "knockout_round", label: "R32", cutCount: 2 },
    });
    await prisma.period.create({
      data: { id: "R16", leagueId: LEAGUE, kind: "knockout_round", label: "R16", cutCount: 1 },
    });
    await prisma.period.create({
      data: { id: "QF", leagueId: LEAGUE, kind: "knockout_round", label: "QF", cutCount: 1 },
    });

    // A live-round fixture so the threaded loadWaivers has a real kickoff to build its batch window.
    await prisma.fifaMatch.create({
      data: {
        id: "match-r16",
        balldontlieId: 990001,
        kickoffAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        status: "scheduled",
        periodId: "R16",
      },
    });

    // Seeded field: m1..m3 alive; m4,m5 cut in R32.
    const entries: Array<[string, number, "alive" | "eliminated", string | null]> = [
      ["m1", 1, "alive", null],
      ["m2", 2, "alive", null],
      ["m3", 3, "alive", null],
      ["m4", 4, "eliminated", "R32"],
      ["m5", 5, "eliminated", "R32"],
    ];
    for (const [managerId, seed, status, eliminatedRound] of entries) {
      await prisma.playoffEntry.create({
        data: { leagueId: LEAGUE, managerId, seed, status, eliminatedRound },
      });
    }

    const score = async (periodId: string, scores: Record<string, number>) => {
      for (const [managerId, points] of Object.entries(scores)) {
        await prisma.scoreManagerPeriod.create({ data: { periodId, managerId, points } });
      }
    };
    // Group standings: m1>m2>m3>m4>m5.
    await score("MD1", { m1: 50, m2: 40, m3: 30, m4: 20, m5: 10 });
    // R32 (frozen, past): m4,m5 lowest → cut (consistent with the eliminated_round marks).
    await score("R32", { m1: 60, m2: 55, m3: 50, m4: 20, m5: 10 });
    // R16 (live, in-progress): m2 currently lowest → provisional zone.
    await score("R16", { m1: 30, m2: 10, m3: 20 });
  });

  it("assembles a mixed past/live/future ladder with the §21 fields", async () => {
    const view = (await loadPlayoffs("m1"))!;
    expect(view).not.toBeNull();

    expect(view.totalRounds).toBe(3);
    expect(view.currentRoundIdx).toBe(1); // R16 is live
    expect(view.rounds.map((r) => r.status)).toEqual(["past", "live", "future"]);
    expect(view.aliveNow).toBe(3);
    expect(view.survivesNow).toBe(2);
    expect(view.champion).toBeNull();
    expect(view.complete).toBe(false);
  });

  it("seeds carry the playoff seed + final group standings (gW/gL/gPts)", async () => {
    const view = (await loadPlayoffs("m1"))!;
    expect(view.seeds).toEqual([
      { managerId: "m1", seed: 1, gW: 4, gL: 0, gPts: 50 },
      { managerId: "m2", seed: 2, gW: 3, gL: 1, gPts: 40 },
      { managerId: "m3", seed: 3, gW: 2, gL: 2, gPts: 30 },
      { managerId: "m4", seed: 4, gW: 1, gL: 3, gPts: 20 },
      { managerId: "m5", seed: 5, gW: 0, gL: 4, gPts: 10 },
    ]);
    expect(view.seedOf).toEqual({ m1: 1, m2: 2, m3: 3, m4: 4, m5: 5 });
  });

  it("the PAST round reads its eliminated set straight from playoff_entry", async () => {
    const view = (await loadPlayoffs("m1"))!;
    const r32 = view.rounds[0]!;
    expect(r32).toMatchObject({ status: "past", fieldCount: 5, cutCount: 2, survives: 3 });
    expect(r32.ranked!.map((r) => r.managerId)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
    expect(new Set(r32.eliminatedIds!)).toEqual(new Set(["m4", "m5"]));
    expect(new Set(r32.survivors!)).toEqual(new Set(["m1", "m2", "m3"]));
    const stateOf = Object.fromEntries(r32.ranked!.map((r) => [r.managerId, r.state]));
    expect(stateOf).toEqual({
      m1: "safe",
      m2: "safe",
      m3: "safe",
      m4: "eliminated",
      m5: "eliminated",
    });
  });

  it("the LIVE round's provisional zone comes from the in-progress scores (same selector as the apply)", async () => {
    const view = (await loadPlayoffs("m1"))!;
    const r16 = view.rounds[1]!;
    expect(r16).toMatchObject({ status: "live", fieldCount: 3, cutCount: 1, survives: 2 });
    // m2 (10) is the provisional cut; m1 (30) > m3 (20) > m2 (10).
    expect(r16.ranked!.map((r) => r.managerId)).toEqual(["m1", "m3", "m2"]);
    expect(new Set(r16.eliminatedIds!)).toEqual(new Set(["m2"]));
    expect(new Set(r16.survivors!)).toEqual(new Set(["m1", "m3"]));
    const stateOf = Object.fromEntries(r16.ranked!.map((r) => [r.managerId, r.state]));
    expect(stateOf).toEqual({ m1: "safe", m3: "safe", m2: "zone" });
  });

  it("the FUTURE round is a skeleton with threaded field/cut counts", async () => {
    const view = (await loadPlayoffs("m1"))!;
    const qf = view.rounds[2]!;
    expect(qf).toMatchObject({
      status: "future",
      fieldCount: 2, // R16 survives 3 − 1
      cutCount: 1,
      survives: 1,
      ranked: null,
      survivors: null,
      eliminatedIds: null,
    });
  });

  it("me = the viewer's live-round row; threads the reused lineup + FAAB reads", async () => {
    const view = (await loadPlayoffs("m1"))!;
    expect(view.me).toMatchObject({ managerId: "m1", rank: 1, points: 30, state: "safe" });
    // Threaded reads pass through verbatim: loadLineup → the viewer's SetLineupState (empty squad here,
    // since none is seeded); loadWaivers → the FAAB reinforcement surface with the reset-$100 budget.
    expect(view.reducedLineup).toMatchObject({ sessionManagerId: "m1", squad: [] });
    expect(view.reinforcement).not.toBeNull();
    expect(view.reinforcement!.faabBudget).toBe(100); // the reset-$100 default
  });

  it("returns null when the viewer is not a manager", async () => {
    expect(await loadPlayoffs("nobody")).toBeNull();
  });
});
