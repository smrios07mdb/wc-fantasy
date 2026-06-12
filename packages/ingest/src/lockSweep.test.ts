import { describe, it, expect } from "vitest";
import { MemoryIngestStore } from "./memoryStore";
import { sweepCompletedMatchLocks, APPEARANCE_SWEEP_WINDOW_MS } from "./lockSweep";
import type { SchedulableMatch } from "./store";

const kickoff = new Date("2026-06-10T18:00:00Z");
const kickoffMs = kickoff.getTime();

/** now is 14h after kickoff — past the 12h settle ceiling, so decideMatchModes drops the match but the
 *  sweep's 48h window still covers it. */
const now = new Date(kickoffMs + 14 * 60 * 60_000);

function completedMatch(bdlId: number, ko = kickoffMs): SchedulableMatch {
  return {
    bdlId,
    status: "completed",
    kickoffMs: ko,
    hasRating: true,
    lineupPulled: true,
    kickoffLockFallback: false,
  };
}

describe("sweepCompletedMatchLocks", () => {
  it("stamps appeared-but-unlocked slots of a completed match at kickoff", async () => {
    // Players 5, 6, 7 appeared (score_player_match); no prior locked_at → sweep must stamp all three.
    const store = new MemoryIngestStore();
    store.seedAppeared(99, [5, 6, 7]);

    const results = await sweepCompletedMatchLocks(store, [completedMatch(99)], now);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ matchBdlId: 99, count: 3 });
    expect(store.lockedAt(99, 5)).toEqual(kickoff);
    expect(store.lockedAt(99, 6)).toEqual(kickoff);
    expect(store.lockedAt(99, 7)).toEqual(kickoff);
  });

  it("does NOT overwrite already-locked slots (monotonic latch)", async () => {
    // Player 7 was correctly locked at his sub-entry minute by the live path; sweep must not clobber it.
    const store = new MemoryIngestStore();
    const entryInstant = new Date(kickoffMs + 63 * 60_000); // sub locked at 63′
    await store.setLockedAt(99, 7, entryInstant);
    store.seedAppeared(99, [7]);

    const results = await sweepCompletedMatchLocks(store, [completedMatch(99)], now);

    expect(results).toHaveLength(0); // already locked → no new write → not in results
    expect(store.lockedAt(99, 7)).toEqual(entryInstant); // sub's precise instant preserved
  });

  it("does not lock a player absent from the appeared set (no phantom lock)", async () => {
    // Match 99 has no score_player_match rows → listAppearedPlayerBdlIds returns [] → nothing locked.
    const store = new MemoryIngestStore();
    // seedAppeared NOT called → appeared set is empty

    const results = await sweepCompletedMatchLocks(store, [completedMatch(99)], now);

    expect(results).toHaveLength(0);
    expect(store.lockedAt(99, 5)).toBeUndefined();
  });

  it("skips matches whose kickoff is outside the 48h window", async () => {
    // Kickoff 49h ago — just past the sweep window boundary.
    const oldKickoffMs = now.getTime() - 49 * 60 * 60_000;
    const store = new MemoryIngestStore();
    store.seedAppeared(88, [5]);

    const results = await sweepCompletedMatchLocks(store, [completedMatch(88, oldKickoffMs)], now);

    expect(results).toHaveLength(0);
    expect(store.lockedAt(88, 5)).toBeUndefined();
  });

  it("includes a match exactly on the 48h boundary", async () => {
    // Kickoff exactly at now - 48h is inside the window (cutoff = now - windowMs, strictly less than).
    const boundaryKickoffMs = now.getTime() - APPEARANCE_SWEEP_WINDOW_MS;
    const store = new MemoryIngestStore();
    store.seedAppeared(77, [9]);

    const results = await sweepCompletedMatchLocks(
      store,
      [completedMatch(77, boundaryKickoffMs)],
      now,
    );

    expect(results).toMatchObject([{ matchBdlId: 77 }]);
  });

  it("ignores non-completed matches (in_progress, scheduled)", async () => {
    const store = new MemoryIngestStore();
    store.seedAppeared(10, [1]);
    store.seedAppeared(20, [2]);

    const matches: SchedulableMatch[] = [
      {
        bdlId: 10,
        status: "in_progress",
        kickoffMs,
        hasRating: false,
        lineupPulled: true,
        kickoffLockFallback: false,
      },
      {
        bdlId: 20,
        status: "scheduled",
        kickoffMs: now.getTime() + 3600_000,
        hasRating: false,
        lineupPulled: false,
        kickoffLockFallback: false,
      },
    ];
    const results = await sweepCompletedMatchLocks(store, matches, now);

    expect(results).toHaveLength(0);
  });

  it("returns multiple entries when several completed matches have new locks", async () => {
    const store = new MemoryIngestStore();
    store.seedAppeared(11, [1, 2]);
    store.seedAppeared(12, [3]);
    // Match 13 already fully locked — must not appear in results.
    store.seedAppeared(13, [4]);
    await store.setLockedAt(13, 4, kickoff);

    const results = await sweepCompletedMatchLocks(
      store,
      [completedMatch(11), completedMatch(12), completedMatch(13)],
      now,
    );

    expect(results).toHaveLength(2);
    const byId = new Map(results.map((r) => [r.matchBdlId, r]));
    expect(byId.get(11)?.count).toBe(2);
    expect(byId.get(12)?.count).toBe(1);
    expect(byId.has(13)).toBe(false);
  });
});
