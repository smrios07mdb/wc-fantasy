import { describe, it, expect } from "vitest";
import { selectGuillotineCuts } from "./guillotine";
import type { PeriodScores } from "./standing";
import {
  buildPlayoffsView,
  type BuildPlayoffsViewInput,
  type PlayoffEntryInput,
  type PlayoffRoundInput,
} from "./playoffsView";

// ── test builders ────────────────────────────────────────────────────────────────────────
const ps = (periodId: string, scores: Record<string, number>): PeriodScores => ({
  periodId,
  scores: Object.entries(scores).map(([managerId, points]) => ({ managerId, points })),
});
const totals = (rows: Record<string, number>): ReadonlyMap<string, number> =>
  new Map(Object.entries(rows));

const entry = (
  managerId: string,
  seed: number,
  status: PlayoffEntryInput["status"] = "alive",
  eliminatedRound: string | null = null,
): PlayoffEntryInput => ({ managerId, seed, status, eliminatedRound });

const round = (label: string, cutCount: number | null): PlayoffRoundInput => ({ label, cutCount });

/** A baseline input with every optional slice empty — individual tests override what they exercise. */
const base = (over: Partial<BuildPlayoffsViewInput> = {}): BuildPlayoffsViewInput => ({
  viewerManagerId: "me",
  rounds: [],
  entries: [],
  roundScores: {},
  cumulativeTotals: new Map(),
  groupPeriods: [],
  ...over,
});

// ── seeds (from final group standings + playoff_entry.seed) ───────────────────────────────
describe("buildPlayoffsView — seeds + seedOf", () => {
  it("joins gW/gL/gPts from computeStandings(groupPeriods) onto each playoff_entry, ordered by seed", () => {
    const view = buildPlayoffsView(
      base({
        // One group period: A>B>C → A 2-0/30, B 1-1/20, C 0-2/10.
        groupPeriods: [ps("g1", { A: 30, B: 20, C: 10 })],
        entries: [entry("C", 3), entry("A", 1), entry("B", 2)],
      }),
    );
    expect(view.seeds).toEqual([
      { managerId: "A", seed: 1, gW: 2, gL: 0, gPts: 30 },
      { managerId: "B", seed: 2, gW: 1, gL: 1, gPts: 20 },
      { managerId: "C", seed: 3, gW: 0, gL: 2, gPts: 10 },
    ]);
    expect(view.seedOf).toEqual({ A: 1, B: 2, C: 3 });
  });

  it("defaults gW/gL/gPts to 0 for a participant absent from the group standings", () => {
    const view = buildPlayoffsView(base({ groupPeriods: [], entries: [entry("A", 1)] }));
    expect(view.seeds).toEqual([{ managerId: "A", seed: 1, gW: 0, gL: 0, gPts: 0 }]);
  });
});

