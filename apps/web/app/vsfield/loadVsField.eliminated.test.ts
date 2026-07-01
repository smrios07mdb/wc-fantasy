import { vi, describe, it, expect } from "vitest";

// Mock @app/db so importing the IO edge doesn't need a live Prisma connection (the loadDraftRoom
// convention). We exercise ONLY the exported PURE helper — the IO loader itself stays untested by
// design (it needs a live DB; tsc + the @app/vsfield suite cover the shapes it produces).
vi.mock("@app/db", () => ({ prisma: {} }));

import { filterEliminatedFromField } from "./loadVsField";
import { loadEliminatedManagerIds } from "@app/faab/prisma";
import type { FieldEntry } from "@app/vsfield";

function entry(managerId: string, rank: number): FieldEntry {
  return {
    managerId,
    displayName: managerId,
    isMe: false,
    rank,
    points: 0,
    record: { w: 0, l: 0, d: 0 },
    starters: [],
    counts: { yetToPlay: 0, playing: 0, played: 0, noMatch: 0 },
    h2hVsViewer: null,
  };
}

// CONTRACT-P2/P3: playoff participation is derived from playoff_entry EXISTENCE, never league.status.
// filterEliminatedFromField takes the already-derived id set (built league-wide by the shared
// loadEliminatedManagerIds helper — see the composition suite below) and hides those managers from the
// LIVE field only. This pure filter is unchanged by the data-existence fix.
describe("filterEliminatedFromField — hide eliminated managers, live field only", () => {
  it("removes eliminated managers and re-ranks the remainder 1..N when isLivePeriod", () => {
    const field = [entry("m1", 1), entry("m2", 2), entry("m3", 3), entry("m4", 4)];
    const result = filterEliminatedFromField(field, new Set(["m2"]), true);
    expect(result.map((e) => e.managerId)).toEqual(["m1", "m3", "m4"]);
    expect(result.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it("leaves the field untouched on a prior/historical period (isLivePeriod = false)", () => {
    const field = [entry("m1", 1), entry("m2", 2)];
    const result = filterEliminatedFromField(field, new Set(["m2"]), false);
    expect(result).toBe(field);
  });

  it("leaves the field untouched when no manager is eliminated (group phase — empty set)", () => {
    const field = [entry("m1", 1), entry("m2", 2)];
    const result = filterEliminatedFromField(field, new Set(), true);
    expect(result).toBe(field);
  });

  it("hides the viewer's own row too if the viewer themself is eliminated", () => {
    const field = [entry("me", 1), entry("opp", 2)];
    const result = filterEliminatedFromField(field, new Set(["me"]), true);
    expect(result.map((e) => e.managerId)).toEqual(["opp"]);
    expect(result[0]?.rank).toBe(1);
  });
});

/**
 * The end-to-end vsfield surface: the LIVE-field hide-set is DERIVED (data-existence) by the shared
 * loadEliminatedManagerIds helper and fed into filterEliminatedFromField. This is the fix's contract —
 * the set must catch a group-phase NON-ADVANCER (no playoff_entry row, status NULL) once the playoff phase
 * is active, and must be EMPTY during the group phase so the field is never blanked.
 */
type ElimDb = Parameters<typeof loadEliminatedManagerIds>[0];
function elimDb(entries: { managerId: string; status: string }[], managerIds: string[]): ElimDb {
  return {
    playoffEntry: {
      count: async () => entries.length,
      findMany: async (args: { where: { status?: { in: string[] } } }) => {
        const wanted = args.where.status?.in;
        return entries
          .filter((e) => (wanted ? wanted.includes(e.status) : true))
          .map((e) => ({ managerId: e.managerId }));
      },
    },
    manager: { findMany: async () => managerIds.map((id) => ({ id })) },
  } as unknown as ElimDb;
}

const fieldOf = (...ids: string[]): FieldEntry[] => ids.map((id, i) => entry(id, i + 1));

describe("vsfield hide-set — loadEliminatedManagerIds feeds filterEliminatedFromField (data-existence)", () => {
  it("hides a group-phase NON-ADVANCER (no playoff_entry row) once the playoff phase is active", async () => {
    // Phase active: survivors m1,m2 hold alive rows; m3 never advanced (no row). The old status='eliminated'
    // read would leave m3 on the field; the data-existence set must remove him.
    const db = elimDb(
      [
        { managerId: "m1", status: "alive" },
        { managerId: "m2", status: "alive" },
      ],
      ["m1", "m2", "m3"],
    );
    const eliminated = await loadEliminatedManagerIds(db, "L");
    const out = filterEliminatedFromField(fieldOf("m1", "m2", "m3"), eliminated, true);
    expect(out.map((e) => e.managerId)).toEqual(["m1", "m2"]);
    expect(out.map((e) => e.rank)).toEqual([1, 2]); // re-ranked 1..N after the removal
  });

  it("hides a mid-playoff guillotine (status='eliminated') too, keeping only survivors", async () => {
    const db = elimDb(
      [
        { managerId: "m1", status: "alive" },
        { managerId: "m2", status: "eliminated" },
      ],
      ["m1", "m2"],
    );
    const eliminated = await loadEliminatedManagerIds(db, "L");
    const out = filterEliminatedFromField(fieldOf("m1", "m2"), eliminated, true);
    expect(out.map((e) => e.managerId)).toEqual(["m1"]);
  });

  it("blanks NOBODY during the group phase — no playoff_entry rows → empty set → field untouched", async () => {
    // The field-blanking guard: pre-transition the phase is inactive, so every manager survives even though
    // none is 'alive' yet.
    const db = elimDb([], ["m1", "m2", "m3"]);
    const eliminated = await loadEliminatedManagerIds(db, "L");
    expect(eliminated.size).toBe(0);
    const field = fieldOf("m1", "m2", "m3");
    expect(filterEliminatedFromField(field, eliminated, true)).toEqual(field);
  });

  it("keeps the CHAMPION on the live field at Final-advance-before-tick — field is NOT fully blanked", async () => {
    // The sub-60s window the champion=alive-equivalent rule closes: the manual Final cut has crowned the
    // champion (alive→champion) and everyone else is eliminated, but the ~60s worker tick hasn't closed the
    // Final period yet, so isLivePeriod is still true. A strict alive-only set would mark EVERYONE eliminated
    // (zero alive rows) and blank the whole leaderboard; counting champion as a survivor keeps the winner.
    const db = elimDb(
      [
        { managerId: "champ", status: "champion" },
        { managerId: "l1", status: "eliminated" },
        { managerId: "l2", status: "eliminated" },
      ],
      ["champ", "l1", "l2"],
    );
    const eliminated = await loadEliminatedManagerIds(db, "L");
    const out = filterEliminatedFromField(fieldOf("champ", "l1", "l2"), eliminated, true);
    expect(out.map((e) => e.managerId)).toEqual(["champ"]); // NOT empty — champion remains, re-ranked to 1
    expect(out.map((e) => e.rank)).toEqual([1]);
  });
});
