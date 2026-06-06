import { describe, it, expect } from "vitest";
import { selectAutopick, orderDraftPool, type AutopickInput, type PoolPlayer } from "./autopick";
import { EMPTY_COUNTS } from "./roster";

/** Build an input with sensible defaults (everything available, empty squad) overridden per test. */
function input(over: Partial<AutopickInput>): AutopickInput {
  return {
    queue: [],
    ranking: [],
    counts: EMPTY_COUNTS,
    isAvailable: () => true,
    ...over,
  };
}

describe("selectAutopick — queue first, then best-available fallback", () => {
  it("takes the first queue entry (stored priority order) that is available and position-legal", () => {
    const playerId = selectAutopick(
      input({
        queue: [
          { playerId: "p-keane", position: "MID" },
          { playerId: "p-vieira", position: "MID" },
        ],
      }),
    );
    expect(playerId).toBe("p-keane");
  });

  it("walks the queue in its stored order and returns the FIRST eligible (skips taken, no re-sort)", () => {
    const playerId = selectAutopick(
      input({
        queue: [
          { playerId: "p-taken", position: "MID" },
          { playerId: "p-free", position: "MID" },
          { playerId: "p-also-free", position: "MID" },
        ],
        isAvailable: (id) => id !== "p-taken",
      }),
    );
    expect(playerId).toBe("p-free");
  });

  it("skips a queue entry whose position bucket is already full", () => {
    const playerId = selectAutopick(
      input({
        queue: [
          { playerId: "p-fwd", position: "FWD" },
          { playerId: "p-mid", position: "MID" },
        ],
        counts: { GK: 0, DEF: 0, MID: 0, FWD: 3 }, // FWD bucket is full (cap 3)
      }),
    );
    expect(playerId).toBe("p-mid");
  });

  it("falls back to best-available by ranking when the queue yields nobody eligible", () => {
    const playerId = selectAutopick(
      input({
        queue: [{ playerId: "p-taken", position: "MID" }],
        isAvailable: (id) => id !== "p-taken",
        ranking: [
          { playerId: "p-best", position: "DEF" },
          { playerId: "p-next", position: "DEF" },
        ],
      }),
    );
    expect(playerId).toBe("p-best");
  });

  it("falls back to ranking when the manager has NO queue at all", () => {
    const playerId = selectAutopick(
      input({
        ranking: [
          { playerId: "p-best", position: "FWD" },
          { playerId: "p-next", position: "FWD" },
        ],
      }),
    );
    expect(playerId).toBe("p-best");
  });

  it("filters the ranking fallback by availability and legality too", () => {
    const playerId = selectAutopick(
      input({
        ranking: [
          { playerId: "p-taken", position: "DEF" }, // unavailable
          { playerId: "p-full", position: "GK" }, // GK bucket full
          { playerId: "p-ok", position: "DEF" }, // the winner
        ],
        isAvailable: (id) => id !== "p-taken",
        counts: { GK: 2, DEF: 0, MID: 0, FWD: 0 },
      }),
    );
    expect(playerId).toBe("p-ok");
  });

  it("returns null when nobody is eligible anywhere (the stall edge)", () => {
    const playerId = selectAutopick(
      input({
        queue: [{ playerId: "p-taken", position: "MID" }],
        ranking: [{ playerId: "p-taken", position: "MID" }],
        isAvailable: () => false,
      }),
    );
    expect(playerId).toBeNull();
  });
});

describe("orderDraftPool — default_rank ASC, NULLS LAST, then playerId ASC (the total order)", () => {
  const p = (playerId: string, defaultRank: number | null): PoolPlayer => ({
    playerId,
    position: "MID",
    defaultRank,
  });

  it("orders ranked players by ascending default_rank", () => {
    const ordered = orderDraftPool([p("p3", 3), p("p1", 1), p("p2", 2)]);
    expect(ordered.map((r) => r.playerId)).toEqual(["p1", "p2", "p3"]);
  });

  it("places unranked (default_rank null) players AFTER every ranked one (NULLS LAST)", () => {
    // null id is alphabetically first, yet rank must win: ranked precedes unranked.
    const ordered = orderDraftPool([p("aaa-unranked", null), p("zzz-ranked", 1)]);
    expect(ordered.map((r) => r.playerId)).toEqual(["zzz-ranked", "aaa-unranked"]);
  });

  it("breaks ties among unranked players by ascending playerId (the stable final tiebreak)", () => {
    // The original mock-draft pick-1 stick: an all-unranked pool. It must NOT collapse to empty —
    // it orders deterministically by id, so autopick always has a candidate.
    const ordered = orderDraftPool([p("p-c", null), p("p-a", null), p("p-b", null)]);
    expect(ordered.map((r) => r.playerId)).toEqual(["p-a", "p-b", "p-c"]);
  });

  it("breaks ties among equally-ranked players by ascending playerId", () => {
    const ordered = orderDraftPool([p("p-y", 5), p("p-x", 5)]);
    expect(ordered.map((r) => r.playerId)).toEqual(["p-x", "p-y"]);
  });

  it("carries the player's position through and never drops or invents a player", () => {
    const ordered = orderDraftPool([
      { playerId: "gk", position: "GK", defaultRank: null },
      { playerId: "fwd", position: "FWD", defaultRank: 1 },
    ]);
    expect(ordered).toEqual([
      { playerId: "fwd", position: "FWD" },
      { playerId: "gk", position: "GK" },
    ]);
  });

  it("does not mutate its input", () => {
    const pool = [p("p2", 2), p("p1", 1)];
    const snapshot = [...pool];
    orderDraftPool(pool);
    expect(pool).toEqual(snapshot);
  });
});
