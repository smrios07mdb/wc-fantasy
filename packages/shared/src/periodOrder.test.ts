import { describe, it, expect } from "vitest";
import { periodOrderRank, comparePeriodLabels, sortByPeriodOrder } from "./periodOrder";

describe("periodOrderRank — canonical tournament progression", () => {
  it("ranks group matchdays by their MD number, ahead of every knockout round", () => {
    expect(periodOrderRank("MD1")).toBeLessThan(periodOrderRank("MD2"));
    expect(periodOrderRank("MD2")).toBeLessThan(periodOrderRank("MD3"));
    // every group matchday precedes the first knockout round
    expect(periodOrderRank("MD3")).toBeLessThan(periodOrderRank("R32"));
  });

  it("ranks knockout rounds in BRACKET order (R32 → R16 → QF → SF → Final), not alphabetically", () => {
    const knockout = ["R32", "R16", "QF", "SF", "Final"];
    const ranks = knockout.map(periodOrderRank);
    // strictly increasing in bracket order
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThan(ranks[i - 1]!);
    }
    // explicitly NOT alphabetical: alpha would put "Final" first, "SF" last
    expect(periodOrderRank("Final")).toBeGreaterThan(periodOrderRank("SF"));
    expect(periodOrderRank("R32")).toBeLessThan(periodOrderRank("Final"));
  });

  it("sends an unknown label to the back (stable fallback, never crashes)", () => {
    expect(periodOrderRank("???")).toBeGreaterThan(periodOrderRank("Final"));
  });
});

describe("sortByPeriodOrder — orders a shuffled period set canonically", () => {
  it("produces MD1, MD2, MD3, R32, R16, QF, SF, Final from any input order", () => {
    const shuffled = [
      { label: "Final" },
      { label: "QF" },
      { label: "MD2" },
      { label: "R16" },
      { label: "MD1" },
      { label: "SF" },
      { label: "R32" },
      { label: "MD3" },
    ];
    const ordered = sortByPeriodOrder(shuffled, (p) => p.label).map((p) => p.label);
    expect(ordered).toEqual(["MD1", "MD2", "MD3", "R32", "R16", "QF", "SF", "Final"]);
  });

  it("does NOT mutate the input array", () => {
    const input = [{ label: "Final" }, { label: "R32" }];
    const copy = [...input];
    sortByPeriodOrder(input, (p) => p.label);
    expect(input).toEqual(copy);
  });
});

describe("comparePeriodLabels — the comparator used by selectors", () => {
  it("orders knockout rounds by bracket, not by string collation", () => {
    const sorted = ["SF", "R32", "Final", "QF", "R16"].sort(comparePeriodLabels);
    expect(sorted).toEqual(["R32", "R16", "QF", "SF", "Final"]);
  });
});
