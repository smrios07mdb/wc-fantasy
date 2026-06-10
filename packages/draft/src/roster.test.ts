import { describe, it, expect } from "vitest";
import { EMPTY_COUNTS, isPositionLegal, isSquadComplete, squadTotal } from "./roster";

describe("squadTotal — sum of all per-position counts", () => {
  it("returns 0 for an empty squad", () => {
    expect(squadTotal(EMPTY_COUNTS)).toBe(0);
  });

  it("sums all positions correctly", () => {
    expect(squadTotal({ GK: 2, DEF: 5, MID: 5, FWD: 3 })).toBe(15);
    expect(squadTotal({ GK: 1, DEF: 3, MID: 2, FWD: 1 })).toBe(7);
  });
});

describe("isPositionLegal — total-based (caps lifted, shape-unconstrained to 15)", () => {
  it("allows any position while the squad total is under 15", () => {
    expect(isPositionLegal(EMPTY_COUNTS, "GK")).toBe(true);
    expect(isPositionLegal({ GK: 0, DEF: 0, MID: 5, FWD: 0 }, "MID")).toBe(true);
    expect(isPositionLegal({ GK: 0, DEF: 0, MID: 0, FWD: 3 }, "FWD")).toBe(true);
    expect(isPositionLegal({ GK: 2, DEF: 5, MID: 4, FWD: 3 }, "MID")).toBe(true);
  });

  it("allows a 6th MID — per-position caps are lifted", () => {
    expect(isPositionLegal({ GK: 0, DEF: 0, MID: 5, FWD: 0 }, "MID")).toBe(true);
  });

  it("allows a 3rd GK — per-position caps are lifted", () => {
    expect(isPositionLegal({ GK: 2, DEF: 0, MID: 0, FWD: 0 }, "GK")).toBe(true);
  });

  it("rejects any pick when squad total is already 15", () => {
    const full = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
    expect(isPositionLegal(full, "GK")).toBe(false);
    expect(isPositionLegal(full, "MID")).toBe(false);
    expect(isPositionLegal(full, "FWD")).toBe(false);
  });

  it("allows a pick at total 14 (one slot remaining), any position", () => {
    expect(isPositionLegal({ GK: 0, DEF: 5, MID: 5, FWD: 4 }, "GK")).toBe(true);
    expect(isPositionLegal({ GK: 0, DEF: 5, MID: 5, FWD: 4 }, "FWD")).toBe(true);
  });
});

describe("isSquadComplete — full at 15 total, any shape", () => {
  it("is complete at the canonical 2/5/5/3", () => {
    expect(isSquadComplete({ GK: 2, DEF: 5, MID: 5, FWD: 3 })).toBe(true);
  });

  it("is complete with a non-canonical distribution (e.g. 0/0/15/0)", () => {
    expect(isSquadComplete({ GK: 0, DEF: 0, MID: 15, FWD: 0 })).toBe(true);
  });

  it("is not complete at 14", () => {
    expect(isSquadComplete({ GK: 2, DEF: 5, MID: 5, FWD: 2 })).toBe(false);
  });

  it("an empty squad is not complete", () => {
    expect(isSquadComplete(EMPTY_COUNTS)).toBe(false);
  });
});
