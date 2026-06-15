import { describe, it, expect } from "vitest";
import { resolveRoundCut, championAfterCut, type RoundCutInput } from "./playoffRound";
import type { ManagerPeriodPoints } from "./standing";

/**
 * Deliverable A — the GLUE over the (untouched) pure {@link selectGuillotineCuts}. We assert it (a) passes
 * a fully-determined cut straight through, (b) passes a residual boundary tie through as
 * needs-commissioner, (c) adjudicates a `--break-tie` choice into a determined cut WITHOUT reimplementing
 * the selector, (d) rejects a malformed `--break-tie`, and (e) detects the lone-survivor champion. The
 * `round`/`totals` literal helpers mirror guillotine.test.ts so the inputs are eyeballable.
 */
const round = (rows: Record<string, number>): ManagerPeriodPoints[] =>
  Object.entries(rows).map(([managerId, points]) => ({ managerId, points }));
const totals = (rows: Record<string, number>): ReadonlyMap<string, number> =>
  new Map(Object.entries(rows));

const input = (
  over: Partial<RoundCutInput> & Pick<RoundCutInput, "aliveRoundScores" | "cutCount">,
): RoundCutInput => ({
  cumulativeTotals: new Map(),
  ...over,
});

// ── championAfterCut (the lone-survivor predicate) ──────────────────────────────────────
describe("championAfterCut", () => {
  it("returns the lone survivor when exactly one remains", () => {
    expect(championAfterCut(["A", "B"], ["A"])).toBe("B");
  });
  it("returns null while more than one survives", () => {
    expect(championAfterCut(["A", "B", "C"], ["A"])).toBeNull();
  });
  it("returns null when the cut leaves nobody", () => {
    expect(championAfterCut(["A", "B"], ["A", "B"])).toBeNull();
  });
});

// ── resolveRoundCut — determined cuts ───────────────────────────────────────────────────
describe("resolveRoundCut — determined", () => {
  it("passes a clean cut through (cut_count = 2)", () => {
    const res = resolveRoundCut(
      input({ aliveRoundScores: round({ A: 10, B: 20, C: 30, D: 40 }), cutCount: 2 }),
    );
    expect(res).toEqual({
      kind: "determined",
      eliminated: ["A", "B"],
      survivors: ["C", "D"],
      champion: null,
    });
  });

  it("passes the single lowest through (cut_count = 1)", () => {
    const res = resolveRoundCut(
      input({ aliveRoundScores: round({ A: 10, B: 20, C: 30 }), cutCount: 1 }),
    );
    expect(res).toMatchObject({ kind: "determined", eliminated: ["A"], survivors: ["B", "C"] });
  });

  it("resolves a boundary tie by the cumulative tiebreak (no commissioner needed)", () => {
    // All four tie on round score; the lowest cumulative total (A) is cut.
    const res = resolveRoundCut(
      input({
        aliveRoundScores: round({ A: 10, B: 10, C: 10, D: 10 }),
        cumulativeTotals: totals({ A: 1, B: 2, C: 3, D: 4 }),
        cutCount: 1,
      }),
    );
    expect(res).toMatchObject({ kind: "determined", eliminated: ["A"] });
  });

  it("flags the lone-survivor champion on a determined cut", () => {
    const res = resolveRoundCut(input({ aliveRoundScores: round({ A: 5, B: 50 }), cutCount: 1 }));
    expect(res).toEqual({ kind: "determined", eliminated: ["A"], survivors: ["B"], champion: "B" });
  });
});

