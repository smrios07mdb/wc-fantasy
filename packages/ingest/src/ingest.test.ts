import { describe, it, expect, vi } from "vitest";
import { MemoryIngestStore } from "./memoryStore";
import {
  ingestLineups,
  ingestLive,
  ingestSettle,
  ingestSchedule,
  ingestRosters,
  ingestTeamStats,
  ingestGroupStandings,
} from "./ingest";
import type { FeedClient } from "@app/feed";

/** A FeedClient whose endpoints return empty pages unless overridden. */
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

const kickoff = new Date("2026-06-10T18:00:00Z");
// A wall clock well into the match — past kickoff and every substitution entry below — so the lock-write
// `now` gate (lock.ts) permits the legitimate locks these existing cases assert.
const liveNow = new Date("2026-06-10T20:00:00Z");

describe("ingestRosters (squad bootstrap)", () => {
  it("upserts each player (mapped position + team link) and the team (name = country)", async () => {
    const feed = fakeFeed({
      rosters: () =>
        Promise.resolve({
          data: [
            {
              team_id: 36,
              position: "F",
              player: {
                id: 30233,
                name: "Alexander Sørloth",
                position: "F",
                country_name: "Norway",
              },
            },
            {
              team_id: 10,
              position: "G",
              player: { id: 5, name: "A Keeper", position: "G", country_name: "Brazil" },
            },
          ],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();

    await ingestRosters(feed, store);

    expect(store.upsertedPlayerCount()).toBe(2);
    expect(store.upsertedTeam(36)).toBe("Norway");
    expect(store.upsertedPlayer(30233)).toEqual({
      displayName: "Alexander Sørloth",
      position: "FWD", // F → FWD
      teamBdlId: 36,
    });
    expect(store.upsertedPlayer(5)).toEqual({
      displayName: "A Keeper",
      position: "GK", // G → GK
      teamBdlId: 10,
    });
  });
});

describe("ingestLineups (pre-match)", () => {
  it("locks every official-XI starter at kickoff; benched players stay unlocked", async () => {
    const feed = fakeFeed({
      matchLineups: () =>
        Promise.resolve({
          // FLAT shape (verified live GOAT): one row per player, id nested at `player.id`.
          data: [
            { match_id: 50, player: { id: 1 }, is_starter: true },
            { match_id: 50, player: { id: 2 }, is_starter: true },
            { match_id: 50, player: { id: 3 }, is_starter: false },
          ],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();
    const out = await ingestLineups(feed, store, {
      bdlId: 50,
      kickoffAt: kickoff,
      kickoffLockFallback: false,
      now: liveNow,
    });
    expect(store.lockedAt(50, 1)).toEqual(kickoff);
    expect(store.lockedAt(50, 2)).toEqual(kickoff);
    expect(store.lockedAt(50, 3)).toBeUndefined(); // bench (not in real XI) stays swappable
    // The pull also RETURNS the official-XI starter BDL ids (no second feed call) so the worker IO can
    // drive the player-not-starting notification (Prompt 41b); bench players (is_starter:false) excluded.
    expect(out.officialStarterBdlIds).toEqual([1, 2]);
  });

  it("does NOT stamp locked_at before kickoff, then stamps == kickoff once it has arrived", async () => {
    // The 2026-06-11 MD1 regression guard: a scheduled match whose lineup pull runs with now < kickoff
    // must leave locked_at NULL; only once now >= kickoff is the starter's slot stamped, at kickoff.
    const feed = fakeFeed({
      matchLineups: () =>
        Promise.resolve({
          data: [{ match_id: 50, player: { id: 1 }, is_starter: true }],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();
    const base = { bdlId: 50, kickoffAt: kickoff, kickoffLockFallback: false };

    // now < kickoff (kickoff is 18:00Z) → nothing stamped.
    await ingestLineups(feed, store, { ...base, now: new Date("2026-06-10T17:30:00Z") });
    expect(store.lockedAt(50, 1)).toBeUndefined();

    // now >= kickoff → the starter locks, at kickoff (NOT at now).
    await ingestLineups(feed, store, { ...base, now: new Date("2026-06-10T18:01:00Z") });
    expect(store.lockedAt(50, 1)).toEqual(kickoff);
  });
});

describe("ingestLive", () => {
  it("upserts events/stats, locks the substitute at his entry minute, marks players dirty", async () => {
    const feed = fakeFeed({
      matchEvents: () =>
        Promise.resolve({
          data: [
            {
              id: 900,
              match_id: 50,
              incident_type: "substitution",
              player_in: { id: 7 },
              player_out: { id: 2 },
              time_minute: 61,
              added_time: 1,
            },
          ],
          meta: {},
        }),
      playerMatchStats: () =>
        Promise.resolve({
          data: [{ match_id: 50, player_id: 7, minutes_played: 30, rating: 7.1 }],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();
    await ingestLive(feed, store, {
      bdlId: 50,
      kickoffAt: kickoff,
      kickoffLockFallback: false,
      now: liveNow,
    });
    expect(store.lockedAt(50, 7)).toEqual(new Date("2026-06-10T19:02:00Z")); // +62 min
    expect(store.isDirty(50, 7)).toBe(true);
    expect(store.ratingFor(50, 7)).toBe(7.1);
    expect(store.allEvents()).toHaveLength(1);
  });

  it("does NOT lock a player whose substitution event belongs to a DIFFERENT match (cross-match leak regression)", async () => {
    // 2026-06-12 recurrence (Canada–Bosnia live window, the THIRD premature-lock incident): the live
    // match's `feed.matchEvents` returned substitution events that belong to OTHER fixtures — the GOAT
    // `match_id` filter is not honored and the client (getAll) never re-checks `event.match_id`. Each
    // foreign sub's `player_in` is a pooled WC player whose OWN fixture is still scheduled/future, so he
    // is NOT a participant of the live match. The unguarded sub-lock applies the LIVE match's kickoff +
    // period to him (setLockedAt keyed on ctx.bdlId), stamping locked_at on a non-participant. The
    // forensic signature is exactly this: 44 strangers (France/Portugal/Argentina/… players whose MD1
    // fixtures are days out) stamped at `kickoff + their-other-match minute`. He must stay swappable.
    const FOREIGN_MATCH = 999; // a different fixture — NOT ctx.bdlId (50)
    const feed = fakeFeed({
      matchEvents: () =>
        Promise.resolve({
          data: [
            {
              id: 903,
              match_id: FOREIGN_MATCH, // ← belongs to another match, not the live match (50)
              incident_type: "substitution",
              player_in: { id: 77 }, // a stranger: his own fixture is scheduled/future, not match 50
              time_minute: 59,
              added_time: 0,
            },
          ],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();
    await ingestLive(feed, store, {
      bdlId: 50, // the LIVE match
      kickoffAt: kickoff,
      kickoffLockFallback: false,
      now: liveNow,
    });
    // A substitution from a DIFFERENT match must never lock a player against the live match's period.
    expect(store.lockedAt(50, 77)).toBeUndefined();
  });

  it("marks the out-going player dirty even with no stat row (event-only)", async () => {
    const feed = fakeFeed({
      matchEvents: () =>
        Promise.resolve({
          data: [
            {
              id: 901,
              match_id: 50,
              incident_type: "goal",
              player: { id: 9 },
              assist_player: { id: 4 },
            },
          ],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();
    await ingestLive(feed, store, {
      bdlId: 50,
      kickoffAt: kickoff,
      kickoffLockFallback: false,
      now: liveNow,
    });
    expect(store.isDirty(50, 9)).toBe(true); // scorer
    expect(store.isDirty(50, 4)).toBe(true); // assist
  });

  it("logs and skips a structurally-broken item without halting the rest of the batch", async () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args);
    });
    const feed = fakeFeed({
      matchEvents: () =>
        Promise.resolve({
          data: [
            // Malformed: a raw number where a nested player object is documented → must be skipped.
            { id: 950, match_id: 50, incident_type: "goal", player: 9 } as never,
            // Valid event in the SAME batch → must still be processed.
            { id: 951, match_id: 50, incident_type: "goal", player: { id: 11 } },
          ],
          meta: {},
        }),
      playerMatchStats: () =>
        Promise.resolve({
          data: [{ match_id: 50, player_id: 11, minutes_played: 90 }],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();
    await ingestLive(feed, store, {
      bdlId: 50,
      kickoffAt: kickoff,
      kickoffLockFallback: false,
      now: liveNow,
    });

    expect(store.allEvents()).toHaveLength(1); // only the valid event landed
    expect(store.isDirty(50, 11)).toBe(true); // good rows still processed
    expect(errors).toHaveLength(1); // the bad item was logged loudly
    spy.mockRestore();
  });

  it("under kickoff-lock fallback, does NOT lock an entering substitute", async () => {
    const feed = fakeFeed({
      matchEvents: () =>
        Promise.resolve({
          data: [
            {
              id: 902,
              match_id: 50,
              incident_type: "substitution",
              player_in: { id: 7 },
              time_minute: 61,
              added_time: 0,
            },
          ],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();
    await ingestLive(feed, store, {
      bdlId: 50,
      kickoffAt: kickoff,
      kickoffLockFallback: true,
      now: liveNow,
    });
    expect(store.lockedAt(50, 7)).toBeUndefined();
  });

  it("self-heals a starter the pre_match XI-pull missed, by reconciling the appeared set at kickoff", async () => {
    // Player 3 appeared (score row) but was never in an observed XI-pull or sub event. Live reconciles
    // it to a kickoff lock so an in-progress played starter can't be swapped out mid-match.
    const store = new MemoryIngestStore();
    store.seedAppeared(50, [3]);
    await ingestLive(fakeFeed({}), store, {
      bdlId: 50,
      kickoffAt: kickoff,
      kickoffLockFallback: false,
      now: liveNow,
    });
    expect(store.lockedAt(50, 3)).toEqual(kickoff);
  });
});

describe("ingestSchedule (schedule-sync)", () => {
  it("upserts fixtures with the structurally-resolved period_id", async () => {
    const feed = fakeFeed({
      matches: () =>
        Promise.resolve({
          data: [
            {
              id: 50,
              status: "scheduled",
              datetime: "2026-06-10T18:00:00Z",
              stage: { id: 2, name: "Round of 16" },
            },
            {
              id: 51,
              status: "scheduled",
              datetime: "2026-06-11T18:00:00Z",
              stage: { id: 1, name: "Group Stage" },
              group: { id: 1, name: "Group A" },
            }, // group game, no round_number
          ],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();
    store.seedPeriod("knockout_round", "R16", "period-r16");

    await ingestSchedule(feed, store);

    expect(store.upsertedMatch(50)?.periodId).toBe("period-r16"); // structural stage → R16 period
    expect(store.upsertedMatch(51)?.periodId).toBeNull(); // group game, no round_number → left null
  });

  it("keeps the 3rd-place play-off period-less (period_id NULL + is_third_place) even if a matching period is seeded", async () => {
    const feed = fakeFeed({
      matches: () =>
        Promise.resolve({
          data: [
            {
              id: 60,
              status: "scheduled",
              datetime: "2026-07-18T18:00:00Z",
              // Hostile: stage says "Final" — the defensive guard must STILL keep this period-less so it
              // can never be mis-bound to the real Final period (T-3RD).
              stage: { id: 7, name: "Final" },
              round_name: "Match for 3rd place",
            },
          ],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();
    store.seedPeriod("knockout_round", "Final", "period-final"); // the real Final period exists

    await ingestSchedule(feed, store);

    expect(store.upsertedMatch(60)?.periodId).toBeNull(); // NEVER a period — stays invisible to playoffs/lineups
    expect(store.upsertedMatch(60)?.isThirdPlace).toBe(true); // but flagged for the /pool loader to synthesize
  });
});

describe("ingestSettle", () => {
  it("re-pulls stats + rating and marks players dirty (no sub-locking)", async () => {
    const feed = fakeFeed({
      playerMatchStats: () =>
        Promise.resolve({
          data: [{ match_id: 50, player_id: 9, minutes_played: 90, rating: 8.0 }],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();
    await ingestSettle(feed, store, {
      bdlId: 50,
      kickoffAt: kickoff,
      kickoffLockFallback: false,
      now: liveNow,
    });
    expect(store.ratingFor(50, 9)).toBe(8.0);
    expect(store.isDirty(50, 9)).toBe(true);
    // No score_player_match row seeded → player is not in the appeared set → no reconciliation lock.
    expect(store.lockedAt(50, 9)).toBeUndefined();
  });

  it("RECONCILES the lock for EVERY appeared player (the coverage-gap fix), at kickoff", async () => {
    // The bug: a completed match left some played XI slots unstamped because pre_match/live missed
    // their feed signal. Settle now reconciles against score_player_match (the authoritative appeared
    // set), so a player who demonstrably appeared gets ALL their current-period slots locked at kickoff.
    const feed = fakeFeed({
      playerMatchStats: () =>
        Promise.resolve({
          data: [{ match_id: 50, player_id: 9, minutes_played: 90, rating: 8.0 }],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();
    // Appeared per score_player_match: 9 (had a stat line) AND 5, 6 (appeared via event/shot only — the
    // exact slots the live poller missed). All three must lock; the absent 7 (never played) must NOT.
    store.seedAppeared(50, [9, 5, 6]);
    await ingestSettle(feed, store, {
      bdlId: 50,
      kickoffAt: kickoff,
      kickoffLockFallback: false,
      now: liveNow,
    });
    expect(store.lockedAt(50, 9)).toEqual(kickoff);
    expect(store.lockedAt(50, 5)).toEqual(kickoff);
    expect(store.lockedAt(50, 6)).toEqual(kickoff);
    expect(store.lockedAt(50, 7)).toBeUndefined(); // never appeared → stays swappable (no phantom lock)
  });

  it("reconciliation is monotonic — an already-locked sub keeps his earlier entry instant", async () => {
    const store = new MemoryIngestStore();
    const entry = new Date("2026-06-10T19:03:00Z"); // sub locked earlier at his entry minute
    store.seedLock(50, 7, entry); // pre-seed the earlier lock directly (bypasses the gate)
    store.seedAppeared(50, [7]);
    await ingestSettle(fakeFeed({}), store, {
      bdlId: 50,
      kickoffAt: kickoff,
      kickoffLockFallback: false,
      now: liveNow,
    });
    expect(store.lockedAt(50, 7)).toEqual(entry); // NOT overwritten with kickoff
  });
});

describe("ingestTeamStats (team-stats backfill, T17)", () => {
  it("upserts a match's team rows (typed columns + retained extra), drops foreign rows, and reports counts", async () => {
    const feed = fakeFeed({
      teamMatchStats: () =>
        Promise.resolve({
          data: [
            {
              match_id: 50,
              team_id: 36,
              possession_pct: 60,
              offsides: 2,
              shots_blocked: 3,
              expected_goals: 1.4,
              corners: 6,
            },
            { match_id: 50, team_id: 10, possession_pct: 40, offsides: 1, shots_blocked: 1 },
            // a row whose own match_id is a DIFFERENT match → must be foreign-skipped, not written.
            { match_id: 99, team_id: 7, possession_pct: 55 },
          ],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();

    const result = await ingestTeamStats(feed, store, 50);

    expect(result).toEqual({ upserted: 2, foreignSkipped: 1 });
    const rows = store.allTeamStats();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.teamBdlId).sort((a, b) => a - b)).toEqual([10, 36]);
    expect(rows.find((r) => r.teamBdlId === 7)).toBeUndefined(); // foreign row never written
    // The promoted typed columns + the catch-all `extra` both land (mapTeamStat reuse).
    const t36 = rows.find((r) => r.teamBdlId === 36)!;
    expect(t36).toMatchObject({ possession: 60, offsides: 2, shotsBlocked: 3 });
    expect(t36.extra).toEqual({ expected_goals: 1.4, corners: 6 });
  });

  it("writes stat_team_match ONLY — never marks a player dirty (no recompute trigger)", async () => {
    const feed = fakeFeed({
      teamMatchStats: () =>
        Promise.resolve({
          data: [{ match_id: 50, team_id: 36, possession_pct: 60 }],
          meta: {},
        }),
    });
    const store = new MemoryIngestStore();
    const dirtySpy = vi.spyOn(store, "markPlayersDirty");

    await ingestTeamStats(feed, store, 50);

    expect(dirtySpy).not.toHaveBeenCalled(); // display-only path: zero fantasy-state mutation
  });
});

describe("ingestGroupStandings (T18 group table)", () => {
  const row = (over: Record<string, unknown>) => ({
    season: { id: 1, year: 2026 },
    team: { id: 0, name: "T", abbreviation: "T" },
    group: { id: 1, name: "Group A" },
    position: 1,
    played: 3,
    won: 0,
    drawn: 0,
    lost: 0,
    goals_for: 0,
    goals_against: 0,
    goal_difference: 0,
    points: 0,
    ...over,
  });

  it("upserts known teams, FOREIGN-GUARD skips teams not in fifa_team, and counts precisely", async () => {
    const store = new MemoryIngestStore();
    await store.upsertTeamByBdlId(12, "Argentina"); // registered
    await store.upsertTeamByBdlId(10, "Mexico"); // registered
    // team 7 deliberately NOT registered → must be foreign-skipped
    const feed = fakeFeed({
      groupStandings: () =>
        Promise.resolve({
          data: [
            row({ team: { id: 12, name: "Argentina" }, position: 1, points: 7 }),
            row({ team: { id: 10, name: "Mexico" }, position: 2, points: 4 }),
            row({ team: { id: 7, name: "Ghost" }, position: 3, points: 1 }),
          ],
          meta: {},
        }),
    });

    const result = await ingestGroupStandings(feed, store, 2026);

    expect(result).toEqual({ fetched: 3, upserted: 2, foreignSkipped: 1 });
    const stored = store.allGroupStandings();
    expect(stored.map((s) => s.teamBdlId).sort((a, b) => a - b)).toEqual([10, 12]);
    expect(stored.find((s) => s.teamBdlId === 7)).toBeUndefined(); // ghost team skipped
    expect(stored.find((s) => s.teamBdlId === 12)).toMatchObject({
      bdlGroupId: 1,
      groupName: "Group A",
      season: 2026,
      points: 7,
    });
  });

  it("is idempotent: a re-run overwrites in place (one row per team) with fresh values", async () => {
    const store = new MemoryIngestStore();
    await store.upsertTeamByBdlId(12, "Argentina");
    const feed = (points: number) =>
      fakeFeed({
        groupStandings: () =>
          Promise.resolve({ data: [row({ team: { id: 12 }, points })], meta: {} }),
      });

    await ingestGroupStandings(feed(7), store, 2026);
    await ingestGroupStandings(feed(9), store, 2026); // re-run with updated points

    const stored = store.allGroupStandings();
    expect(stored).toHaveLength(1); // overwritten, not duplicated
    expect(stored[0]?.points).toBe(9); // refreshed in place
  });

  it("makes NO dirty-mark and writes NO player stats (display-only / fantasy-safe)", async () => {
    const store = new MemoryIngestStore();
    await store.upsertTeamByBdlId(12, "Argentina");
    const dirtySpy = vi.spyOn(store, "markPlayersDirty");
    const statSpy = vi.spyOn(store, "upsertStatLine");
    const feed = fakeFeed({
      groupStandings: () =>
        Promise.resolve({ data: [row({ team: { id: 12 }, points: 7 })], meta: {} }),
    });

    await ingestGroupStandings(feed, store, 2026);

    expect(dirtySpy).not.toHaveBeenCalled(); // never re-dirties the recompute sweep
    expect(statSpy).not.toHaveBeenCalled(); // never touches player stats
  });

  it("skips a malformed row (eachItem isolation) without aborting the batch", async () => {
    const store = new MemoryIngestStore();
    await store.upsertTeamByBdlId(12, "Argentina");
    await store.upsertTeamByBdlId(10, "Mexico");
    const feed = fakeFeed({
      groupStandings: () =>
        Promise.resolve({
          data: [
            row({ team: { id: 12 }, points: 7 }),
            { team: { id: 10 }, group: { id: 1, name: "Group A" } } as never, // missing position/points → throws, skipped
          ],
          meta: {},
        }),
    });

    const result = await ingestGroupStandings(feed, store, 2026);
    // The malformed row is skipped by eachItem; the good row still lands.
    expect(result.upserted).toBe(1);
    expect(store.allGroupStandings().map((s) => s.teamBdlId)).toEqual([12]);
  });
});
