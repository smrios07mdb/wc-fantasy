import { describe, it, expect } from "vitest";
import {
  MemoryPlayoffAdvanceStore,
  type MemoryAdvanceSeed,
  type ApplyRoundCut,
} from "@app/commish-core/advanceStore";

/**
 * The in-memory {@link MemoryPlayoffAdvanceStore} is the double the orchestrator tests run against, so we
 * pin the semantics they rely on: the READ assembly (alive field + round scores defaulting to 0 +
 * cumulative + the alreadyCut / uncutPriorRounds / frozen preconditions) and the WRITE (the conditional
 * `alive → eliminated` claim, the champion flip, and the idempotent re-run). The production Prisma adapter
 * mirrors these and is pinned end-to-end by `advanceStore.integration.test.ts` (gated real Postgres).
 */
const AT = new Date("2026-07-01T12:00:00Z");

function seed(over: Partial<MemoryAdvanceSeed> = {}): MemoryAdvanceSeed {
  return {
    rounds: [{ label: "R32", cutCount: 2, frozenAt: AT }],
    entries: [{ managerId: "m1" }, { managerId: "m2" }, { managerId: "m3" }, { managerId: "m4" }],
    roundScores: { R32: { m1: 5, m2: 9, m3: 20, m4: 30 } },
    cumulativeTotals: { m1: 100, m2: 90, m3: 200, m4: 300 },
    rosters: { m1: ["p1a", "p1b"], m2: ["p2a"], m3: ["p3a"], m4: ["p4a"] },
    ...over,
  };
}

const apply = (over: Partial<ApplyRoundCut>): ApplyRoundCut => ({
  leagueId: "L1",
  roundLabel: "R32",
  roundPeriodId: "p-R32",
  eliminated: ["m1", "m2"],
  champion: null,
  at: AT,
  ...over,
});

describe("MemoryPlayoffAdvanceStore.loadRoundContext", () => {
  it("returns null for a round that has no period", async () => {
    const s = new MemoryPlayoffAdvanceStore(seed());
    expect(await s.loadRoundContext("L1", "QF")).toBeNull();
  });

  it("assembles the alive field with round scores, cumulative totals, and the cut_count/frozen view", async () => {
    const s = new MemoryPlayoffAdvanceStore(seed());
    const ctx = (await s.loadRoundContext("L1", "R32"))!;
    expect(ctx.round).toMatchObject({ label: "R32", cutCount: 2, frozenAt: AT });
    expect(ctx.alreadyCut).toBe(false);
    expect(ctx.uncutPriorRounds).toEqual([]); // R32 is first — no priors
    expect(ctx.alive).toEqual([
      { managerId: "m1", roundPoints: 5, cumulativeTotal: 100 },
      { managerId: "m2", roundPoints: 9, cumulativeTotal: 90 },
      { managerId: "m3", roundPoints: 20, cumulativeTotal: 200 },
      { managerId: "m4", roundPoints: 30, cumulativeTotal: 300 },
    ]);
  });

  it("defaults a missing round score to 0 and excludes eliminated managers from the field", async () => {
    const s = new MemoryPlayoffAdvanceStore(
      seed({
        entries: [
          { managerId: "m1" },
          { managerId: "m2", status: "eliminated", eliminatedRound: "R32" },
        ],
        roundScores: { R32: { m1: 7 } }, // m2 has no score row anyway
      }),
    );
    const ctx = (await s.loadRoundContext("L1", "R32"))!;
    expect(ctx.alive).toEqual([{ managerId: "m1", roundPoints: 7, cumulativeTotal: 100 }]);
    expect(ctx.alreadyCut).toBe(true); // an entry is stamped eliminated_round == R32
  });

  it("reports earlier knockout rounds that are not yet cut (the ordering guard)", async () => {
    const s = new MemoryPlayoffAdvanceStore(
      seed({
        rounds: [{ label: "QF", cutCount: 1, frozenAt: AT }],
      }),
    );
    const ctx = (await s.loadRoundContext("L1", "QF"))!;
    expect(ctx.uncutPriorRounds).toEqual(["R32", "R16"]); // neither prior round cut
  });
});

describe("MemoryPlayoffAdvanceStore.loadActiveRosters", () => {
  it("returns each named manager's active roster (id + name), empty for an unknown manager", async () => {
    const s = new MemoryPlayoffAdvanceStore(seed());
    const rosters = await s.loadActiveRosters("L1", ["m1", "m3", "ghost"]);
    expect(rosters.m1).toEqual([
      { playerId: "p1a", name: "p1a" },
      { playerId: "p1b", name: "p1b" },
    ]);
    expect(rosters.m3).toEqual([{ playerId: "p3a", name: "p3a" }]);
    expect(rosters.ghost).toEqual([]);
  });
});

describe("MemoryPlayoffAdvanceStore.applyRoundCut", () => {
  it("flips the eliminated managers alive → eliminated with the round label + timestamp", async () => {
    const s = new MemoryPlayoffAdvanceStore(seed());
    expect(await s.applyRoundCut(apply({}))).toMatchObject({ outcome: "applied" });
    expect(s.entries.get("m1")).toMatchObject({
      status: "eliminated",
      eliminatedRound: "R32",
      eliminatedAt: AT,
    });
    expect(s.entries.get("m2")!.status).toBe("eliminated");
    expect(s.entries.get("m3")!.status).toBe("alive"); // survivor untouched
    expect(s.applyCount).toBe(1);
  });

  it("releases each cut manager's ENTIRE roster (returns the ids, clears them); survivors untouched", async () => {
    const s = new MemoryPlayoffAdvanceStore(seed());
    const out = await s.applyRoundCut(apply({}));
    expect(out).toEqual({ outcome: "applied", released: { m1: ["p1a", "p1b"], m2: ["p2a"] } });
    // The cut managers' rosters are shed to the wire; the survivors' rosters are untouched.
    expect(s.rosters.m1).toEqual([]);
    expect(s.rosters.m2).toEqual([]);
    expect(s.rosters.m3).toEqual(["p3a"]);
    expect(s.rosters.m4).toEqual(["p4a"]);
  });

  it("flips the lone survivor to champion when one is passed (champion not released)", async () => {
    const s = new MemoryPlayoffAdvanceStore(
      seed({
        rounds: [{ label: "Final", cutCount: 1, frozenAt: AT }],
        entries: [{ managerId: "m1" }, { managerId: "m2" }],
      }),
    );
    const out = await s.applyRoundCut(
      apply({ roundLabel: "Final", eliminated: ["m1"], champion: "m2" }),
    );
    expect(out).toEqual({ outcome: "applied", released: { m1: ["p1a", "p1b"] } });
    expect(s.entries.get("m1")!.status).toBe("eliminated");
    expect(s.entries.get("m2")!.status).toBe("champion");
    expect(s.rosters.m2).toEqual(["p2a"]); // the champion keeps their roster
  });

  it("is idempotent — a re-run of an already-cut round is a no-op (releases nothing)", async () => {
    const s = new MemoryPlayoffAdvanceStore(seed());
    await s.applyRoundCut(apply({}));
    expect(await s.applyRoundCut(apply({}))).toEqual({ outcome: "already-cut" });
    expect(s.applyCount).toBe(1); // not applied a second time
  });
});