// ── resolveRoundCut — needs-commissioner passthrough ────────────────────────────────────
describe("resolveRoundCut — needs commissioner", () => {
  it("surfaces an unbroken boundary tie as needs-commissioner (cut_count = 2)", () => {
    const res = resolveRoundCut(
      input({
        aliveRoundScores: round({ A: 10, B: 10, C: 10, D: 10, E: 99 }),
        cumulativeTotals: totals({ A: 5, B: 5, C: 5, D: 5, E: 5 }),
        cutCount: 2,
      }),
    );
    expect(res).toEqual({
      kind: "needsCommissioner",
      tied: ["A", "B", "C", "D"],
      cutsRemaining: 2,
    });
  });

  it("surfaces a residual tie ABOVE a determined cut (one definite + a 1-of-3 tie)", () => {
    // A (score 1) is definitely cut; B/C/D tie for the last of 2 slots.
    const res = resolveRoundCut(
      input({
        aliveRoundScores: round({ A: 1, B: 10, C: 10, D: 10, E: 99 }),
        cumulativeTotals: totals({ B: 50, C: 50, D: 50 }),
        cutCount: 2,
      }),
    );
    expect(res).toEqual({ kind: "needsCommissioner", tied: ["B", "C", "D"], cutsRemaining: 1 });
  });
});

// ── resolveRoundCut — break-tie adjudication ────────────────────────────────────────────
describe("resolveRoundCut — break-tie adjudication", () => {
  it("adjudicates a flat tie into a determined cut (names exactly cutsRemaining)", () => {
    const res = resolveRoundCut(
      input({
        aliveRoundScores: round({ A: 10, B: 10, C: 10, D: 10, E: 99 }),
        cumulativeTotals: totals({ A: 5, B: 5, C: 5, D: 5, E: 5 }),
        cutCount: 2,
        breakTie: ["B", "D"],
      }),
    );
    expect(res).toEqual({
      kind: "determined",
      eliminated: ["B", "D"],
      survivors: ["A", "C", "E"],
      champion: null,
    });
  });

  it("adjudicates a residual tie ABOVE a determined cut (definite ∪ named)", () => {
    const res = resolveRoundCut(
      input({
        aliveRoundScores: round({ A: 1, B: 10, C: 10, D: 10, E: 99 }),
        cumulativeTotals: totals({ B: 50, C: 50, D: 50 }),
        cutCount: 2,
        breakTie: ["C"],
      }),
    );
    expect(res).toMatchObject({
      kind: "determined",
      eliminated: ["A", "C"],
      survivors: ["B", "D", "E"],
    });
  });

  it("rejects a --break-tie with the wrong count", () => {
    const res = resolveRoundCut(
      input({
        aliveRoundScores: round({ A: 10, B: 10, C: 10, D: 10, E: 99 }),
        cumulativeTotals: totals({ A: 5, B: 5, C: 5, D: 5, E: 5 }),
        cutCount: 2,
        breakTie: ["B"], // tie needs 2, named 1
      }),
    );
    expect(res).toMatchObject({ kind: "invalid-tiebreak", cutsRemaining: 2 });
  });

  it("rejects a --break-tie naming a manager outside the tied set", () => {
    const res = resolveRoundCut(
      input({
        aliveRoundScores: round({ A: 10, B: 10, C: 10, D: 10, E: 99 }),
        cumulativeTotals: totals({ A: 5, B: 5, C: 5, D: 5, E: 5 }),
        cutCount: 2,
        breakTie: ["A", "E"], // E is not in the tied set
      }),
    );
    expect(res).toMatchObject({ kind: "invalid-tiebreak" });
  });

  it("rejects a --break-tie when the cut is fully determined (no tie to break)", () => {
    const res = resolveRoundCut(
      input({
        aliveRoundScores: round({ A: 10, B: 20, C: 30, D: 40 }),
        cutCount: 2,
        breakTie: ["A"],
      }),
    );
    expect(res).toMatchObject({ kind: "invalid-tiebreak" });
  });

  it("adjudicates the FINAL round into a champion (last survivor)", () => {
    // Three alive, cut 2 — a flat tie among the bottom; the commissioner cuts B & C, A is champion.
    const res = resolveRoundCut(
      input({
        aliveRoundScores: round({ A: 10, B: 10, C: 10 }),
        cumulativeTotals: totals({ A: 5, B: 5, C: 5 }),
        cutCount: 2,
        breakTie: ["B", "C"],
      }),
    );
    expect(res).toEqual({
      kind: "determined",
      eliminated: ["B", "C"],
      survivors: ["A"],
      champion: "A",
    });
  });
});
