/**
 * Ingestion orchestration (ARCHITECTURE.md §3). Threads a FeedClient + IngestStore: pull → pure map →
 * idempotent upsert → mark dirty → set locked_at. IO lives in the store + feed; the mapping/locking
 * decisions are the pure modules. The worker calls the recompute `sweep` AFTER each pass.
 */
import type { FeedClient } from "@app/feed";
import type { IngestStore } from "./store";
import {
  mapEvent,
  mapShot,
  mapStatLine,
  mapRating,
  mapTeamStat,
  mapGroupStanding,
  mapMatchRow,
  mapPosition,
  derivePeriodLabel,
} from "./map";
import {
  lockInstantsFromLineup,
  lockInstantFromSub,
  lockInstantsFromAppearances,
  type LineupAppearance,
} from "./lock";
import { FeedShapeMismatchError } from "./errors";

export interface MatchCtx {
  bdlId: number;
  kickoffAt: Date;
  kickoffLockFallback: boolean;
  /** The worker tick's wall clock. Gates the lock write so a not-yet-kicked-off match never stamps
   *  `locked_at` (lock.ts invariant) — supplied by the orchestrator, never read here. */
  now: Date;
}

/**
 * Run `handle` once per feed item, catching {@link FeedShapeMismatchError} PER ITEM: a malformed row is
 * logged loudly and skipped so one bad item never halts the whole batch. Any OTHER error propagates —
 * that's a real bug (store/DB failure), not tolerable bad input.
 */
