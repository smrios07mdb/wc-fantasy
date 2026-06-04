import { describe, it, expect } from "vitest";
import { compareRatings } from "./compare";

describe("compareRatings", () => {
  it("summarizes diff + correlation over paired ratings", () => {
    const out = compareRatings([
      { scrape: 7.0, balldontlie: 6.0 },
      { scrape: 8.0, balldontlie: 7.5 },
      { scrape: 6.0, balldontlie: 6.5 },
    ]);
    expect(out.n).toBe(3);
    expect(out.meanDiff).toBeCloseTo((1.0 + 0.5 - 0.5) / 3, 6);
    expect(out.meanAbsDiff).toBeCloseTo((1.0 + 0.5 + 0.5) / 3, 6);
    expect(out.maxAbsDiff).toBeCloseTo(1.0, 6);
    expect(out.correlation).toBeCloseTo(0.6547, 3); // positive Pearson — they move together
    // abs diffs 1.0, 0.5, 0.5 → [0.5,1) holds the two 0.5s; [1,2) holds the 1.0.
    expect(out.distribution).toEqual({ lt05: 0, lt1: 2, lt2: 1, ge2: 0 });
  });
  it("handles the empty set without dividing by zero", () => {
    expect(compareRatings([])).toMatchObject({
      n: 0,
      meanDiff: 0,
      meanAbsDiff: 0,
      maxAbsDiff: 0,
      correlation: null,
    });
  });
});
