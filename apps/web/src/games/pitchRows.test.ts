/**
 * Pure unit suite for {@link pitchRows} — the convention-based formation-line splits. Pins the named
 * conventions (flat ≤4 → one line on EITHER axis, DEF-5 → 3+2, MID/FWD-5 → 2+3), the deeper-line-first
 * (back→front) order, order preservation, the 6+ anomaly fallback, and the empty/degenerate cases.
 *
 * These pin the SPLIT MATH only. They cannot pin rendered GEOMETRY (jsdom has no layout engine) — that
 * is the job of the opt-in real-browser guard `apps/web/scripts/verify-pitch-layout.mjs` (`pnpm
 * test:layout`), which asserts no-scroll fit, no overlap, no clip, and the right line structure.
 */
import { describe, it, expect } from "vitest";
import { pitchRows, type PitchBand } from "./pitchRows";

/** Sizes of each returned line, in back→front order. */
function sizes<T>(rows: T[][]): number[] {
  return rows.map((r) => r.length);
}

const BANDS: PitchBand[] = ["GK", "DEF", "MID", "FWD"];

describe("pitchRows", () => {
  it("keeps any band of ≤4 on a SINGLE line (flat back-4 / mid-4 never wrap to 2+2)", () => {
    for (const band of BANDS) {
      expect(sizes(pitchRows([1], band))).toEqual([1]);
      expect(sizes(pitchRows([1, 2], band))).toEqual([2]); // front two
      expect(sizes(pitchRows([1, 2, 3], band))).toEqual([3]); // back three / front three
      expect(sizes(pitchRows([1, 2, 3, 4], band))).toEqual([4]); // flat 4 — locked single line
    }
  });

  it("splits a 5-man DEFENCE into 3 deep + 2 ahead (back three + wing-back pair)", () => {
    expect(sizes(pitchRows([1, 2, 3, 4, 5], "DEF"))).toEqual([3, 2]);
    expect(pitchRows([1, 2, 3, 4, 5], "DEF")).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });

  it("splits a 5-man MIDFIELD into 2 holding deep + 3 ahead (the 4-2-3-1 / 4-5-1 case)", () => {
    expect(sizes(pitchRows([1, 2, 3, 4, 5], "MID"))).toEqual([2, 3]);
    expect(pitchRows([1, 2, 3, 4, 5], "MID")).toEqual([
      [1, 2],
      [3, 4, 5],
    ]);
  });

  it("splits a 5-man front line front-loaded (2+3), matching the midfield convention", () => {
    expect(sizes(pitchRows([1, 2, 3, 4, 5], "FWD"))).toEqual([2, 3]);
  });

  it("preserves player order across the split (deeper line first, in source order)", () => {
    expect(pitchRows(["a", "b", "c", "d", "e"], "DEF")).toEqual([
      ["a", "b", "c"],
      ["d", "e"],
    ]);
    expect(pitchRows(["a", "b", "c", "d", "e"], "MID")).toEqual([
      ["a", "b"],
      ["c", "d", "e"],
    ]);
  });

  it("balances a 6+ anomaly band into ≤4 lines, fuller toward the front", () => {
    // An 11-man XI can't field 6+ in one band; this is the kickoff-XI reconciliation safety net.
    expect(sizes(pitchRows([1, 2, 3, 4, 5, 6], "MID"))).toEqual([3, 3]);
    expect(sizes(pitchRows([1, 2, 3, 4, 5, 6, 7], "MID"))).toEqual([3, 4]);
    expect(sizes(pitchRows([1, 2, 3, 4, 5, 6, 7, 8], "MID"))).toEqual([4, 4]);
  });

  it("never exceeds the per-line cap on any line and places every player exactly once", () => {
    for (const band of BANDS) {
      for (let n = 1; n <= 11; n += 1) {
        const rows = pitchRows(
          Array.from({ length: n }, (_, i) => i),
          band,
        );
        for (const line of rows) expect(line.length).toBeLessThanOrEqual(4);
        expect(rows.reduce((sum, line) => sum + line.length, 0)).toBe(n);
      }
    }
  });

  it("returns no lines for an empty band (any band)", () => {
    for (const band of BANDS) expect(pitchRows([], band)).toEqual([]);
  });

  it("does not mutate or alias the input array", () => {
    const input = [1, 2, 3];
    const rows = pitchRows(input, "DEF");
    rows.forEach((line) => line.push(99));
    expect(input).toEqual([1, 2, 3]);
  });
});