async function eachItem<T>(items: T[], handle: (item: T) => Promise<void>): Promise<void> {
  for (const item of items) {
    try {
      await handle(item);
    } catch (err) {
      if (err instanceof FeedShapeMismatchError) {
        console.error(`[ingest] skipping malformed feed item: ${err.message}`, err.context);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Schedule-sync: pull the fixture list and upsert each `fifa_match`, resolving its STRUCTURAL period
 * (round/matchday → period_id, never kickoff-time inference). This is the bootstrap that populates the
 * DB the per-match modes then read. Idempotent: re-running overwrites and self-corrects.
 */
export async function ingestSchedule(feed: FeedClient, store: IngestStore): Promise<void> {
  const res = await feed.matches();
  for (const f of res.data) {
    const row = mapMatchRow(f);
    const periodId = await store.resolvePeriodId(derivePeriodLabel(f));
    await store.upsertMatch(row, periodId, {});
  }
}

/**
 * Squad bootstrap: pull the per-edition rosters and upsert each player (with their national team +
 * mapped position) — the ONLY path that creates `player` + `fifa_team` rows, which every later mode
 * then references. Idempotent (upserts on BDL ids). Team name = the player's country; the position
 * letter (G/D/M/F) is normalized to our enum via `mapPosition`. Runs on a SLOW cadence (boot + ~daily),
 * NOT the 60s tick — squads are static (ARCHITECTURE.md §3). Default season: 2026.
 */
export async function ingestRosters(feed: FeedClient, store: IngestStore): Promise<void> {
  const res = await feed.rosters({ seasons: [2026] });
  for (const r of res.data) {
    // Team first: upsertPlayerByBdlId resolves teamBdlId → the fifa_team row, so it must exist.
    await store.upsertTeamByBdlId(r.team_id, r.player.country_name ?? null);
    await store.upsertPlayerByBdlId(r.player.id, {
      displayName: r.player.name ?? null,
      position: mapPosition(r.player.position),
      teamBdlId: r.team_id,
    });
  }
}

function isSubstitution(incidentType: string): boolean {
  return incidentType.toLowerCase().includes("substitut");
}

/**
 * Coverage safety-net (lock-on-play under-stamping fix): reconcile `locked_at` against the AUTHORITATIVE
 * appeared set (`score_player_match` participants), stamping every played player at kickoff. The pre_match
 * XI-pull and per-event sub-locking miss appearances the 60s poller never observed — a late/missed XI
 * confirmation, a sub event between polls — leaving played slots `locked_at = NULL` forever, since neither
 * mode re-fires once the match leaves its window. This runs every live + settle tick, so any appeared
 * player still stamps. Routed through the single `lockSlot` boundary, which re-checks team-in-match +
 * status + now + period (so even a contaminated appeared set can never stamp a non-participant).
 */
async function reconcileAppearanceLocks(store: IngestStore, ctx: MatchCtx): Promise<void> {
  const appeared = await store.listAppearedPlayerBdlIds(ctx.bdlId);
  for (const lock of lockInstantsFromAppearances(appeared, ctx.kickoffAt, ctx.now)) {
    await store.lockSlot(ctx.bdlId, lock.playerBdlId, lock.lockedAt, ctx.now, "reconcile");
  }
}

/** What the pre-match pull derived, surfaced to the worker IO so it can drive the player-not-starting
 *  notification (Prompt 41b) WITHOUT a second `match_lineups` feed call. */
export interface LineupsResult {
  /** Every BALLDONTLIE player id in the official starting XI (is_starter), across both teams' lineups. */
  officialStarterBdlIds: number[];
}

/** Pre-match: pull the confirmed XI, lock every official starter at kickoff, and return the XI's BDL ids. */
export async function ingestLineups(
  feed: FeedClient,
  store: IngestStore,
  ctx: MatchCtx,
): Promise<LineupsResult> {
  const res = await feed.matchLineups({ matchId: ctx.bdlId });
  // FLAT feed: each `data` row IS one player's entry (player id nested at `row.player.id`); one pass, no
  // inner loop. Bench players (is_starter:false) are excluded from the official-XI starter ids.
  const entries: LineupAppearance[] = res.data.map((row) => ({
    playerBdlId: row.player.id,
    isStarter: row.is_starter,
  }));
  const officialStarterBdlIds: number[] = [];
  for (const e of entries) {
    if (e.isStarter) officialStarterBdlIds.push(e.playerBdlId);
  }
  for (const lock of lockInstantsFromLineup(entries, ctx.kickoffAt, ctx.now)) {
    await store.lockSlot(ctx.bdlId, lock.playerBdlId, lock.lockedAt, ctx.now, "xi-pull");
  }
  return { officialStarterBdlIds };
}

/** Live: upsert events/stats/shots/team stats, mark players dirty, and lock entering subs at their minute. */
export async function ingestLive(
  feed: FeedClient,
  store: IngestStore,
  ctx: MatchCtx,
): Promise<void> {
  const [events, stats, shots, teamStats] = await Promise.all([
    feed.matchEvents({ matchId: ctx.bdlId }),
    feed.playerMatchStats({ matchId: ctx.bdlId }),
    feed.matchShots({ matchId: ctx.bdlId }),
    feed.teamMatchStats({ matchId: ctx.bdlId }),
  ]);

  const touched = new Set<number>();
  // FOREIGN-EVENT GUARD (2026-06-12 leak root cause): the GOAT `match_id` filter is not reliably honoured,
  // so one pull can return rows belonging to OTHER fixtures. Anything whose OWN match ≠ this match is
  // dropped ENTIRELY — never stored, never dirtied, never lock-stamped against this match's period. This is
  // the OUTER defence; `lockSlot`'s team+status gate is the categorical backstop. Count → one operator warn.
  let foreignSkipped = 0;

  await eachItem(stats.data, async (f) => {
    const row = mapStatLine(f);
    if (row.matchBdlId !== ctx.bdlId) return void foreignSkipped++;
    await store.upsertStatLine(row);
    const r = mapRating(f);
    await store.upsertRatingBalldontlie(r.matchBdlId, r.playerBdlId, r.rating);
    touched.add(row.playerBdlId);
  });

  await eachItem(events.data, async (f) => {
    const e = mapEvent(f);
    if (e.matchBdlId !== ctx.bdlId) return void foreignSkipped++;
    await store.upsertEvent(e);
    for (const id of [e.playerBdlId, e.assistPlayerBdlId, e.playerInBdlId, e.playerOutBdlId]) {
      if (id != null) touched.add(id);
    }
    // Lock-on-play: a substitute locks at entry — UNLESS this match is on the kickoff-lock fallback.
    if (!ctx.kickoffLockFallback && isSubstitution(e.incidentType)) {
      const lock = lockInstantFromSub(
        { playerInBdlId: e.playerInBdlId, timeMinute: e.timeMinute, addedTime: e.addedTime },
        ctx.kickoffAt,
        ctx.now,
      );
      if (lock)
        await store.lockSlot(ctx.bdlId, lock.playerBdlId, lock.lockedAt, ctx.now, "sub-event");
    }
  });

  await eachItem(shots.data, async (f) => {
    const sh = mapShot(f);
    if (sh.matchBdlId !== ctx.bdlId) return void foreignSkipped++;
    await store.upsertShot(sh);
    if (sh.playerBdlId != null) touched.add(sh.playerBdlId);
  });

  await eachItem(teamStats.data, async (f) => {
    const ts = mapTeamStat(f);
    if (ts.matchBdlId !== ctx.bdlId) return void foreignSkipped++;
    await store.upsertTeamStat(ts);
  });

  if (foreignSkipped > 0) {
    // The feed returned cross-match rows — the 2026-06-12 root external cause. Operator-visible signal.
    console.warn(
      `[ingest.live.foreign_skipped] ${JSON.stringify({ matchBdlId: ctx.bdlId, count: foreignSkipped })}`,
    );
  }

  // events/shots/team_stats have no `dirty` column → enqueue player-match markers explicitly.
  await store.markPlayersDirty(ctx.bdlId, [...touched]);

  // Self-heal any played starter/sub whose pre_match XI-pull or live event was missed (coverage gap).
  await reconcileAppearanceLocks(store, ctx);
}

/** Settle: re-pull stats + shots + the rating until values stabilize, then reconcile lock-on-play against
 *  the appeared set (no event-driven sub-locking here — events aren't pulled in settle). */
export async function ingestSettle(
  feed: FeedClient,
  store: IngestStore,
  ctx: MatchCtx,
): Promise<void> {
  const [stats, shots] = await Promise.all([
    feed.playerMatchStats({ matchId: ctx.bdlId }),
    feed.matchShots({ matchId: ctx.bdlId }),
  ]);
  const touched = new Set<number>();
  // Same foreign-event guard as ingestLive: drop any row whose own match ≠ this match (unfiltered feed).
  let foreignSkipped = 0;
  await eachItem(stats.data, async (f) => {
    const row = mapStatLine(f);
    if (row.matchBdlId !== ctx.bdlId) return void foreignSkipped++;
    await store.upsertStatLine(row);
    const r = mapRating(f);
    await store.upsertRatingBalldontlie(r.matchBdlId, r.playerBdlId, r.rating);
    touched.add(row.playerBdlId);
  });
  await eachItem(shots.data, async (f) => {
    const sh = mapShot(f);
    if (sh.matchBdlId !== ctx.bdlId) return void foreignSkipped++;
    await store.upsertShot(sh);
    if (sh.playerBdlId != null) touched.add(sh.playerBdlId);
  });
  if (foreignSkipped > 0) {
    console.warn(
      `[ingest.settle.foreign_skipped] ${JSON.stringify({ matchBdlId: ctx.bdlId, count: foreignSkipped })}`,
    );
  }
  await store.markPlayersDirty(ctx.bdlId, [...touched]);

  // The lock-on-play coverage net: a completed match's pre_match/live stamps can't re-fire, so stamp
  // every appeared player here. This is what fixes the partially-locked completed-match XI going forward.
  await reconcileAppearanceLocks(store, ctx);
}

/**
 * Team-stats-only backfill for ONE match (T17). Pulls the BALLDONTLIE team aggregates and upserts them
 * via the SAME {@link mapTeamStat} + `store.upsertTeamStat` path ingestLive's team block uses — same
 * per-item isolation ({@link eachItem}) and the same FOREIGN-EVENT GUARD (drop rows whose own match ≠
 * this match). It pulls ONLY `team_match_stats` and writes ONLY `stat_team_match`: it does NOT touch
 * player stats/events/shots, does NOT mark any player dirty, and triggers NO recompute (stat_team_match
 * is display-only). Exists because the `settle` path deliberately does not re-pull team stats, so matches
 * completed before `mapTeamStat` began retaining `extra` need an explicit re-ingest to enrich it.
 * Idempotent via the `(matchId, teamId)` upsert. Returns counts for operator logging.
 */
export async function ingestTeamStats(
  feed: FeedClient,
  store: IngestStore,
  matchBdlId: number,
): Promise<{ upserted: number; foreignSkipped: number }> {
  const teamStats = await feed.teamMatchStats({ matchId: matchBdlId });
  let upserted = 0;
  let foreignSkipped = 0;
  await eachItem(teamStats.data, async (f) => {
    const ts = mapTeamStat(f);
    if (ts.matchBdlId !== matchBdlId) return void foreignSkipped++;
    await store.upsertTeamStat(ts);
    upserted++;
  });
  return { upserted, foreignSkipped };
}

/**
 * Group-standings backfill/refresh (T18). A SINGLE non-paginated `group_standings` feed call (all 12
 * groups, ~48 rows for WC2026) → pure {@link mapGroupStanding} → idempotent `store.upsertGroupStanding`,
 * with the SAME per-item isolation ({@link eachItem}) as the other ingests. Display-only / fantasy-safe:
 * it writes ONLY `group_standing`, does NOT touch player stats/events/shots, marks NOTHING dirty, and
 * triggers NO recompute. The store FOREIGN-GUARDS each row (a team not yet in `fifa_team` is skipped and
 * counted in `foreignSkipped`). Idempotent via the `team_id` upsert — safe to re-run after each matchday.
 * Returns counts for operator logging. Defaults to season 2026.
 */
export async function ingestGroupStandings(
  feed: FeedClient,
  store: IngestStore,
  season = 2026,
): Promise<{ fetched: number; upserted: number; foreignSkipped: number }> {
  const standings = await feed.groupStandings({ seasons: [season] });
  let upserted = 0;
  let foreignSkipped = 0;
  await eachItem(standings.data, async (f) => {
    const wrote = await store.upsertGroupStanding(mapGroupStanding(f));
    if (wrote) upserted++;
    else foreignSkipped++;
  });
  return { fetched: standings.data.length, upserted, foreignSkipped };
}
