/**
 * Post-drop appearance-lock sweep (ARCHITECTURE.md §3 / DECISIONS.md lock-on-play section).
 *
 * `reconcileAppearanceLocks` (inside `ingestLive` / `ingestSettle`) only fires while a match is live
 * or in its 12h settle window.  Once the rating lands or 12h pass the match leaves `decideMatchModes`
 * and is never reconciled again — leaving any slot the live/settle path missed at `locked_at = NULL`.
 *
 * This module closes that gap: on the hourly schedule-sync cadence it scans completed fixtures whose
 * kickoff is within 48 hours of now and re-runs the same `lockInstantsFromAppearances → setLockedAt`
 * path.  The monotonic `IS NULL` latch makes it a no-op for already-locked slots, so it is safe to run
 * repeatedly.  Only matches where ≥1 slot is newly stamped appear in the return value — those entries
 * double as the deploy-gap / outage alert.
 */
import type { IngestStore, SchedulableMatch } from "./store";
import { lockInstantsFromAppearances } from "./lock";

/** 48-hour window: comfortably past the 12h settle ceiling + overnight coverage, bounded so it never
 *  scans the whole tournament history.  Overridable via the `windowMs` parameter (and
 *  `WORKER_LOCK_SWEEP_WINDOW_MS` in the worker config). */
export const APPEARANCE_SWEEP_WINDOW_MS = 48 * 60 * 60_000;

export interface AppearanceSweepEntry {
  matchBdlId: number;
  /** Number of lineup slots that were actually stamped (was NULL → locked_at = kickoff). */
  count: number;
}

/**
 * Scan recently-completed matches and stamp any played-but-unlocked slots.
 *
 * @param store    The ingest IO port (only `listAppearedPlayerBdlIds` + `setLockedAt` are called).
 * @param matches  The schedulable-match list already loaded by the tick (no extra DB call).
 * @param now      The tick's wall clock (gates the lock-write invariant).
 * @param windowMs How far back to look; defaults to {@link APPEARANCE_SWEEP_WINDOW_MS} (48h).
 * @returns        One entry per match where ≥1 slot was newly stamped (empty = clean pass).
 */
export async function sweepCompletedMatchLocks(
  store: IngestStore,
  matches: readonly SchedulableMatch[],
  now: Date,
  windowMs = APPEARANCE_SWEEP_WINDOW_MS,
): Promise<AppearanceSweepEntry[]> {
  const cutoffMs = now.getTime() - windowMs;
  const stamped: AppearanceSweepEntry[] = [];

  for (const match of matches) {
    if (match.status !== "completed") continue;
    if (match.kickoffMs < cutoffMs) continue; // outside the 48h window → skip

    const appeared = await store.listAppearedPlayerBdlIds(match.bdlId);
    const locks = lockInstantsFromAppearances(appeared, new Date(match.kickoffMs), now);
    if (locks.length === 0) continue;

    let count = 0;
    for (const lock of locks) {
      if (await store.setLockedAt(match.bdlId, lock.playerBdlId, lock.lockedAt)) count++;
    }
    if (count > 0) stamped.push({ matchBdlId: match.bdlId, count });
  }

  return stamped;
}
