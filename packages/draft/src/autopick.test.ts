import { describe, it, expect } from "vitest";
import { selectAutopick, type AutopickInput } from "./autopick";
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
