/**
 * Pre-kickoff availability peek (Set Lineup badge; ARCHITECTURE.md §3). This is the T-75 sweep the worker
 * runs for each match `matchesNeedingLineupPeek` selects: it pulls `match_lineups` ~75 min before kickoff
 * (when national-team sheets publish) and persists EVERY entry — starters AND bench — as a
 * `match_lineup_entry` snapshot via `store.upsertLineupEntries`, so the Set Lineup screen can show each
 * rostered player a Starting / Not-starting badge BEFORE kickoff.
 *
 * It is ORTHOGONAL to lock-on-play and deliberately minimal: it writes NO `lineup_slot.locked_at`, sets
 * no `lineupPulled`, marks nothing dirty, and emits no notification — it routes NOWHERE near `lockSlot`.
 * The kickoff XI-pull/lock path (`ingestLineups` via `decideMatchModes`' `pre_match` arm) is untouched and
 * remains the sole lock writer. An empty feed response (sheet not up yet) writes nothing; re-pulls are
 * idempotent (upsert keyed by `UNIQUE(match, player)`), so the selector can re-fire each tick until rows
 * land.
 */
import type { FeedClient } from "@app/feed";
import type { IngestStore, LineupEntryIn } from "./store";
import type { MatchCtx } from "./ingest";

/**
 * Pull the pre-kickoff lineup for `ctx.bdlId` and persist the starter/bench snapshot. Returns the number
 * of entries written (0 when the sheet is not yet published — nothing is persisted in that case).
 */
export async function peekLineup(
  feed: FeedClient,
  store: IngestStore,
  ctx: MatchCtx,
): Promise<number> {
  const res = await feed.matchLineups({ matchId: ctx.bdlId });
  const entries: LineupEntryIn[] = [];
  for (const lineup of res.data) {
    // Map EVERY entry — starters AND bench. `is_starter` is what the badge later resolves on; an absent
    // bench (XI-only feed) still resolves correctly downstream (match-has-entries ⇒ not-a-starter = out).
    for (const e of lineup.entries) {
      entries.push({ playerBdlId: e.player_id, isStarter: e.is_starter });
    }
  }
  if (entries.length === 0) return 0;
  await store.upsertLineupEntries(ctx.bdlId, entries);
  return entries.length;
}
