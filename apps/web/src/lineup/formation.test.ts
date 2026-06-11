import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Position } from "@app/shared";
import {
  GROUP_FORMATIONS,
  rosterCounts,
  formationFillable,
  formationLockLegal,
  offeredFormations,
  reshapeToFormation,
  formationKeyOf,
  defaultFormationKey,
  defaultStarterIds,
  evaluateProposal,
} from "./view";
import type { LineupPlayer, PeriodLineup, PeriodLock } from "./types";

const NOW = new Date("2026-06-12T10:00:00.000Z");

function player(id: string, position: Position): LineupPlayer {
  return {
    id,
    displayName: id.toUpperCase(),
    firstName: null,
    lastName: id,
    position,
    country: null,
  };
}

// MR. ZETTA's launch-blocking squad: 1 GK / 3 DEF / 7 MID / 4 FWD = 15. The 4-DEF/5-DEF default
// shapes cannot be filled (only 3 DEF), so a blind 4-3-3/4-4-2 default capped him at 10 starters.
const ZETTA: LineupPlayer[] = [
  player("gk1", "GK"),
  player("d1", "DEF"),
  player("d2", "DEF"),
  player("d3", "DEF"),
  player("m1", "MID"),
  player("m2", "MID"),
  player("m3", "MID"),
  player("m4", "MID"),
  player("m5", "MID"),
  player("m6", "MID"),
  player("m7", "MID"),
  player("f1", "FWD"),
  player("f2", "FWD"),
  player("f3", "FWD"),
  player("f4", "FWD"),
];

// A normal composition (2 GK / 5 DEF / 5 MID / 3 FWD) that comfortably fields the canonical 4-3-3.
const NORMAL: LineupPlayer[] = [
  player("gk1", "GK"),
  player("gk2", "GK"),
  player("d1", "DEF"),
  player("d2", "DEF"),
  player("d3", "DEF"),
  player("d4", "DEF"),
  player("d5", "DEF"),
  player("m1", "MID"),
  player("m2", "MID"),
  player("m3", "MID"),
  player("m4", "MID"),
  player("m5", "MID"),
  player("f1", "FWD"),
  player("f2", "FWD"),
  player("f3", "FWD"),
];

function period(
  squad: LineupPlayer[],
  starterIds: string[],
  locks: PeriodLock[] = [],
): PeriodLineup {
  return {
    periodId: "md1",
    label: "MD1",
    status: "open",
    closesAt: "2026-06-12T18:00:00.000Z",
    starterIds,
    locks,
    kickoffByPlayer: {},
    opponentByPlayer: {},
  };
}

const ok = (squad: LineupPlayer[], xi: string[], locks: PeriodLock[] = []) =>
  evaluateProposal(squad, period(squad, xi, locks), xi, NOW).ok;

describe("formationFillable — a formation a squad can actually field (roster supply)", () => {
  it("requires a keeper and enough of each outfield position", () => {
    const counts = rosterCounts(ZETTA); // {GK1, DEF3, MID7, FWD4}
    expect(formationFillable(counts, GROUP_FORMATIONS["3-4-3"])).toBe(true); // DEF3 MID4 FWD3
    expect(formationFillable(counts, GROUP_FORMATIONS["3-5-2"])).toBe(true); // DEF3 MID5 FWD2
    expect(formationFillable(counts, GROUP_FORMATIONS["4-3-3"])).toBe(false); // needs 4 DEF
    expect(formationFillable(counts, GROUP_FORMATIONS["5-3-2"])).toBe(false); // needs 5 DEF
  });

  it("a keeperless squad fills nothing (GK >= 1 is required)", () => {
    const keeperless = ZETTA.filter((p) => p.position !== "GK");
    const counts = rosterCounts(keeperless);
    for (const key of Object.keys(GROUP_FORMATIONS)) {
      expect(
        formationFillable(counts, GROUP_FORMATIONS[key as keyof typeof GROUP_FORMATIONS]),
      ).toBe(false);
    }
  });
});

describe("offeredFormations — fillable ∩ lock-legal (what the picker surfaces)", () => {
  it("for a 3-DEF squad offers ONLY {3-4-3, 3-5-2} — every 4/5-DEF shape is excluded", () => {
    const offered = offeredFormations(ZETTA, []);
    expect(offered).toEqual(["3-4-3", "3-5-2"]);
  });

  it("drops a shape that would force a LOCKED starter off the pitch (lock-legal filter)", () => {
    // Lock all five MID starters (a played 3-5-2 midfield). Only shapes with MID >= 5 stay legal; of
    // those, 4-5-1 isn't fillable (needs 4 DEF) — so 3-5-2 is the only remaining offer.
    const locks: PeriodLock[] = ["m1", "m2", "m3", "m4", "m5"].map((id) => ({
      playerId: id,
      isStarter: true,
    }));
    expect(offeredFormations(ZETTA, locks)).toEqual(["3-5-2"]);
    // and the lock is the reason 3-4-3 is gone — without the lock it would be offered:
    expect(offeredFormations(ZETTA, [])).toContain("3-4-3");
  });
});

