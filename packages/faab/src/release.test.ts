/**
 * Pure unit tests for {@link validateRelease} — the playoff trim-down drop-only validator (DECISIONS §D
 * trim-down). No store/clock: the roster, the locked set, the cap, and the confirm/allow-locked flags are
 * all injected. Covers ownership, the nothing-to-drop guard, the lock block (+ commissioner carve-out), the
 * 7-starter floor hard-block, the unfillable 7–9 confirm gate, and the lock-scoping the trim window relies on.
 */
import { describe, expect, it } from "vitest";
import { PLAYOFF_ROSTER, type Position } from "@app/shared";
import { validateRelease, type ReleaseRosterPlayer } from "./release";

const CAP = PLAYOFF_ROSTER.cap; // 9

/** A full 15-man group squad: 2 GK / 5 DEF / 5 MID / 3 FWD, ids like "GK1".."FWD3". */
function squad15(): ReleaseRosterPlayer[] {
  const by: [Position, number][] = [
    ["GK", 2],
    ["DEF", 5],
    ["MID", 5],
    ["FWD", 3],
  ];
  const roster: ReleaseRosterPlayer[] = [];
  for (const [position, n] of by) {
    for (let i = 1; i <= n; i++) roster.push({ playerId: `${position}${i}`, position });
  }
  return roster;
}

const base = {
  roster: squad15(),
  lockedPlayerIds: new Set<string>(),
  rosterCap: CAP,
  allowLocked: false,
  confirmedUnfillable: false,
};

describe("validateRelease — ownership + nothing-to-drop", () => {
  it("rejects an empty drop list", () => {
    const v = validateRelease({ ...base, dropIds: [] });
    expect(v?.code).toBe("release-nothing");
  });

  it("rejects a drop the manager does not own", () => {
    const v = validateRelease({ ...base, dropIds: ["GHOST"] });
    expect(v).toMatchObject({ code: "release-not-owned", playerId: "GHOST" });
  });

  it("accepts a clean trim 15 → 9 (drop 6, balanced)", () => {
    // leaves GK1, DEF1-3, MID1-3, FWD1-2 = 1/3/3/2 = 9 (fields every shape)
    const v = validateRelease({
      ...base,
      dropIds: ["GK2", "DEF4", "DEF5", "MID4", "MID5", "FWD3"],
    });
    expect(v).toBeNull();
  });
});

describe("validateRelease — lock block + commissioner carve-out", () => {
  const dropIds = ["GK2", "DEF4", "DEF5", "MID4", "MID5", "FWD3"];

  it("blocks releasing a locked (played) player on the manager path", () => {
    const v = validateRelease({ ...base, dropIds, lockedPlayerIds: new Set(["MID4"]) });
    expect(v).toMatchObject({ code: "release-locked", playerId: "MID4" });
  });

  it("permits releasing a locked player under --allow-locked-slot (commissioner)", () => {
    const v = validateRelease({
      ...base,
      dropIds,
      lockedPlayerIds: new Set(["MID4"]),
      allowLocked: true,
    });
    expect(v).toBeNull();
  });
});

describe("validateRelease — the 7-starter floor", () => {
  it("hard-blocks a release that would leave fewer than 7 players", () => {
    // drop 9 → leaves 6 (< PLAYOFF_ROSTER.starters)
    const dropIds = ["GK2", "DEF1", "DEF2", "DEF3", "DEF4", "DEF5", "MID1", "MID2", "MID3"];
    const v = validateRelease({ ...base, dropIds });
    expect(v).toMatchObject({ code: "release-below-floor", floor: PLAYOFF_ROSTER.starters });
    expect((v as { postCount: number }).postCount).toBe(6);
  });
});

describe("validateRelease — the unfillable 7–9 confirm gate", () => {
  // Drop ALL 5 DEF + a FWD → leaves GK1-2 / DEF0 / MID1-5 / FWD1-2 = 2/0/5/2 = 9: an EMPTY DEF lane can
  // field no shape (every playoff shape needs ≥1 per line). Under the loosened 1/1/1 bounds an empty lane
  // (or <6 outfield bodies) is the ONLY way to be unfillable — a merely-thin lane (≥1) now fills.
  const dropIds = ["DEF1", "DEF2", "DEF3", "DEF4", "DEF5", "FWD3"];

  it("soft-warns (needs confirm) when the 7–9 end state cannot field a playoff XI", () => {
    const v = validateRelease({ ...base, dropIds });
    expect(v).toMatchObject({ code: "release-unfillable", postCount: 9 });
  });

  it("allows the same release once the unfillable state is confirmed", () => {
    const v = validateRelease({ ...base, dropIds, confirmedUnfillable: true });
    expect(v).toBeNull();
  });
});

describe("validateRelease — cap band (allow any 7..9, no forced 9) + over-cap progress", () => {
  it("allows an end state strictly between 7 and 9 (does not force exactly 9)", () => {
    // drop 7 → leaves 8: GK1, DEF1-3, MID1-3, FWD1 = 1/3/3/1 = 8 (fields 3-2-1/2-3-1)
    const v = validateRelease({
      ...base,
      dropIds: ["GK2", "DEF4", "DEF5", "MID4", "MID5", "FWD2", "FWD3"],
    });
    expect(v).toBeNull();
  });

  it("allows a partial trim that is still over cap (no fillability check above the cap)", () => {
    // drop 2 → leaves 13 (> cap): valid progress; fillability only applies once in the 7..9 band
    const v = validateRelease({ ...base, dropIds: ["GK2", "FWD3"] });
    expect(v).toBeNull();
  });
});

describe("validateRelease — lock scoping (the trim window)", () => {
  const dropIds = ["GK2", "DEF4", "DEF5", "MID4", "MID5", "FWD3"];

  it("during the R32 trim window (no locks) every survivor is droppable", () => {
    expect(validateRelease({ ...base, dropIds, lockedPlayerIds: new Set() })).toBeNull();
  });

  it("later, a played-R32 player is un-droppable (in the locked set)", () => {
    const v = validateRelease({ ...base, dropIds, lockedPlayerIds: new Set(["DEF4"]) });
    expect(v).toMatchObject({ code: "release-locked", playerId: "DEF4" });
  });
});
