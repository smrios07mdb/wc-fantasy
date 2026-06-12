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
 * player still stamps. Period-scoped + monotonic via `setLockedAt` (only `locked_at IS NULL` slots in the
 * match's period change → never another period's slots, never an already-set lock) ⇒ no phantom lock.
 */
async function reconcileAppearanceLocks(store: IngestStore, ctx: MatchCtx): Promise<void> {
  const appeared = await store.listAppearedPlayerBdlIds(ctx.bdlId);
  for (const lock of lockInstantsFromAppearances(appeared, ctx.kickoffAt, ctx.now)) {
    await store.setLockedAt(ctx.bdlId, lock.playerBdlId, lock.lockedAt);
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
  const officialStarterBdlIds: number[] = [];
  for (const lineup of res.data) {
    const entries: LineupAppearance[] = lineup.entries.map((e) => ({
      playerBdlId: e.player_id,
      isStarter: e.is_starter,
    }));
    for (const e of entries) {
      if (e.isStarter) officialStarterBdlIds.push(e.playerBdlId);
    }
    for (const lock of lockInstantsFromLineup(entries, ctx.kickoffAt, ctx.now)) {
      await store.setLockedAt(ctx.bdlId, lock.playerBdlId, lock.lockedAt);
    }
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

  await eachItem(stats.data, async (f) => {
    const row = mapStatLine(f);
    await store.upsertStatLine(row);
    const r = mapRating(f);
    await store.upsertRatingBalldontlie(r.matchBdlId, r.playerBdlId, r.rating);
    touched.add(row.playerBdlId);
  });

  await eachItem(events.data, async (f) => {
    const e = mapEvent(f);
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
      if (lock) await store.setLockedAt(ctx.bdlId, lock.playerBdlId, lock.lockedAt);
    }
  });

  await eachItem(shots.data, async (f) => {
    const sh = mapShot(f);
    await store.upsertShot(sh);
    if (sh.playerBdlId != null) touched.add(sh.playerBdlId);
  });

  await eachItem(teamStats.data, async (f) => {
    await store.upsertTeamStat(mapTeamStat(f));
  });

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
  await eachItem(stats.data, async (f) => {
    const row = mapStatLine(f);
    await store.upsertStatLine(row);
    const r = mapRating(f);
    await store.upsertRatingBalldontlie(r.matchBdlId, r.playerBdlId, r.rating);
    touched.add(row.playerBdlId);
  });
  await eachItem(shots.data, async (f) => {
    const sh = mapShot(f);
    await store.upsertShot(sh);
    if (sh.playerBdlId != null) touched.add(sh.playerBdlId);
  });
  await store.markPlayersDirty(ctx.bdlId, [...touched]);

  // The lock-on-play coverage net: a completed match's pre_match/live stamps can't re-fire, so stamp
  // every appeared player here. This is what fixes the partially-locked completed-match XI going forward.
  await reconcileAppearanceLocks(store, ctx);
}