describe("formationLockLegal — a played starter can never be benched by a reshape", () => {
  it("rejects a formation whose position count is below the locked-starter count there", () => {
    const locks: PeriodLock[] = ["m1", "m2", "m3", "m4", "m5"].map((id) => ({
      playerId: id,
      isStarter: true,
    }));
    expect(formationLockLegal(GROUP_FORMATIONS["3-4-3"], locks, ZETTA)).toBe(false); // MID4 < 5 locked
    expect(formationLockLegal(GROUP_FORMATIONS["3-5-2"], locks, ZETTA)).toBe(true); // MID5 >= 5
  });
});

describe("default formation — first fillable, canonical 4-3-3 preferred (the 'got 10' regression)", () => {
  it("a 3-DEF squad opens on 3-4-3 (not a blind 4-3-3) and fields a COMPLETE, legal, savable XI", () => {
    expect(defaultFormationKey(rosterCounts(ZETTA))).toBe("3-4-3");
    const xi = defaultStarterIds(ZETTA);
    expect(xi).toHaveLength(11); // was 10 before the fix → "starting XI must have exactly 11 (got 10)"
    expect(formationKeyOf(ZETTA, xi)).toBe("3-4-3"); // 1 GK / 3 DEF / 4 MID / 3 FWD
    expect(ok(ZETTA, xi)).toBe(true); // validates against the SAME gate the server enforces
  });

  it("a normal 4+-DEF squad still defaults to and saves 4-3-3 (no regression)", () => {
    expect(defaultFormationKey(rosterCounts(NORMAL))).toBe("4-3-3");
    const xi = defaultStarterIds(NORMAL);
    expect(xi).toHaveLength(11);
    expect(formationKeyOf(NORMAL, xi)).toBe("4-3-3");
    expect(ok(NORMAL, xi)).toBe(true);
  });
});

describe("formationKeyOf — a persisted lineup keeps its OWN shape (not the default)", () => {
  it("reads a saved 3-5-2 as 3-5-2, never overridden by the 3-4-3 default", () => {
    const saved352 = ["gk1", "d1", "d2", "d3", "m1", "m2", "m3", "m4", "m5", "f1", "f2"];
    expect(formationKeyOf(ZETTA, saved352)).toBe("3-5-2");
    expect(formationKeyOf(ZETTA, saved352)).not.toBe(defaultFormationKey(rosterCounts(ZETTA)));
    expect(ok(ZETTA, saved352)).toBe(true);
  });
});

describe("reshapeToFormation — keeps locks, fills shortages, stays immediately savable", () => {
  it("reshapes a 3-DEF squad 3-4-3 → 3-5-2 into a complete, legal XI", () => {
    const xi = reshapeToFormation(ZETTA, defaultStarterIds(ZETTA), [], GROUP_FORMATIONS["3-5-2"]);
    expect(xi).toHaveLength(11);
    expect(formationKeyOf(ZETTA, xi)).toBe("3-5-2");
    expect(ok(ZETTA, xi)).toBe(true);
  });

  it("keeps a LOCKED starter on the pitch across a reshape", () => {
    const start = defaultStarterIds(ZETTA); // 3-4-3
    const locks: PeriodLock[] = [{ playerId: "d1", isStarter: true }];
    const xi = reshapeToFormation(ZETTA, start, locks, GROUP_FORMATIONS["3-5-2"]);
    expect(xi).toContain("d1");
    expect(xi).toHaveLength(11);
    expect(ok(ZETTA, xi, locks)).toBe(true);
  });

  it("never PROMOTES a locked bench player (a played reserve stays benched)", () => {
    const start = defaultStarterIds(ZETTA); // 3-4-3 → MID starters m1..m4, bench MID m5,m6,m7
    const locks: PeriodLock[] = [{ playerId: "m5", isStarter: false }]; // m5 played from the bench
    const xi = reshapeToFormation(ZETTA, start, locks, GROUP_FORMATIONS["3-5-2"]); // MID 4 → 5
    expect(xi).not.toContain("m5"); // not promoted
    expect(xi).toContain("m6"); // a MOVABLE bench MID filled the new slot
    expect(xi).toHaveLength(11);
    expect(ok(ZETTA, xi, locks)).toBe(true);
  });
});

// Source-contract smoke for the UI wiring (the repo has no DOM/JSX test transform — mirrors
// setLineup.test.ts). Confirms the FormationPicker control exists and the client reshapes through it.
const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "../../app");
const readApp = (rel: string) => readFileSync(resolve(appDir, rel), "utf8");

describe("FormationPicker wiring — the carried reshape TODO is closed", () => {
  const client = readApp("lineup/SetLineupClient.tsx");
  const components = readApp("lineup/components.tsx");
  const css = readApp("lineup/lineup.css");

  it("exposes a FormationPicker control rendered on the screen", () => {
    expect(components).toContain("export function FormationPicker(");
    expect(client).toContain("<FormationPicker");
  });

  it("changes formation by reshaping the starters (not a new write path) and re-running legality", () => {
    expect(client).toContain("reshapeToFormation(");
    expect(client).toContain("offeredFormations(");
    // the ONE save path is unchanged — still the gated submitLineup
    expect(client).toContain("submitLineup(");
  });

  it("the picker CSS stays token-only (no literal hex, no gold) per the body invariant", () => {
    expect(css).toContain("sl-formation");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(css).not.toContain("gold");
  });
});
