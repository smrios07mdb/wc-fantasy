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

  it("round-trips the five promoted columns + `extra` on create AND update; an event-only dirty re-mark leaves them intact", async () => {
    const store = new MemoryIngestStore();
    // CREATE: a feed row carrying all five promoted fields + two STILL-un-promoted fields.
    await store.upsertStatLine(
      mapStatLine({
        match_id: 1,
        player_id: 2,
        minutes_played: 90,
        goals: 1,
        shots_on_target: 3,
        ball_recoveries: 7,
        big_chances_created: 1,
        crosses_accurate: 2,
        touches: 80,
        aerial_duels_won: 5, // un-promoted → extra
        expected_goals: 0.7, // un-promoted → extra
      } as never),
    );
    // (a) the five promoted fields land on their own StatLineRow columns...
    expect(store.statLines()[0]).toMatchObject({
      shotsOnTarget: 3,
      ballRecoveries: 7,
      bigChancesCreated: 1,
      crossesAccurate: 2,
      touches: 80,
    });
    // (b) ...and `extra` carries ONLY the un-promoted fields — NONE of the five (omit-set proven).
    expect(store.statLines()[0]?.extra).toEqual({ aerial_duels_won: 5, expected_goals: 0.7 });

    // UPDATE: a changed-value re-poll overwrites the promoted columns (and refreshes extra).
    store.clearDirty(1, 2);
    await store.upsertStatLine(
      mapStatLine({
        match_id: 1,
        player_id: 2,
        minutes_played: 90,
        shots_on_target: 4,
        touches: 95,
        aerial_duels_won: 6,
      } as never),
    );
    expect(store.statLines()[0]).toMatchObject({ shotsOnTarget: 4, touches: 95 });
    expect(store.statLines()[0]?.extra).toEqual({ aerial_duels_won: 6 });
    expect(store.isDirty(1, 2)).toBe(true);

    // NO-CLOBBER: a later event-only re-mark (the dirty-ONLY path) must NOT null the columns or extra.
    store.clearDirty(1, 2);
    await store.markPlayersDirty(1, [2]);
    expect(store.statLines()[0]).toMatchObject({ shotsOnTarget: 4, touches: 95 });
    expect(store.statLines()[0]?.extra).toEqual({ aerial_duels_won: 6 });
    expect(store.isDirty(1, 2)).toBe(true);
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

  it("lockSlot records the lock for (match, player) once the instant has arrived", async () => {
    const store = new MemoryIngestStore();
    const at = new Date("2026-06-10T18:00:00Z");
    const now = new Date("2026-06-10T18:30:00Z");
    await store.lockSlot(1, 2, at, now, "xi-pull");
    expect(store.lockedAt(1, 2)).toEqual(at);
  });

  it("lockSlot REFUSES a non-participant even with the outer guards bypassed (team-membership gate)", async () => {
    // Defence-in-depth proof for the 2026-06-12 leak: suppose a foreign substitution reaches the write
    // boundary directly — the ingestLive foreign-event guard AND the feed re-filter both bypassed. lockSlot
    // is the categorical backstop: a player whose team is NOT one side of the SOURCE match is refused, full
    // stop, regardless of any upstream feed/mapping bug. Seed the live match's facts + a stranger's team.
    const store = new MemoryIngestStore();
    const kickoff = new Date("2026-06-12T19:00:00Z");
    const now = new Date("2026-06-12T20:00:00Z");
    store.seedMatchFacts(50, {
      status: "in_progress",
      periodId: "md1",
      homeTeamBdlId: 100, // Canada
      awayTeamBdlId: 200, // Bosnia & Herzegovina
    });

    // A France player (team 999) whose sub leaked in from another fixture at "59'" — exactly James
    // Rodríguez's class in the incident. He is on neither side of match 50 → refused.
    store.seedPlayerTeam(77, 999);
    const leaked = await store.lockSlot(
      50,
      77,
      new Date(kickoff.getTime() + 59 * 60_000),
      now,
      "sub-event",
    );
    expect(leaked).toBe(false);
    expect(store.lockedAt(50, 77)).toBeUndefined();

    // Control: a real participant of the SAME in-play match IS stamped.
    store.seedPlayerTeam(7, 100); // Canada
    const ok = await store.lockSlot(50, 7, kickoff, now, "xi-pull");
    expect(ok).toBe(true);
    expect(store.lockedAt(50, 7)).toEqual(kickoff);
  });

  it("lockSlot REFUSES while the source match is not in-play-or-later (scheduled)", async () => {
    const store = new MemoryIngestStore();
    const now = new Date("2026-06-12T20:00:00Z");
    // A future fixture wrongly handed a past instant: the status gate is the categorical kill — even a real
    // participant cannot be stamped while his match is still `scheduled` (the whole defect class).
    store.seedMatchFacts(60, {
      status: "scheduled",
      periodId: "md1",
      homeTeamBdlId: 1,
      awayTeamBdlId: 2,
    });
    store.seedPlayerTeam(8, 1);
    const stamped = await store.lockSlot(60, 8, new Date("2026-06-12T19:30:00Z"), now, "xi-pull");
    expect(stamped).toBe(false);
    expect(store.lockedAt(60, 8)).toBeUndefined();
  });

  it("lockSlot REFUSES before the lock instant has arrived (now-gate, always on)", async () => {
    const store = new MemoryIngestStore();
    const stamped = await store.lockSlot(
      70,
      9,
      new Date("2026-06-12T19:59:00Z"),
      new Date("2026-06-12T19:00:00Z"), // now is BEFORE the instant
      "sub-event",
    );
    expect(stamped).toBe(false);
    expect(store.lockedAt(70, 9)).toBeUndefined();
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
