/**
 * Pure presentational/derivation helpers for the /playoffs guillotine theater (Phase 4). These are the
 * ONLY logic the screen carries — the server-computed `PlayoffsView` (@app/recompute `buildPlayoffsView`)
 * owns all classification; these helpers just turn its ranked rows + the reused reduced lineup into render
 * inputs. No IO, no DOM, no clock. The cut margin in particular is DERIVED here from the ranked rows (the
 * view exposes no margin field) — including the live boundary-tie case the design must not crash on.
 */
import { describe, it, expect } from "vitest";
import type { RankedRow } from "@app/recompute";
import type { SetLineupState } from "../lineup/types";
import { cutBoundaryIndex, myMargin, buildReducedPitch, meName } from "./theaterView";

const row = (
  managerId: string,
  rank: number,
  points: number,
  state: RankedRow["state"],
  seed = rank,
): RankedRow => ({ managerId, seed, points, rank, state });

describe("meName — viewer reads 'You', others read the names map", () => {
  const names = { m1: "Alice", m2: "Bob" };
  it("renders 'You' for the viewer regardless of the names map", () => {
    expect(meName(names, "m1", "m1")).toBe("You");
  });
  it("renders the mapped display name for another manager", () => {
    expect(meName(names, "m1", "m2")).toBe("Bob");
  });
  it("falls back to an em-dash when a name is missing (never crashes / never a bare id)", () => {
    expect(meName(names, "m1", "ghost")).toBe("—");
  });
});

describe("cutBoundaryIndex — where the guillotine line is drawn (first non-safe row)", () => {
  it("returns the index of the first cut row in a points-desc list", () => {
    // safe, safe | zone  → line before index 2
    const ranked = [row("a", 1, 30, "safe"), row("b", 2, 20, "safe"), row("c", 3, 10, "zone")];
    expect(cutBoundaryIndex(ranked)).toBe(2);
  });
  it("returns ranked.length when everyone is safe (no blade)", () => {
    const ranked = [row("a", 1, 30, "safe"), row("b", 2, 20, "safe")];
    expect(cutBoundaryIndex(ranked)).toBe(2);
  });
  it("returns 0 when the top row is already cut", () => {
    expect(cutBoundaryIndex([row("a", 1, 10, "zone")])).toBe(0);
  });
  it("on a live boundary tie (whole tied set is 'zone') draws the line before the WHOLE set", () => {
    // 1 safe, then a 3-way tie all marked zone (the unbroken-tie widening) → line before index 1.
    const ranked = [
      row("a", 1, 30, "safe"),
      row("b", 2, 10, "zone"),
      row("c", 3, 10, "zone"),
      row("d", 4, 10, "zone"),
    ];
    expect(cutBoundaryIndex(ranked)).toBe(1);
  });
});

describe("myMargin — the viewer's distance to the blade (derived, no margin field on the view)", () => {
  const ranked = [
    row("a", 1, 40, "safe"),
    row("b", 2, 30, "safe"),
    row("c", 3, 20, "zone"),
    row("d", 4, 10, "zone"),
  ];

  it("a SAFE viewer is clear of the first cut by (me − firstCut)", () => {
    expect(myMargin(ranked, "b")).toEqual({ safe: true, gap: 10, rivalId: "c" });
  });

  it("a ZONE viewer is short of the last survivor by (lastSafe − me)", () => {
    expect(myMargin(ranked, "c")).toEqual({ safe: false, gap: 10, rivalId: "b" });
  });

  it("returns null when the viewer is not in the round (eliminated earlier / non-participant)", () => {
    expect(myMargin(ranked, "ghost")).toBeNull();
  });

  it("returns null when there is no cut at all (everyone safe → no blade)", () => {
    const allSafe = [row("a", 1, 40, "safe"), row("b", 2, 30, "safe")];
    expect(myMargin(allSafe, "a")).toBeNull();
  });

  it("a boundary tie yields gap 0 ('at the line') without crashing", () => {
    // lowest safe and a tied zone set at equal points → a safe viewer reads gap 0.
    const tie = [row("a", 1, 20, "safe"), row("b", 2, 10, "zone"), row("c", 3, 10, "zone")];
    // 'a' (safe, 20) vs firstCut 'b' (10) → +10 clear.
    expect(myMargin(tie, "a")).toEqual({ safe: true, gap: 10, rivalId: "b" });
    // A safe row exactly level with the cut → gap 0 (the screen renders "at the line").
    const level = [row("a", 1, 10, "safe"), row("b", 2, 10, "zone")];
    expect(myMargin(level, "a")).toEqual({ safe: true, gap: 0, rivalId: "b" });
  });
});

