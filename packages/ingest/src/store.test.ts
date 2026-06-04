import { describe, it, expect } from "vitest";
import { MemoryIngestStore } from "./memoryStore";
import { mapStatLine } from "./map";

describe("MemoryIngestStore raw upserts", () => {
  it("is idempotent on the natural key (no dupes) and marks dirty", async () => {
    const store = new MemoryIngestStore();
    await store.upsertStatLine(mapStatLine({ match_id: 1, player_id: 2, goals: 1 }));
    await store.upsertStatLine(mapStatLine({ match_id: 1, player_id: 2, goals: 1 }));
    expect(store.statLines()).toHaveLength(1); // re-poll overwrote, no dupe
    expect(store.isDirty(1, 2)).toBe(true);
  });

  it("a changed-value re-poll overwrites and re-marks dirty after a clear", async () => {
    const store = new MemoryIngestStore();
    await store.upsertStatLine(mapStatLine({ match_id: 1, player_id: 2, goals: 1 }));
    store.clearDirty(1, 2);
    await store.upsertStatLine(mapStatLine({ match_id: 1, player_id: 2, goals: 2 }));
    expect(store.statLines()[0]?.goals).toBe(2); // overwritten
    expect(store.isDirty(1, 2)).toBe(true); // re-dirtied
  });

  it("writes the balldontlie rating and marks dirty", async () => {
    const store = new MemoryIngestStore();
    await store.upsertRatingBalldontlie(1, 2, 7.3);
    expect(store.ratingFor(1, 2)).toBe(7.3);
    expect(store.isDirty(1, 2)).toBe(true);
  });

  it("an event-only re-mark sets dirty WITHOUT clobbering an existing stat row", async () => {
    // A late card arrives after live stats already landed: markPlayersDirty must re-dirty the player
    // but leave his real minutes/goals intact (the inverse of the dead-channel bug).
    const store = new MemoryIngestStore();
    await store.upsertStatLine(
      mapStatLine({ match_id: 1, player_id: 2, minutes_played: 90, goals: 1 }),
    );
    store.clearDirty(1, 2);
    await store.markPlayersDirty(1, [2]); // event-only re-mark (no stat delta)
    expect(store.statLines()[0]).toMatchObject({ minutesPlayed: 90, goals: 1 }); // (a) stats preserved
    expect(store.isDirty(1, 2)).toBe(true); // (b) re-dirtied
  });

  it("events/shots/team writes don't dirty by themselves — markPlayersDirty does", async () => {
    const store = new MemoryIngestStore();
    await store.upsertEvent({
      bdlId: 9,
      matchBdlId: 1,
      incidentType: "goal",
      incidentClass: null,
      timeMinute: 10,
      addedTime: null,
      period: null,
      playerBdlId: 5,
      assistPlayerBdlId: null,
      playerInBdlId: null,
      playerOutBdlId: null,
      rescinded: false,
    });
    expect(store.isDirty(1, 5)).toBe(false); // event row has no dirty col
    await store.markPlayersDirty(1, [5]);
    expect(store.isDirty(1, 5)).toBe(true);
  });

  it("setLockedAt records the lock for (match, player)", async () => {
    const store = new MemoryIngestStore();
    const at = new Date("2026-06-10T18:00:00Z");
    await store.setLockedAt(1, 2, at);
    expect(store.lockedAt(1, 2)).toEqual(at);
  });

  it("resolvePeriodId returns the seeded period id or null", async () => {
    const store = new MemoryIngestStore();
    store.seedPeriod("knockout_round", "R32", "period-r32");
    expect(await store.resolvePeriodId({ kind: "knockout_round", label: "R32" })).toBe(
      "period-r32",
    );
    expect(await store.resolvePeriodId({ kind: "group_md", label: "MD9" })).toBeNull();
    expect(await store.resolvePeriodId(null)).toBeNull();
  });
});
