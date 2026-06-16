/**
 * Unit suite for the SHARED cumulative-tournament-total derivation. The IO query
 * (`loadCumulativeTournamentTotals`) needs a live DB — it is covered end-to-end by BOTH callers' gated
 * Postgres suites (`apps/worker/.../advanceStore.integration.test.ts` + `apps/web/.../loadPlayoffs.integration.test.ts`).
 * What is PURE — the per-manager Σ reduce — is pinned here: a multi-period sum, a manager absent from some
 * periods (still summed over the rows it has), and the empty set → empty map.
 */
import { describe, it, expect } from "vitest";
import { sumByManager } from "./cumulativeTotals";

describe("sumByManager — per-manager Σ over score_manager_period rows", () => {
  it("sums a manager's points across multiple periods", () => {
    // Three periods' worth of rows; m1 scored in all three, m2 in one.
    const totals = sumByManager([
      { managerId: "m1", points: 50 },
      { managerId: "m2", points: 40 },
      { managerId: "m1", points: 5 },
      { managerId: "m1", points: 10 },
    ]);
    expect(totals.get("m1")).toBe(65);
    expect(totals.get("m2")).toBe(40);
  });

  it("sums a manager absent from some periods over only the rows it has", () => {
    // m1 has rows in two periods, m3 in one. Each manager is summed independently of the others' presence.
    const totals = sumByManager([
      { managerId: "m1", points: 30 },
      { managerId: "m1", points: 20 },
      { managerId: "m3", points: 7 },
    ]);
    expect(totals.get("m1")).toBe(50);
    expect(totals.get("m3")).toBe(7);
    // A manager with no rows at all is simply absent — the caller defaults it to 0.
    expect(totals.has("m2")).toBe(false);
  });

  it("returns an empty map for an empty row set", () => {
    expect(sumByManager([]).size).toBe(0);
  });
});
