/**
 * Pure unit suite for {@link pitchRows} — the formation-line wrapping that keeps a populous band from
 * overflowing the pitch. Pins the spec splits per axis (the flat back-4 is the only axis-dependent
 * case: one line on the wide/desktop axis, a balanced 2+2 on the narrow/mobile axis), the
 * fuller-line-toward-the-front bias, order preservation, and the empty/degenerate cases.
 */
import { describe, it, expect } from "vitest";
import { pitchRows } from "./pitchRows";

/** Sizes of each returned line, in back→front order. */
function sizes<T>(rows: T[][]): number[] {
  return rows.map((r) => r.length);
}

describe("pitchRows", () => {
  describe("wide (desktop) axis", () => {
    it("keeps small bands AND a flat back-4 on a single line (≤4)", () => {
      expect(sizes(pitchRows([1]))).toEqual([1]);
      expect(sizes(pitchRows([1, 2]))).toEqual([2]);
      expect(sizes(pitchRows([1, 2, 3]))).toEqual([3]);
      expect(sizes(pitchRows([1, 2, 3, 4]))).toEqual([4]); // back-4 reads as one line on desktop
    });

    it("wraps 5+ into balanced lines with the fuller line toward the FRONT", () => {
      expect(sizes(pitchRows([1, 2, 3, 4, 5]))).toEqual([2, 3]); // 5 → 2 behind, 3 ahead
      expect(sizes(pitchRows([1, 2, 3, 4, 5, 6]))).toEqual([3, 3]); // 6 → 3+3
      expect(sizes(pitchRows([1, 2, 3, 4, 5, 6, 7]))).toEqual([3, 4]); // 7 → 3 behind, 4 ahead
      expect(sizes(pitchRows([1, 2, 3, 4, 5, 6, 7, 8]))).toEqual([4, 4]); // 8 → 4+4
    });
  });

  describe("narrow (mobile) axis", () => {
    it("keeps ≤3 on a single line", () => {
      expect(sizes(pitchRows([1], true))).toEqual([1]);
      expect(sizes(pitchRows([1, 2], true))).toEqual([2]);
      expect(sizes(pitchRows([1, 2, 3], true))).toEqual([3]);
    });

    it("wraps a flat back-4 into a balanced 2+2 (back 2 | front 2)", () => {
      expect(sizes(pitchRows([1, 2, 3, 4], true))).toEqual([2, 2]);
      expect(pitchRows([1, 2, 3, 4], true)).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });

    it("splits 5/6/7/8 identically to the wide axis", () => {
      expect(sizes(pitchRows([1, 2, 3, 4, 5], true))).toEqual([2, 3]);
      expect(sizes(pitchRows([1, 2, 3, 4, 5, 6], true))).toEqual([3, 3]);
      expect(sizes(pitchRows([1, 2, 3, 4, 5, 6, 7], true))).toEqual([3, 4]);
      expect(sizes(pitchRows([1, 2, 3, 4, 5, 6, 7, 8], true))).toEqual([4, 4]);
    });
  });

  it("preserves player order across the split (back line first, in source order)", () => {
    expect(pitchRows(["a", "b", "c", "d", "e"])).toEqual([
      ["a", "b"],
      ["c", "d", "e"],
    ]);
  });

  it("never exceeds the per-line cap on any line (both axes)", () => {
    for (const narrow of [false, true]) {
      for (let n = 1; n <= 11; n += 1) {
        const rows = pitchRows(
          Array.from({ length: n }, (_, i) => i),
          narrow,
        );
        for (const line of rows) expect(line.length).toBeLessThanOrEqual(4);
        // every player is placed exactly once
        expect(rows.reduce((sum, line) => sum + line.length, 0)).toBe(n);
      }
    }
  });

  it("returns no lines for an empty band (either axis)", () => {
    expect(pitchRows([])).toEqual([]);
    expect(pitchRows([], true)).toEqual([]);
  });

  it("does not mutate or alias the input array", () => {
    const input = [1, 2, 3];
    const rows = pitchRows(input);
    rows.forEach((line) => line.push(99));
    expect(input).toEqual([1, 2, 3]);
  });
});
