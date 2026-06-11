import { describe, it, expect } from "vitest";
import {
  periodOrderRank,
  comparePeriodLabels,
  sortByPeriodOrder,
  selectCurrentPeriod,
} from "./periodOrder";

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

describe("selectCurrentPeriod — opensAt-NULL ordering bug + batchClearedAt advancement", () => {
  const MD1_KO = new Date("2026-06-11T16:00:00.000Z");
  const MD2_KO = new Date("2026-06-15T16:00:00.000Z");
  const FINAL_KO = new Date("2026-07-19T19:00:00.000Z");

  const md1 = {
    id: "md1",
    label: "Group MD1",
    status: "pending",
    batchClearedAt: null,
    matches: [{ kickoffAt: MD1_KO }],
  };
  const md2 = {
    id: "md2",
    label: "Group MD2",
    status: "pending",
    batchClearedAt: null,
    matches: [{ kickoffAt: MD2_KO }],
  };
  const final = {
    id: "final",
    label: "Final",
    status: "pending",
    batchClearedAt: null,
    matches: [{ kickoffAt: FINAL_KO }],
  };

  it("returns the earliest pending period, not the alphabetically first (the opensAt-NULL bug)", () => {
    // DB returns [Final, MD1] because all opensAt=NULL → alphabetical tiebreak puts 'F' before 'G'
    const picked = selectCurrentPeriod([final, md1]);
    expect(picked?.id).toBe("md1");
  });

  it("advances past a cleared period: [MD1 cleared, MD2 pending] → picks MD2", () => {
    const md1Cleared = { ...md1, batchClearedAt: new Date("2026-06-11T10:00:00.000Z") };
    // Even with alphabetical input order, cleared MD1 is skipped and MD2 is returned
    expect(selectCurrentPeriod([final, md1Cleared, md2])?.id).toBe("md2");
  });

  it("prefers an open period over the earliest pending", () => {
    const openMd2 = { ...md2, status: "open" };
    expect(selectCurrentPeriod([final, openMd2, md1])?.id).toBe("md2");
  });

  it("returns null when all pending periods have been cleared", () => {
    const allCleared = [
      { ...md1, batchClearedAt: new Date() },
      { ...final, batchClearedAt: new Date() },
    ];
    expect(selectCurrentPeriod(allCleared)).toBeNull();
  });

  it("a period with no fixtures sorts last so one with fixtures is preferred", () => {
    const noFixtures = {
      id: "tbd",
      label: "QF",
      status: "pending",
      batchClearedAt: null,
      matches: [],
    };
    expect(selectCurrentPeriod([noFixtures, md1])?.id).toBe("md1");
  });
});
