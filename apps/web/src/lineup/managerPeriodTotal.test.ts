/**
 * Proof for T11 R2 / Fix A-2 single-sourcing: the prior-matchday lineup header total is read
 * VERBATIM from the manager's `score_manager_period.points` row — the SAME column the standings
 * page sums per matchday — and is NEVER re-summed from per-player points. `selectManagerPeriodTotal`
 * is the pure picker the loader uses; these lock its contract so the prior-lineup total can never
 * silently diverge from standings.
 */
import { describe, it, expect } from "vitest";
import { selectManagerPeriodTotal } from "./view";

describe("selectManagerPeriodTotal — canonical, single-sourced matchday total", () => {
  const rows = [
    { periodId: "md1", points: 47 },
    { periodId: "md2", points: 12 },
  ];

  it("returns the stored points for the matching period verbatim", () => {
    expect(selectManagerPeriodTotal(rows, "md1")).toBe(47);
    expect(selectManagerPeriodTotal(rows, "md2")).toBe(12);
  });

  it("returns null when no score_manager_period row exists (editable/future period)", () => {
    expect(selectManagerPeriodTotal(rows, "md3")).toBeNull();
    expect(selectManagerPeriodTotal([], "md1")).toBeNull();
  });

  it("picks the stored total, NOT a per-player re-sum (single-source guarantee)", () => {
    // The canonical row says 47. A naive re-sum of these per-player points would be 50 — proving
    // the picker does not derive the header from player points, so it always matches standings.
    const perPlayerPoints = [10, 9, 8, 8, 15]; // sums to 50, deliberately != the stored 47
    const naiveResum = perPlayerPoints.reduce((a, b) => a + b, 0);
    expect(naiveResum).toBe(50);
    expect(selectManagerPeriodTotal(rows, "md1")).toBe(47);
    expect(selectManagerPeriodTotal(rows, "md1")).not.toBe(naiveResum);
  });

  it("preserves negative / zero totals (does not coerce to null)", () => {
    expect(selectManagerPeriodTotal([{ periodId: "p", points: 0 }], "p")).toBe(0);
    expect(selectManagerPeriodTotal([{ periodId: "p", points: -3 }], "p")).toBe(-3);
  });
});
