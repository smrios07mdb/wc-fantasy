import { vi, describe, it, expect } from "vitest";

// Mock @app/db so importing the IO edge doesn't need a live Prisma connection (the loadDraftRoom
// convention). We exercise ONLY the exported PURE helper — the IO loader itself stays untested by
// design (it needs a live DB; tsc + the @app/vsfield suite cover the shapes it produces).
vi.mock("@app/db", () => ({ prisma: {} }));

import { filterEliminatedFromField } from "./loadVsField";
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

// CONTRACT-P3: playoff participation reads from playoff_entry (status='eliminated'), never
// league.status. Hiding eliminated managers is scoped to the LIVE field only.
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
