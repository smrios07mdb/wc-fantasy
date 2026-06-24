import { vi, describe, it, expect } from "vitest";
import type { StarterState } from "@app/vsfield";

// Mock @app/db so importing the IO edge doesn't need a live Prisma connection (the loadDraftRoom /
// playerPointsLookup convention). We exercise ONLY the exported PURE helper — the IO loader itself stays
// untested by design (it needs a live DB; tsc + the @app/vsfield suite cover the shapes it produces).
vi.mock("@app/db", () => ({ prisma: {} }));

import { groupBenchesByManager, playerPointsLookup, type BenchSlotRow } from "./loadVsField";

// The bench sibling is composed from the SAME current-period lineup read the loader already does (now
// reading `is_starter = false` rows too); buildVsField (the @app/vsfield engine) never sees the bench.
// This is that partition/sort in isolation.
function row(
  over: Partial<BenchSlotRow> & Pick<BenchSlotRow, "managerId" | "playerId">,
): BenchSlotRow {
  return {
    managerId: over.managerId,
    playerId: over.playerId,
    isStarter: over.isStarter ?? false,
    role: over.role ?? "MID",
    player: over.player ?? { teamId: null, displayName: over.playerId, team: { name: "Brazil" } },
  };
}

describe("groupBenchesByManager — bench partition / per-manager grouping / GK→FWD order", () => {
  it("excludes starters (is_starter = true never reaches the bench)", () => {
    const benches = groupBenchesByManager([
      row({ managerId: "m1", playerId: "starter", isStarter: true }),
      row({ managerId: "m1", playerId: "sub", isStarter: false }),
    ]);
    expect(benches).toHaveLength(1);
    expect(benches[0]!.players.map((p) => p.playerId)).toEqual(["sub"]);
  });

  it("groups bench players by manager (one entry per manager with a bench)", () => {
    const benches = groupBenchesByManager([
      row({ managerId: "m1", playerId: "a" }),
      row({ managerId: "m2", playerId: "b" }),
      row({ managerId: "m1", playerId: "c" }),
    ]);
    const byMgr = Object.fromEntries(
      benches.map((b) => [b.managerId, b.players.map((p) => p.playerId)]),
    );
    expect(byMgr["m1"]).toEqual(["a", "c"]);
    expect(byMgr["m2"]).toEqual(["b"]);
  });

  it("orders each bench GK → DEF → MID → FWD regardless of read order", () => {
    const benches = groupBenchesByManager([
      row({ managerId: "m1", playerId: "fwd", role: "FWD" }),
      row({ managerId: "m1", playerId: "gk", role: "GK" }),
      row({ managerId: "m1", playerId: "mid", role: "MID" }),
      row({ managerId: "m1", playerId: "def", role: "DEF" }),
    ]);
    expect(benches[0]!.players.map((p) => p.playerId)).toEqual(["gk", "def", "mid", "fwd"]);
  });

  it("maps name from display_name and nation from the team join (null when no team link)", () => {
    const benches = groupBenchesByManager([
      row({
        managerId: "m1",
        playerId: "p1",
        player: { teamId: "t1", displayName: "Ronaldo", team: { name: "Portugal" } },
      }),
      row({
        managerId: "m1",
        playerId: "p2",
        player: { teamId: null, displayName: "Nomad", team: null },
      }),
    ]);
    const [a, b] = benches[0]!.players;
    expect(a).toMatchObject({ playerId: "p1", name: "Ronaldo", nation: "Portugal" });
    expect(b).toMatchObject({ playerId: "p2", name: "Nomad", nation: null });
  });

  it("empty input → empty benches; an all-starters read → no bench entries", () => {
    expect(groupBenchesByManager([])).toEqual([]);
    expect(
      groupBenchesByManager([row({ managerId: "m1", playerId: "s", isStarter: true })]),
    ).toEqual([]);
  });
});

describe("groupBenchesByManager — T14 bench points + state", () => {
  it("bench player with a score row gets the real points", () => {
    const pts = playerPointsLookup([{ playerId: "sub1", points: 7 }]);
    const benches = groupBenchesByManager([row({ managerId: "m1", playerId: "sub1" })], pts);
    expect(benches[0]!.players[0]).toMatchObject({ playerId: "sub1", points: 7 });
  });

  it("bench player with no score row defaults to 0 pts", () => {
    const pts = playerPointsLookup([]);
    const benches = groupBenchesByManager([row({ managerId: "m1", playerId: "sub1" })], pts);
    expect(benches[0]!.players[0]!.points).toBe(0);
  });

  it("state = 'yet-to-play' when no teamId or no matching match", () => {
    const pts = playerPointsLookup([]);
    const stateMap = new Map<string, StarterState>([["team-a", "played"]]);
    const benches = groupBenchesByManager(
      [
        // teamId null → yet-to-play regardless of stateMap
        row({
          managerId: "m1",
          playerId: "no-team",
          player: { teamId: null, displayName: "X", team: null },
        }),
        // teamId present but not in stateMap → yet-to-play
        row({
          managerId: "m1",
          playerId: "unknown-team",
          player: { teamId: "team-z", displayName: "Y", team: null },
        }),
      ],
      pts,
      stateMap,
    );
    expect(benches[0]!.players[0]!.state).toBe("yet-to-play");
    expect(benches[0]!.players[1]!.state).toBe("yet-to-play");
  });

  it("state = 'playing' when the player's team match is in_progress", () => {
    const pts = playerPointsLookup([{ playerId: "s1", points: 3 }]);
    const stateMap = new Map<string, StarterState>([["team-a", "playing"]]);
    const benches = groupBenchesByManager(
      [
        row({
          managerId: "m1",
          playerId: "s1",
          player: { teamId: "team-a", displayName: "S1", team: { name: "Brazil" } },
        }),
      ],
      pts,
      stateMap,
    );
    expect(benches[0]!.players[0]).toMatchObject({ state: "playing", points: 3 });
  });

  it("state = 'played' when the player's team match is completed", () => {
    const pts = playerPointsLookup([{ playerId: "s1", points: 5 }]);
    const stateMap = new Map<string, StarterState>([["team-b", "played"]]);
    const benches = groupBenchesByManager(
      [
        row({
          managerId: "m1",
          playerId: "s1",
          player: { teamId: "team-b", displayName: "S1", team: { name: "Brazil" } },
        }),
      ],
      pts,
      stateMap,
    );
    expect(benches[0]!.players[0]).toMatchObject({ state: "played", points: 5 });
  });

  it("period correctness: points/state come from the SAME period-scoped lookup (no parallel path)", () => {
    // two bench players on the same team; one has a score row for the period, the other doesn't
    const pts = playerPointsLookup([
      { playerId: "scored", points: 12 },
      // "zero" has no row → defaults to 0
    ]);
    const stateMap = new Map<string, StarterState>([["t1", "played"]]);
    const bench = groupBenchesByManager(
      [
        row({
          managerId: "m",
          playerId: "scored",
          player: { teamId: "t1", displayName: "A", team: { name: "Brazil" } },
        }),
        row({
          managerId: "m",
          playerId: "zero",
          player: { teamId: "t1", displayName: "B", team: { name: "Brazil" } },
        }),
      ],
      pts,
      stateMap,
    )[0]!.players;
    expect(bench.find((p) => p.playerId === "scored")).toMatchObject({
      state: "played",
      points: 12,
    });
    expect(bench.find((p) => p.playerId === "zero")).toMatchObject({ state: "played", points: 0 });
  });
});
