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
import { lockInstantsFromLineup, lockInstantFromSub, type LineupAppearance } from "./lock";

export interface MatchCtx {
  bdlId: number;
  kickoffAt: Date;
  kickoffLockFallback: boolean;
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

/** Pre-match: pull the confirmed XI and lock every official starter at kickoff. */
export async function ingestLineups(
  feed: FeedClient,
  store: IngestStore,
  ctx: MatchCtx,
): Promise<void> {
  const res = await feed.matchLineups({ matchId: ctx.bdlId });
  for (const lineup of res.data) {
    const entries: LineupAppearance[] = lineup.entries.map((e) => ({
      playerBdlId: e.player_id,
      isStarter: e.is_starter,
    }));
    for (const lock of lockInstantsFromLineup(entries, ctx.kickoffAt)) {
      await store.setLockedAt(ctx.bdlId, lock.playerBdlId, lock.lockedAt);
    }
  }
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

  for (const f of stats.data) {
    const row = mapStatLine(f);
    await store.upsertStatLine(row);
    const r = mapRating(f);
    await store.upsertRatingBalldontlie(r.matchBdlId, r.playerBdlId, r.rating);
    touched.add(row.playerBdlId);
  }

  for (const f of events.data) {
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
      );
      if (lock) await store.setLockedAt(ctx.bdlId, lock.playerBdlId, lock.lockedAt);
    }
  }

  for (const f of shots.data) {
    const sh = mapShot(f);
    await store.upsertShot(sh);
    if (sh.playerBdlId != null) touched.add(sh.playerBdlId);
  }

  for (const f of teamStats.data) await store.upsertTeamStat(mapTeamStat(f));

  // events/shots/team_stats have no `dirty` column → enqueue player-match markers explicitly.
  await store.markPlayersDirty(ctx.bdlId, [...touched]);
}

/** Settle: re-pull stats + shots + the rating until values stabilize (same writes as live, no sub-locking). */
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
  for (const f of stats.data) {
    const row = mapStatLine(f);
    await store.upsertStatLine(row);
    const r = mapRating(f);
    await store.upsertRatingBalldontlie(r.matchBdlId, r.playerBdlId, r.rating);
    touched.add(row.playerBdlId);
  }
  for (const f of shots.data) {
    const sh = mapShot(f);
    await store.upsertShot(sh);
    if (sh.playerBdlId != null) touched.add(sh.playerBdlId);
  }
  await store.markPlayersDirty(ctx.bdlId, [...touched]);
}
