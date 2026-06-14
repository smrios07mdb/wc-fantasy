import { describe, it, expect } from "vitest";
import { MemoryIngestStore } from "./memoryStore";
import { peekLineup } from "./lineupPeek";
import type { FeedClient } from "@app/feed";
import type { MatchCtx } from "./ingest";

/** A FeedClient whose endpoints return empty pages unless overridden (mirrors ingest.test.ts). */
function fakeFeed(over: Partial<FeedClient>): FeedClient {
  const empty = <T>() => Promise.resolve({ data: [] as T[], meta: {} });
  return {
    matches: empty,
    matchLineups: empty,
    matchEvents: empty,
    playerMatchStats: empty,
    teamMatchStats: empty,
    matchShots: empty,
    rosters: empty,
    ...over,
  } as FeedClient;
}

// The T-75 peek runs BEFORE kickoff; it never locks, so the now-gate is moot, but use a pre-kickoff
// clock to be faithful to when peekLineup actually fires.
const ctx: MatchCtx = {
  bdlId: 50,
  kickoffAt: new Date("2026-06-10T18:00:00Z"),
  kickoffLockFallback: false,
  now: new Date("2026-06-10T16:45:00Z"),
};

describe("peekLineup (T-75 availability snapshot)", () => {
  it("persists EVERY entry — starters AND bench — and locks NOTHING", async () => {
    const feed = fakeFeed({
      matchLineups: () =>
        Promise.resolve({
          // FLAT shape (verified live GOAT): one row per player, id nested at `player.id`.
          data: [
            { match_id: 50, player: { id: 1 }, is_starter: true },
            { match_id: 50, player: { id: 2 }, is_starter: true },
            { match_id: 50, player: { id: 3 }, is_starter: false }, // a bench row — persisted too
          ],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();

    const n = await peekLineup(feed, store, ctx);

    expect(n).toBe(3);
    const entries = store.lineupEntriesFor(50);
    expect(entries?.get(1)).toBe(true);
    expect(entries?.get(2)).toBe(true);
    expect(entries?.get(3)).toBe(false);
    // It routes NOWHERE near the lock path — no slot is ever stamped by the peek.
    expect(store.lockedAt(50, 1)).toBeUndefined();
    expect(store.lockedAt(50, 2)).toBeUndefined();
    expect(store.lockedAt(50, 3)).toBeUndefined();
  });

  it("writes NOTHING when the sheet is not up yet (empty match_lineups)", async () => {
    const feed = fakeFeed({ matchLineups: () => Promise.resolve({ data: [], meta: {} }) });
    const store = new MemoryIngestStore();

    const n = await peekLineup(feed, store, ctx);

    expect(n).toBe(0);
    expect(store.lineupEntriesFor(50)).toBeUndefined();
  });

  it("is idempotent on re-pull (keyed by (match, player); a flipped is_starter overwrites in place)", async () => {
    let starter = false;
    const feed = fakeFeed({
      matchLineups: () =>
        Promise.resolve({
          data: [{ match_id: 50, player: { id: 9 }, is_starter: starter }],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();

    await peekLineup(feed, store, ctx);
    expect(store.lineupEntriesFor(50)?.get(9)).toBe(false);

    starter = true; // sheet republished with him promoted into the XI
    await peekLineup(feed, store, ctx);
    expect(store.lineupEntriesFor(50)?.size).toBe(1); // one row for (50, 9), not duplicated
    expect(store.lineupEntriesFor(50)?.get(9)).toBe(true);
  });
});
