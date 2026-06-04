import { describe, it, expect } from "vitest";
import { selectGuillotineCuts } from "./guillotine";
import type { ManagerPeriodPoints } from "./standing";

const round = (rows: Record<string, number>): ManagerPeriodPoints[] =>
  Object.entries(rows).map(([managerId, points]) => ({ managerId, points }));

const totals = (rows: Record<string, number>): ReadonlyMap<string, number> =>
  new Map(Object.entries(rows));

describe("selectGuillotineCuts — clean cutoffs", () => {
  it("cuts the bottom cut_count by round score (cut_count = 2)", () => {
    const result = selectGuillotineCuts(
      round({ A: 10, B: 20, C: 30, D: 40 }),
      totals({ A: 100, B: 100, C: 100, D: 100 }), // irrelevant — no boundary tie
      2,
    );
    expect(result).toEqual({ eliminated: ["A", "B"] });
  });

  it("cuts the single lowest (cut_count = 1)", () => {
    const result = selectGuillotineCuts(
      round({ A: 10, B: 20, C: 30 }),
      totals({ A: 1, B: 1, C: 1 }),
      1,
    );
    expect(result).toEqual({ eliminated: ["A"] });
  });
});

describe("selectGuillotineCuts — boundary tie broken by cumulative tournament total", () => {
  it("cuts the lowest-cumulative among managers tied at the cutoff (cut_count = 2)", () => {
    // A,B,C all tied at 5 (D safe at 20); 2 of the 3 tied must be cut.
    const result = selectGuillotineCuts(
      round({ A: 5, B: 5, C: 5, D: 20 }),
      totals({ A: 100, B: 50, C: 80, D: 999 }), // B(50) & C(80) lowest → cut; A(100) survives
      2,
    );
    expect(result).toEqual({ eliminated: ["B", "C"] });
  });

  it("uses the cumulative tiebreak even when only one of a tied pair is cut (cut_count = 1)", () => {
    const result = selectGuillotineCuts(
      round({ A: 5, B: 5, C: 20 }),
      totals({ A: 30, B: 40, C: 1 }), // A & B tied at 5; A lower cumulative → A cut
      1,
    );
    expect(result).toEqual({ eliminated: ["A"] });
  });

  it("mixes a definite cut with a cumulative-resolved boundary tie", () => {
    // E is strictly lowest (definite). A & B tie at the boundary; one more must go.
    const result = selectGuillotineCuts(
      round({ E: 1, A: 5, B: 5, C: 20 }),
      totals({ E: 10, A: 70, B: 40, C: 99 }), // E definite; B(40) < A(70) → B cut too
      2,
    );
    expect(result).toEqual({ eliminated: ["B", "E"] });
  });
});

describe("selectGuillotineCuts — commissioner backstop (never auto-cut arbitrarily)", () => {
  it("returns needsCommissioner when a cutoff tie survives the cumulative tiebreak", () => {
    const result = selectGuillotineCuts(
      round({ A: 5, B: 5, C: 5, D: 20 }),
      totals({ A: 50, B: 50, C: 50, D: 999 }), // 3-way tie, identical cumulative; cut 2 of 3
      2,
    );
    expect(result).toEqual({ needsCommissioner: true, tied: ["A", "B", "C"], cutsRemaining: 2 });
    expect(result.eliminated).toBeUndefined(); // never an arbitrary cut
  });

  it("surfaces only the still-tied subset, after stripping the cumulatively-resolved cuts", () => {
    // cut 2: X is definitely cut (lowest cumulative at boundary); Y & Z remain tied for the last slot.
    const result = selectGuillotineCuts(
      round({ X: 5, Y: 5, Z: 5, W: 20 }),
      totals({ X: 10, Y: 50, Z: 50, W: 999 }), // X(10) cut; Y/Z tie at 50 for 1 slot → commissioner
      2,
    );
    expect(result).toEqual({ needsCommissioner: true, tied: ["Y", "Z"], cutsRemaining: 1 });
  });
});

describe("selectGuillotineCuts — degenerate inputs stay deterministic", () => {
  it("cuts nobody when cut_count is 0", () => {
    expect(selectGuillotineCuts(round({ A: 1, B: 2 }), totals({ A: 0, B: 0 }), 0)).toEqual({
      eliminated: [],
    });
  });

  it("cuts everyone when cut_count ≥ survivor count", () => {
    expect(selectGuillotineCuts(round({ B: 2, A: 1 }), totals({ A: 0, B: 0 }), 5)).toEqual({
      eliminated: ["A", "B"],
    });
  });

  it("rejects a non-integer cut_count with a clear error (not an opaque crash)", () => {
    // cut_count is a Period.cut_count (Int) — a fractional value is a programming error; fail loudly.
    expect(() =>
      selectGuillotineCuts(round({ A: 1, B: 2, C: 3 }), totals({ A: 0, B: 0, C: 0 }), 1.5),
    ).toThrow(/integer/);
  });
});
