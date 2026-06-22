/**
 * Proof for T11 R2 / Fix B-2: a settled FAAB batch's results are regrouped from one-row-per-bid
 * into one-entry-per-CONTESTED-PLAYER, with ALL bids (winners + losers + voids) beneath that player
 * so the whole contest reads at a glance. `groupResultsByPlayer` is the pure presentation regroup —
 * no new query, the loader already hands every winning + losing bid. These lock its contract.
 */
import { describe, it, expect } from "vitest";
import { groupResultsByPlayer } from "./waiversLogic";
import type { WvPlayer, WvResult } from "./types";

function player(id: string, over: Partial<WvPlayer> = {}): WvPlayer {
  return {
    id,
    name: over.name ?? id,
    shortName: over.shortName ?? id,
    position: over.position ?? "MID",
    nation: over.nation ?? null,
    teamName: over.teamName ?? null,
    kickoffAt: over.kickoffAt ?? null,
    seasonPoints: over.seasonPoints ?? null,
  };
}

const NMECHA = player("nmecha", { name: "Felix Nmecha", shortName: "F. Nmecha" });
const HAALAND = player("haaland", { name: "Erling Haaland", shortName: "E. Haaland" });

// Live screenshot scenario: Nmecha is contested twice (Jager FC WON $15 dropping Ugarte;
// yader.rosales LOST $7); Haaland is a single uncontested win. Order is deliberately scrambled.
const RESULTS: WvResult[] = [
  {
    bidId: "b-nmecha-lost",
    managerId: "m2",
    managerName: "yader.rosales",
    isMine: false,
    add: NMECHA,
    drop: null,
    amount: 7,
    outcome: "lost",
  },
  {
    bidId: "b-haaland-won",
    managerId: "m3",
    managerName: "Rivera",
    isMine: false,
    add: HAALAND,
    drop: null,
    amount: 30,
    outcome: "won",
  },
  {
    bidId: "b-nmecha-won",
    managerId: "m1",
    managerName: "Jager FC",
    isMine: true,
    add: NMECHA,
    drop: player("ugarte", { name: "Manuel Ugarte", shortName: "M. Ugarte" }),
    amount: 15,
    outcome: "won",
  },
];

describe("groupResultsByPlayer — one entry per contested player", () => {
  it("collapses a player's multiple bids into a single group", () => {
    const groups = groupResultsByPlayer(RESULTS);
    // Two distinct players → two groups, Nmecha appears ONCE not twice.
    expect(groups.length).toBe(2);
    const nmechaGroups = groups.filter((g) => g.playerId === "nmecha");
    expect(nmechaGroups.length).toBe(1);
    expect(nmechaGroups[0]?.results.length).toBe(2);
  });

  it("orders bids within a player amount-desc (winner on top)", () => {
    const nmecha = groupResultsByPlayer(RESULTS).find((g) => g.playerId === "nmecha")!;
    expect(nmecha.results.map((r) => r.amount)).toEqual([15, 7]);
    expect(nmecha.results[0]?.outcome).toBe("won");
    expect(nmecha.results[1]?.outcome).toBe("lost");
    // The dropped-player detail rides on the winning bid (the $15 row dropped Ugarte).
    expect(nmecha.results[0]?.drop?.id).toBe("ugarte");
  });

  it("carries the player's identity on the group from the top bid", () => {
    const nmecha = groupResultsByPlayer(RESULTS).find((g) => g.playerId === "nmecha")!;
    expect(nmecha.add.shortName).toBe("F. Nmecha");
  });

  it("orders groups by their top-bid amount desc (highest-stakes contest first)", () => {
    const groups = groupResultsByPlayer(RESULTS);
    expect(groups.map((g) => g.playerId)).toEqual(["haaland", "nmecha"]); // 30 before 15
  });

  it("loses no bid — every result lands in exactly one group", () => {
    const groups = groupResultsByPlayer(RESULTS);
    const flat = groups.flatMap((g) => g.results.map((r) => r.bidId));
    expect(flat.sort()).toEqual(["b-haaland-won", "b-nmecha-lost", "b-nmecha-won"]);
  });

  it("is empty-safe", () => {
    expect(groupResultsByPlayer([])).toEqual([]);
  });
});
