import { describe, it, expect } from "vitest";
import { EMPTY_COUNTS, isPositionLegal, isSquadComplete } from "./roster";

describe("isPositionLegal — the 2/5/5/3 positional caps", () => {
  it("allows a position while under its cap", () => {
    expect(isPositionLegal(EMPTY_COUNTS, "GK")).toBe(true);
    expect(isPositionLegal({ GK: 1, DEF: 4, MID: 0, FWD: 0 }, "DEF")).toBe(true);
  });

  it("rejects a 3rd GK (cap 2)", () => {
    expect(isPositionLegal({ GK: 2, DEF: 0, MID: 0, FWD: 0 }, "GK")).toBe(false);
  });

  it("rejects a 6th DEF (cap 5)", () => {
    expect(isPositionLegal({ GK: 0, DEF: 5, MID: 0, FWD: 0 }, "DEF")).toBe(false);
  });

  it("rejects a 6th MID (cap 5)", () => {
    expect(isPositionLegal({ GK: 0, DEF: 0, MID: 5, FWD: 0 }, "MID")).toBe(false);
  });

  it("rejects a 4th FWD (cap 3)", () => {
    expect(isPositionLegal({ GK: 0, DEF: 0, MID: 0, FWD: 3 }, "FWD")).toBe(false);
  });

  it("a full bucket does not block a different, under-cap position", () => {
    expect(isPositionLegal({ GK: 2, DEF: 5, MID: 4, FWD: 3 }, "MID")).toBe(true);
  });
});

describe("isSquadComplete — a full 15-man squad meeting every cap", () => {
  it("is complete at exactly 2/5/5/3", () => {
    expect(isSquadComplete({ GK: 2, DEF: 5, MID: 5, FWD: 3 })).toBe(true);
  });

  it("is not complete one short (14)", () => {
    expect(isSquadComplete({ GK: 2, DEF: 5, MID: 5, FWD: 2 })).toBe(false);
  });

  it("an empty squad is not complete", () => {
    expect(isSquadComplete(EMPTY_COUNTS)).toBe(false);
  });
});
