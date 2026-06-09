import { describe, it, expect } from "vitest";
import type { DraftRoomState, DraftPlayer } from "./types";
import {
  buildBoard,
  isMyTurn,
  onTheClockManager,
  roundForPick,
  rosterFor,
  positionCounts,
  filterAvailable,
} from "./board";

const player = (
  id: string,
  p: DraftPlayer["position"],
  over: Partial<DraftPlayer> = {},
): DraftPlayer => ({
  id,
  displayName: id,
  firstName: null,
  lastName: id,
  position: p,
  country: null,
  ...over,
});

function mkState(over: Partial<DraftRoomState> = {}): DraftRoomState {
  return {
    draftId: "d1",
    leagueId: "L1",
    status: "active",
    currentPickNo: 2,
    currentManagerId: "m2",
    pickDeadlineAt: "2026-06-04T00:02:00Z",
    draftPickSeconds: 90,
    managers: [
      { id: "m1", displayName: "Alice", draftSlot: 1, isMe: true },
      { id: "m2", displayName: "Bob", draftSlot: 2, isMe: false },
    ],
    picks: [
      { pickNo: 1, managerId: "m1", playerId: "pA", player: player("pA", "FWD"), isAuto: false },
    ],
    availablePlayers: [],
    sessionManagerId: "m1",
    sessionManagerIsCommissioner: false,
    myQueue: [],
    timerEnabled: true,
    ...over,
  };
}

describe("buildBoard — the snake pick board", () => {
  it("lays managers in columns and zig-zags pick numbers per round (snake)", () => {
    const board = buildBoard(mkState());
    expect(board.rounds).toBe(15);

    // Round 0 runs forward: col0 = pick 1 (m1), col1 = pick 2 (m2).
    expect(board.rows[0]!.direction).toBe("forward");
    expect(board.rows[0]!.cells.map((c) => ({ pickNo: c.pickNo, managerId: c.managerId }))).toEqual(
      [
        { pickNo: 1, managerId: "m1" },
        { pickNo: 2, managerId: "m2" },
      ],
    );

    // Round 1 reverses: the snake means pick 3 lands on m2's column, pick 4 on m1's.
    expect(board.rows[1]!.direction).toBe("backward");
    expect(board.rows[1]!.cells.map((c) => ({ pickNo: c.pickNo, managerId: c.managerId }))).toEqual(
      [
        { pickNo: 4, managerId: "m1" },
        { pickNo: 3, managerId: "m2" },
      ],
    );
  });

  it("places filled picks into their cell and marks the on-the-clock cell current", () => {
    const board = buildBoard(mkState());
    const cell1 = board.rows[0]!.cells[0]!;
    const cell2 = board.rows[0]!.cells[1]!;
    expect(cell1.pick?.playerId).toBe("pA");
    expect(cell1.isCurrent).toBe(false);
    expect(cell2.pick).toBeNull();
    expect(cell2.isCurrent).toBe(true); // currentPickNo = 2
  });

  it("has no current cell once the draft is complete", () => {
    const board = buildBoard(
      mkState({ status: "complete", currentPickNo: null, currentManagerId: null }),
    );
    const anyCurrent = board.rows.some((r) => r.cells.some((c) => c.isCurrent));
    expect(anyCurrent).toBe(false);
  });
});