// ── past round — states from playoff_entry (authoritative), not rank ──────────────────────
describe("buildPlayoffsView — past round classification", () => {
  // Ladder R32 (cut 2) → Final (cut 1). R32 already cut: A,B eliminated_round=R32.
  const input = base({
    rounds: [round("R32", 2), round("Final", 1)],
    entries: [
      entry("A", 4, "eliminated", "R32"),
      entry("B", 3, "eliminated", "R32"),
      entry("C", 2, "alive"),
      entry("me", 1, "alive"),
    ],
    roundScores: { R32: { A: 10, B: 20, C: 40, me: 30 }, Final: { C: 5, me: 9 } },
    cumulativeTotals: totals({ A: 10, B: 20, C: 45, me: 39 }),
  });

  it("R32 is past: entrants = all 4, eliminatedIds from playoff_entry, ranked by round score desc", () => {
    const view = buildPlayoffsView(input);
    const r32 = view.rounds[0]!;
    expect(r32.status).toBe("past");
    expect(r32.fieldCount).toBe(4);
    expect(r32.cutCount).toBe(2);
    expect(r32.survives).toBe(2);
    // ranked: C(40) > me(30) > B(20) > A(10)
    expect(r32.ranked!.map((r) => r.managerId)).toEqual(["C", "me", "B", "A"]);
    expect(r32.ranked!.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    // states: A,B eliminated (from playoff_entry); C,me safe
    const stateOf = Object.fromEntries(r32.ranked!.map((r) => [r.managerId, r.state]));
    expect(stateOf).toEqual({ A: "eliminated", B: "eliminated", C: "safe", me: "safe" });
    expect(new Set(r32.eliminatedIds!)).toEqual(new Set(["A", "B"]));
    expect(new Set(r32.survivors!)).toEqual(new Set(["C", "me"]));
  });

  it("reads eliminated from playoff_entry even when the eliminated manager is NOT the lowest scorer", () => {
    // Author a past round where eliminated_round contradicts the round-score order: B is eliminated
    // despite outscoring A. The state MUST follow playoff_entry, not the rank.
    const view = buildPlayoffsView(
      base({
        rounds: [round("R32", 1), round("Final", 1)],
        entries: [
          entry("A", 3, "alive"), // lowest scorer but SURVIVES per playoff_entry
          entry("B", 2, "eliminated", "R32"), // higher scorer but CUT per playoff_entry
          entry("me", 1, "alive"),
        ],
        roundScores: { R32: { A: 5, B: 20, me: 40 } },
        cumulativeTotals: totals({ A: 5, B: 20, me: 40 }),
      }),
    );
    const r32 = view.rounds[0]!;
    const stateOf = Object.fromEntries(r32.ranked!.map((r) => [r.managerId, r.state]));
    expect(stateOf.B).toBe("eliminated"); // authoritative
    expect(stateOf.A).toBe("safe");
    expect(r32.eliminatedIds).toEqual(["B"]);
  });
});

// ── live round — provisional cut via the SAME selector as the apply path ───────────────────
describe("buildPlayoffsView — live round provisional cut", () => {
  it("zone matches selectGuillotineCuts on the in-progress scores (clean cutoff)", () => {
    const roundScores = { Final: { A: 10, B: 20, C: 30, D: 40 } };
    const cumulativeTotals = totals({ A: 1, B: 2, C: 3, D: 4 });
    const view = buildPlayoffsView(
      base({
        rounds: [round("Final", 2)],
        entries: [entry("A", 4), entry("B", 3), entry("C", 2), entry("D", 1)],
        roundScores,
        cumulativeTotals,
      }),
    );
    const live = view.rounds[0]!;
    expect(live.status).toBe("live");
    // The selector's verdict on the same inputs is the ground truth.
    const selectorCut = selectGuillotineCuts(
      [
        { managerId: "A", points: 10 },
        { managerId: "B", points: 20 },
        { managerId: "C", points: 30 },
        { managerId: "D", points: 40 },
      ],
      cumulativeTotals,
      2,
    );
    expect(new Set(live.eliminatedIds!)).toEqual(new Set(selectorCut.eliminated)); // {A,B}
    const stateOf = Object.fromEntries(live.ranked!.map((r) => [r.managerId, r.state]));
    expect(stateOf).toEqual({ A: "zone", B: "zone", C: "safe", D: "safe" });
    expect(new Set(live.survivors!)).toEqual(new Set(["C", "D"]));
  });

  it("a live boundary tie (selector → needsCommissioner) surfaces the WHOLE tied set as zone", () => {
    // cutCount 1, A=B=10 at the boundary AND tied on cumulative → selector returns needsCommissioner.
    const aliveScores = [
      { managerId: "A", points: 10 },
      { managerId: "B", points: 10 },
      { managerId: "C", points: 20 },
      { managerId: "D", points: 30 },
    ];
    const cumulativeTotals = totals({ A: 5, B: 5, C: 50, D: 60 });
    // Sanity: the selector genuinely needs the commissioner here.
    const sel = selectGuillotineCuts(aliveScores, cumulativeTotals, 1);
    expect(sel.needsCommissioner).toBe(true);
    expect(new Set(sel.tied)).toEqual(new Set(["A", "B"]));

    const view = buildPlayoffsView(
      base({
        rounds: [round("Final", 1)],
        entries: [entry("A", 4), entry("B", 3), entry("C", 2), entry("D", 1)],
        roundScores: { Final: { A: 10, B: 10, C: 20, D: 30 } },
        cumulativeTotals,
      }),
    );
    const live = view.rounds[0]!;
    const stateOf = Object.fromEntries(live.ranked!.map((r) => [r.managerId, r.state]));
    // BOTH tied managers face the blade — never an arbitrary single cut.
    expect(stateOf.A).toBe("zone");
    expect(stateOf.B).toBe("zone");
    expect(stateOf.C).toBe("safe");
    expect(stateOf.D).toBe("safe");
    expect(new Set(live.eliminatedIds!)).toEqual(new Set(["A", "B"]));
    expect(new Set(live.survivors!)).toEqual(new Set(["C", "D"]));
  });

  it("zone includes managers strictly below the boundary PLUS the unbroken tied set", () => {
    // cutCount 2: D is definitely cut (strictly lowest); A,B tie at the boundary unbroken → all 3 zone.
    const cumulativeTotals = totals({ A: 5, B: 5, C: 50, D: 1, E: 99 });
    const view = buildPlayoffsView(
      base({
        rounds: [round("Final", 2)],
        entries: [entry("A", 5), entry("B", 4), entry("C", 3), entry("D", 2), entry("E", 1)],
        roundScores: { Final: { A: 10, B: 10, C: 20, D: 5, E: 30 } },
        cumulativeTotals,
      }),
    );
    const live = view.rounds[0]!;
    const stateOf = Object.fromEntries(live.ranked!.map((r) => [r.managerId, r.state]));
    expect(stateOf.D).toBe("zone"); // strictly below the boundary
    expect(stateOf.A).toBe("zone"); // tied at the boundary
    expect(stateOf.B).toBe("zone"); // tied at the boundary
    expect(stateOf.C).toBe("safe");
    expect(stateOf.E).toBe("safe");
    expect(new Set(live.eliminatedIds!)).toEqual(new Set(["A", "B", "D"]));
    // INTENDED divergence: `survives` is the SCHEDULE count (5 − cutCount 2 = 3), but the provisional
    // zone widened to 3 on the unbroken tie, so only 2 are currently safe. The two numbers legitimately
    // differ on a live boundary tie (schedule-eventual vs facing-the-blade-now) — pin it so a future
    // reviewer doesn't "reconcile" them.
    expect(live.survives).toBe(3);
    expect(live.eliminatedIds!.length).toBe(3);
    expect(new Set(live.survivors!)).toEqual(new Set(["C", "E"]));
  });
});

// ── future round skeleton + currentRoundIdx / aliveNow / survivesNow ──────────────────────
describe("buildPlayoffsView — future skeletons + current-round derivations", () => {
  // Ladder R32 (cut 2, past) → R16 (cut 2, live) → QF (cut 1, future). 6 participants.
  const input = base({
    viewerManagerId: "m1",
    rounds: [round("R32", 2), round("R16", 2), round("QF", 1)],
    entries: [
      entry("m1", 1, "alive"),
      entry("m2", 2, "alive"),
      entry("m3", 3, "alive"),
      entry("m4", 4, "alive"),
      entry("m5", 5, "eliminated", "R32"),
      entry("m6", 6, "eliminated", "R32"),
    ],
    roundScores: {
      R32: { m1: 60, m2: 55, m3: 50, m4: 45, m5: 20, m6: 10 },
      R16: { m1: 40, m2: 30, m3: 20, m4: 10 },
    },
    cumulativeTotals: totals({ m1: 100, m2: 85, m3: 70, m4: 55, m5: 40, m6: 20 }),
  });

  it("classifies past/live/future and skeletons the future round (ranked/survivors/eliminatedIds null)", () => {
    const view = buildPlayoffsView(input);
    expect(view.rounds.map((r) => r.status)).toEqual(["past", "live", "future"]);
    const qf = view.rounds[2]!;
    expect(qf.ranked).toBeNull();
    expect(qf.survivors).toBeNull();
    expect(qf.eliminatedIds).toBeNull();
    // fieldCount threads forward: R16 survives 4-2=2 → QF fieldCount 2, survives 2-1=1.
    expect(qf.fieldCount).toBe(2);
    expect(qf.cutCount).toBe(1);
    expect(qf.survives).toBe(1);
  });

  it("currentRoundIdx = live round; aliveNow / survivesNow from the live round", () => {
    const view = buildPlayoffsView(input);
    expect(view.totalRounds).toBe(3);
    expect(view.currentRoundIdx).toBe(1); // R16 is live
    expect(view.aliveNow).toBe(4); // entering R16
    expect(view.survivesNow).toBe(2); // 4 − cutCount 2
  });

  it("me = the viewer's row in the live round", () => {
    const view = buildPlayoffsView(input);
    expect(view.me).toMatchObject({ managerId: "m1", rank: 1, points: 40 });
  });
});

// ── champion / complete derivation ────────────────────────────────────────────────────────
describe("buildPlayoffsView — champion + complete (tournament over)", () => {
  it("derives complete + champion when every round is cut and a champion entry exists", () => {
    const view = buildPlayoffsView(
      base({
        viewerManagerId: "C",
        rounds: [round("R32", 2), round("Final", 1)],
        entries: [
          entry("A", 4, "eliminated", "R32"),
          entry("B", 3, "eliminated", "R32"),
          entry("C", 1, "champion"),
          entry("D", 2, "eliminated", "Final"),
        ],
        roundScores: { R32: { A: 10, B: 20, C: 40, D: 30 }, Final: { C: 50, D: 25 } },
        cumulativeTotals: totals({ A: 10, B: 20, C: 90, D: 55 }),
      }),
    );
    expect(view.complete).toBe(true);
    expect(view.champion).toBe("C");
    // No live round → currentRoundIdx is the last (Final, past).
    expect(view.currentRoundIdx).toBe(1);
    expect(view.rounds.map((r) => r.status)).toEqual(["past", "past"]);
    const final = view.rounds[1]!;
    expect(new Set(final.eliminatedIds!)).toEqual(new Set(["D"]));
    expect(new Set(final.survivors!)).toEqual(new Set(["C"]));
    // me (viewer = champion) shows in the Final round.
    expect(view.me).toMatchObject({ managerId: "C", state: "safe" });
  });

  it("me.state is 'eliminated' for the complete-phase runner-up (the §21-flagged RankedRow superset)", () => {
    // Same complete tournament, but viewed by D — the Final loser. me is their row in the current
    // (last, past) round, and its state is "eliminated" (not the narrower live-only safe|zone) — the
    // refinement ARCHITECTURE.md §21 calls out by example.
    const view = buildPlayoffsView(
      base({
        viewerManagerId: "D",
        rounds: [round("R32", 2), round("Final", 1)],
        entries: [
          entry("A", 4, "eliminated", "R32"),
          entry("B", 3, "eliminated", "R32"),
          entry("C", 1, "champion"),
          entry("D", 2, "eliminated", "Final"),
        ],
        roundScores: { R32: { A: 10, B: 20, C: 40, D: 30 }, Final: { C: 50, D: 25 } },
        cumulativeTotals: totals({ A: 10, B: 20, C: 90, D: 55 }),
      }),
    );
    expect(view.me).toMatchObject({ managerId: "D", rank: 2, state: "eliminated" });
  });

  it("not complete while a live round remains", () => {
    const view = buildPlayoffsView(
      base({
        rounds: [round("R32", 1), round("Final", 1)],
        entries: [entry("A", 1), entry("B", 2), entry("C", 3, "eliminated", "R32")],
        roundScores: { R32: { A: 20, B: 30, C: 10 }, Final: { A: 5, B: 9 } },
        cumulativeTotals: totals({ A: 25, B: 39, C: 10 }),
      }),
    );
    expect(view.complete).toBe(false);
    expect(view.champion).toBeNull();
  });
});

// ── me = null when the viewer is not in the current round ─────────────────────────────────
describe("buildPlayoffsView — me is null", () => {
  const ladder = base({
    rounds: [round("R32", 1), round("Final", 1)],
    entries: [
      entry("A", 1, "alive"),
      entry("B", 2, "alive"),
      entry("gone", 3, "eliminated", "R32"),
    ],
    roundScores: { R32: { A: 20, B: 30, gone: 10 }, Final: { A: 5, B: 9 } },
    cumulativeTotals: totals({ A: 25, B: 39, gone: 10 }),
  });

  it("null when the viewer was eliminated before the live round", () => {
    // Final is live; "gone" was cut in R32 → not among the live entrants.
    const view = buildPlayoffsView({ ...ladder, viewerManagerId: "gone" });
    expect(view.rounds[1]!.status).toBe("live");
    expect(view.me).toBeNull();
  });

  it("null when the viewer is not a playoff participant at all", () => {
    const view = buildPlayoffsView({ ...ladder, viewerManagerId: "stranger" });
    expect(view.me).toBeNull();
  });
});

// ── degenerate: no knockout rounds yet ────────────────────────────────────────────────────
describe("buildPlayoffsView — no rounds", () => {
  it("returns an empty, non-throwing view", () => {
    const view = buildPlayoffsView(base());
    expect(view.totalRounds).toBe(0);
    expect(view.rounds).toEqual([]);
    expect(view.me).toBeNull();
    expect(view.complete).toBe(false);
    expect(view.champion).toBeNull();
    expect(view.aliveNow).toBe(0);
    expect(view.survivesNow).toBe(0);
  });
});
