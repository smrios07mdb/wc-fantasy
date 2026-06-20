import { vi, describe, it, expect } from "vitest";

// Mock @app/db so importing the IO edge doesn't need a live Prisma connection (the loadDraftRoom /
// playerPointsLookup convention). We exercise ONLY the exported PURE helper — the IO loader itself stays
// untested by design (it needs a live DB; tsc + the @app/vsfield suite cover the shapes it produces).
vi.mock("@app/db", () => ({ prisma: {} }));

import { groupBenchesByManager, type BenchSlotRow } from "./loadVsField";

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
    player: over.player ?? { displayName: over.playerId, team: { name: "Brazil" } },
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
        player: { displayName: "Ronaldo", team: { name: "Portugal" } },
      }),
      row({ managerId: "m1", playerId: "p2", player: { displayName: "Nomad", team: null } }),
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
