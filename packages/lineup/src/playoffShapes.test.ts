/**
 * Drift guard for the playoff formation UNIVERSE. `playoffXIShapes()` is the single source of the legal
 * knockout shapes — it feeds the validator (`canFieldPlayoffXI` / the bound check) AND the Set-Lineup UI
 * offer-set (apps/web's `PLAYOFF_FORMATIONS` is built from this export). This pins the enumerated set so a
 * change to `PLAYOFF_ROSTER.bounds` can't silently widen/narrow it without an intentional test update.
 *
 * Under the loosened 1/1/1 mins (DECISIONS.md → Theme B: any complete 6-outfield shape with ≥1 per line)
 * the legal set is exactly these 10 shapes. Compared as a normalized SET (sorted keys), never by array
 * order, so a reordering of the enumeration loop is not a spurious failure.
 */
import { describe, expect, it } from "vitest";
import { playoffXIShapes } from "./validate";

/** The "DEF-MID-FWD" key for a shape (the single GK is implied). Matches the UI's formation key. */
const key = (s: { DEF: number; MID: number; FWD: number }) => `${s.DEF}-${s.MID}-${s.FWD}`;

// The complete 1-GK + 6-outfield shapes with ≥1 DEF, ≥1 MID, ≥1 FWD. Authored independently of the
// enumerator (this is the spec the enumerator must satisfy), as a SET — order is irrelevant.
const EXPECTED_PLAYOFF_SHAPES = [
  "1-1-4",
  "1-2-3",
  "1-3-2",
  "1-4-1",
  "2-1-3",
  "2-2-2",
  "2-3-1",
  "3-1-2",
  "3-2-1",
  "4-1-1",
];

describe("playoffXIShapes — the playoff formation universe (drift guard)", () => {
  it("enumerates EXACTLY the 10 complete shapes with ≥1 per line (compared as a set)", () => {
    const got = new Set(playoffXIShapes().map(key));
    expect(got).toEqual(new Set(EXPECTED_PLAYOFF_SHAPES));
  });

  it("every shape is a valid 7-man playoff XI: exactly 1 GK + 6 outfield, each lane ≥ 1", () => {
    for (const s of playoffXIShapes()) {
      expect(s.GK).toBe(1);
      expect(s.DEF + s.MID + s.FWD).toBe(6);
      expect(Math.min(s.DEF, s.MID, s.FWD)).toBeGreaterThanOrEqual(1);
    }
  });

  it("retains the three classic shapes (2-3-1 / 3-2-1 / 2-2-2) — old set ⊂ new set, no lineup invalidated", () => {
    const got = new Set(playoffXIShapes().map(key));
    for (const classic of ["2-3-1", "3-2-1", "2-2-2"]) expect(got.has(classic)).toBe(true);
  });
});