describe("turn + roster helpers", () => {
  it("isMyTurn is true only when the session manager is on the clock in an active draft", () => {
    expect(isMyTurn(mkState({ currentManagerId: "m1", sessionManagerId: "m1" }))).toBe(true);
    expect(isMyTurn(mkState({ currentManagerId: "m2", sessionManagerId: "m1" }))).toBe(false);
    expect(
      isMyTurn(mkState({ currentManagerId: "m1", sessionManagerId: "m1", status: "paused" })),
    ).toBe(false);
  });

  it("onTheClockManager resolves the current manager row (or null when nobody)", () => {
    expect(onTheClockManager(mkState())?.displayName).toBe("Bob");
    expect(onTheClockManager(mkState({ currentManagerId: null }))).toBeNull();
  });

  it("roundForPick is 0-based per N managers", () => {
    expect(roundForPick(1, 2)).toBe(0);
    expect(roundForPick(2, 2)).toBe(0);
    expect(roundForPick(3, 2)).toBe(1);
  });

  it("rosterFor + positionCounts summarise a manager's squad-so-far", () => {
    const state = mkState({
      picks: [
        { pickNo: 1, managerId: "m1", playerId: "pA", player: player("pA", "FWD"), isAuto: false },
        { pickNo: 4, managerId: "m1", playerId: "pB", player: player("pB", "DEF"), isAuto: true },
        { pickNo: 3, managerId: "m2", playerId: "pC", player: player("pC", "MID"), isAuto: false },
      ],
    });
    const mine = rosterFor(state, "m1");
    expect(mine.map((p) => p.playerId)).toEqual(["pA", "pB"]);
    expect(positionCounts(mine)).toEqual({ GK: 0, DEF: 1, MID: 0, FWD: 1 });
  });
});

describe("filterAvailable — search + position filter", () => {
  const pool = [
    player("p1", "FWD", {
      displayName: "Kylian Mbappé",
      firstName: "Kylian",
      lastName: "Mbappé",
      country: "FRA",
    }),
    player("p2", "MID", {
      displayName: "Bukayo Saka",
      firstName: "Bukayo",
      lastName: "Saka",
      country: "ENG",
    }),
    player("p3", "GK", {
      displayName: "Emiliano Martínez",
      firstName: "Emiliano",
      lastName: "Martínez",
      country: "ARG",
    }),
  ];

  it("filters by position", () => {
    expect(filterAvailable(pool, { query: "", position: "MID" }).map((p) => p.id)).toEqual(["p2"]);
    expect(filterAvailable(pool, { query: "", position: "ALL" })).toHaveLength(3);
  });

  it("matches the query case-insensitively across name + country", () => {
    expect(filterAvailable(pool, { query: "saka", position: "ALL" }).map((p) => p.id)).toEqual([
      "p2",
    ]);
    expect(filterAvailable(pool, { query: "ARG", position: "ALL" }).map((p) => p.id)).toEqual([
      "p3",
    ]);
    expect(filterAvailable(pool, { query: "mba", position: "FWD" }).map((p) => p.id)).toEqual([
      "p1",
    ]);
    expect(filterAvailable(pool, { query: "mba", position: "GK" })).toHaveLength(0);
  });
});

describe("filterAvailable — nation filter", () => {
  const pool = [
    player("p1", "FWD", { country: "FRA" }),
    player("p2", "MID", { country: "ENG" }),
    player("p3", "GK", { country: "ARG" }),
    player("p4", "DEF", { country: "FRA" }),
  ];

  it("filters by nation code (AND with position/query)", () => {
    expect(
      filterAvailable(pool, { query: "", position: "ALL", nation: "FRA" }).map((p) => p.id),
    ).toEqual(["p1", "p4"]);
    expect(
      filterAvailable(pool, { query: "", position: "ALL", nation: "ENG" }).map((p) => p.id),
    ).toEqual(["p2"]);
  });

  it("shows all nations when nation is ALL or omitted", () => {
    expect(filterAvailable(pool, { query: "", position: "ALL", nation: "ALL" })).toHaveLength(4);
    expect(filterAvailable(pool, { query: "", position: "ALL" })).toHaveLength(4);
  });

  it("composes with position filter (AND semantics)", () => {
    expect(
      filterAvailable(pool, { query: "", position: "FWD", nation: "FRA" }).map((p) => p.id),
    ).toEqual(["p1"]);
    expect(filterAvailable(pool, { query: "", position: "GK", nation: "FRA" })).toHaveLength(0);
  });

  it("composes with query filter (AND semantics)", () => {
    // p1 is FRA FWD with displayName "p1" — query "p1" narrows to it within FRA
    expect(
      filterAvailable(pool, { query: "p1", position: "ALL", nation: "FRA" }).map((p) => p.id),
    ).toEqual(["p1"]);
    // query matches p4 but nation ENG excludes it
    expect(filterAvailable(pool, { query: "p4", position: "ALL", nation: "ENG" })).toHaveLength(0);
  });
});