// ── reduced pitch (the viewer's own live playoff XI, mapped from SetLineupState) ──────────────
function lineupState(over: Partial<SetLineupState> = {}): SetLineupState {
  return {
    sessionManagerId: "me",
    displayName: "Me",
    squad: [
      {
        id: "gk",
        displayName: "Keeper",
        firstName: "Gigi",
        lastName: "Buffon",
        position: "GK",
        country: "Italy",
      },
      {
        id: "d1",
        displayName: "Back",
        firstName: "Virgil",
        lastName: "van Dijk",
        position: "DEF",
        country: "Netherlands",
      },
      {
        id: "d2",
        displayName: "Back2",
        firstName: "Sergio",
        lastName: "Ramos",
        position: "DEF",
        country: "Spain",
      },
      {
        id: "m1",
        displayName: "Mid",
        firstName: "Luka",
        lastName: "Modric",
        position: "MID",
        country: "Croatia",
      },
      {
        id: "m2",
        displayName: "Mid2",
        firstName: "Kevin",
        lastName: "De Bruyne",
        position: "MID",
        country: "Belgium",
      },
      {
        id: "m3",
        displayName: "Mid3",
        firstName: "Toni",
        lastName: "Kroos",
        position: "MID",
        country: "Germany",
      },
      {
        id: "f1",
        displayName: "Fwd",
        firstName: "Kylian",
        lastName: "Mbappe",
        position: "FWD",
        country: "France",
      },
      {
        id: "b1",
        displayName: "Bench",
        firstName: "Sub",
        lastName: "One",
        position: "MID",
        country: "Brazil",
      },
      {
        id: "b2",
        displayName: "Bench2",
        firstName: "Sub",
        lastName: "Two",
        position: "FWD",
        country: "Portugal",
      },
    ],
    periods: [
      {
        periodId: "R16",
        label: "R16",
        kind: "knockout_round",
        status: "open",
        closesAt: null,
        starterIds: ["gk", "d1", "d2", "m1", "m2", "m3", "f1"],
        locks: [{ playerId: "f1", isStarter: true }],
        slotMeta: {
          f1: { hasPlayed: true, pointsAtStake: 9, voided: false, movable: false },
          d1: { hasPlayed: true, pointsAtStake: 4, voided: false, movable: true },
          gk: { hasPlayed: false, pointsAtStake: 0, voided: false, movable: true },
        },
        kickoffByPlayer: {},
        opponentByPlayer: {},
      },
    ],
    activePeriodId: "R16",
    timezone: "UTC",
    ...over,
  };
}

describe("buildReducedPitch — maps the viewer's playoff XI to the pitch model", () => {
  it("returns null when there is no reduced lineup at all", () => {
    expect(buildReducedPitch(null)).toBeNull();
  });

  it("returns null when no knockout_round period is present (group window only)", () => {
    const groupOnly = lineupState({
      periods: [
        {
          periodId: "MD9",
          label: "MD9",
          kind: "group_md",
          status: "open",
          closesAt: null,
          starterIds: ["gk"],
          locks: [],
          slotMeta: {},
          kickoffByPlayer: {},
          opponentByPlayer: {},
        },
      ],
      activePeriodId: "MD9",
    });
    expect(buildReducedPitch(groupOnly)).toBeNull();
  });

  it("groups the 7 starters into FWD→GK lanes and lists the bench as the squad minus starters", () => {
    const pitch = buildReducedPitch(lineupState())!;
    expect(pitch.lanes.map((l) => l.pos)).toEqual(["FWD", "MID", "DEF", "GK"]);
    expect(pitch.lanes.find((l) => l.pos === "MID")!.nodes.map((n) => n.id)).toEqual([
      "m1",
      "m2",
      "m3",
    ]);
    expect(pitch.bench.map((n) => n.id)).toEqual(["b1", "b2"]);
  });

  it("marks a node locked when it is in locks OR has a score row, with live points from pointsAtStake", () => {
    const pitch = buildReducedPitch(lineupState())!;
    const f1 = pitch.lanes.find((l) => l.pos === "FWD")!.nodes.find((n) => n.id === "f1")!;
    expect(f1).toMatchObject({ locked: true, points: 9 }); // in locks AND has a score row
    const d1 = pitch.lanes.find((l) => l.pos === "DEF")!.nodes.find((n) => n.id === "d1")!;
    expect(d1).toMatchObject({ locked: true, points: 4 }); // hasPlayed (score row) even though not in locks
    const gk = pitch.lanes.find((l) => l.pos === "GK")!.nodes[0]!;
    expect(gk).toMatchObject({ locked: false, points: 0 }); // movable, no points yet
  });

  it("derives a name (first-initial + surname) and carries the country for the kit/flag", () => {
    const pitch = buildReducedPitch(lineupState())!;
    const gk = pitch.lanes.find((l) => l.pos === "GK")!.nodes[0]!;
    expect(gk.name).toBe("G. Buffon");
    expect(gk.country).toBe("Italy");
  });

  it("summarises movable vs locked counts over the starters", () => {
    const pitch = buildReducedPitch(lineupState())!;
    // 7 starters: f1 + d1 locked (2), the other 5 movable.
    expect(pitch.starters).toBe(7);
    expect(pitch.locked).toBe(2);
    expect(pitch.movable).toBe(5);
  });
});
