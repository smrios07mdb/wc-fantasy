/**
 * Recompute orchestration — the deterministic glue that turns dirty inputs into scores by calling
 * the pure engine (Prompt 02) through the {@link RecomputeStore} port. No feed HTTP, no scraper.
 *
 * Idempotency is by ORDERING, not distributed transactions (ARCHITECTURE.md §8 — no bus at this
 * scale): because a score is a pure function of its stored inputs, re-running converges. Each unit
 * writes its derived row(s) and enqueues downstream markers BEFORE clearing its own dirty flag, so a
 * crash mid-unit simply re-runs and is harmless. Running a clean sweep twice is a no-op.
 */
import { scorePlayerMatch, scoreManagerPeriod } from "@app/scoring";
import { buildScoreInput } from "./adapter";
import type { ManagerPeriodRef, PlayerMatchRef, RecomputeStore } from "./store";

export interface RecomputeOptions {
  /** Commissioner override: permit restating a FROZEN period (DECISIONS → Theme C). Default false. */
  allowFrozen?: boolean;
}

export interface PlayerMatchResult extends PlayerMatchRef {
  points: number;
}

export interface ManagerPeriodResult extends ManagerPeriodRef {
  points: number;
  /** True when skipped because the period is frozen and no override was passed. */
  skipped: boolean;
}

export interface SweepResult {
  playerMatches: number;
  managerPeriods: number;
  /** Manager-periods left unprocessed because their period is frozen (no override). */
  skippedFrozen: number;
}

/**
 * Recompute one `score_player_match`: gather rows → adapter → engine → upsert, then mark the
 * affected (manager, period) pairs dirty and clear this input's dirty flag (last). Returns null if
 * the (match, player) has no input rows.
 */
export async function recomputePlayerMatch(
  store: RecomputeStore,
  matchId: string,
  playerId: string,
): Promise<PlayerMatchResult | null> {
  const bundle = await store.getPlayerMatchInput(matchId, playerId);
  if (!bundle) return null;

  const breakdown = scorePlayerMatch(buildScoreInput(bundle));
  await store.writeScorePlayerMatch(matchId, playerId, breakdown);

  for (const ref of await store.getAffectedManagerPeriods(matchId, playerId)) {
    await store.enqueueManagerPeriodDirty(ref);
  }
  await store.clearRawDirty(matchId, playerId); // last: keeps re-runs safe

  return { matchId, playerId, points: breakdown.total };
}

/**
 * Recompute one `score_manager_period`: sum the manager's STARTER slots (bench excluded; an
 * unplayed starter contributes 0 — the Prompt-02 contract), upsert, and mark `standing` dirty. The
 * FROZEN gate: a frozen period is NOT restated unless `allowFrozen` (commissioner override).
 */
export async function recomputeManagerPeriod(
  store: RecomputeStore,
  managerId: string,
  periodId: string,
  opts: RecomputeOptions = {},
): Promise<ManagerPeriodResult> {
  if (!opts.allowFrozen && (await store.isPeriodFrozen(periodId))) {
    return { managerId, periodId, points: 0, skipped: true };
  }

  const slots = await store.getManagerPeriodSlots(managerId, periodId);
  const { total } = scoreManagerPeriod({ slots });
  await store.writeScoreManagerPeriod(managerId, periodId, total);

  const leagueId = await store.getManagerLeagueId(managerId);
  if (leagueId) await store.enqueueStandingDirty(leagueId, managerId); // marked only — not computed here

  return { managerId, periodId, points: total, skipped: false };
}

/**
 * Drain the dirty markers and walk the chain `(match,player) → (manager,period) → standing`,
 * clearing flags as it goes. Idempotent: a second sweep with no new writes does nothing. `standing`
 * is only MARKED dirty (its computation is the next prompt). Frozen periods are skipped unless
 * `allowFrozen`.
 */
export async function sweep(
  store: RecomputeStore,
  opts: RecomputeOptions = {},
): Promise<SweepResult> {
  // Phase 1 — player-match: recompute every dirty (match, player), enqueueing manager-period markers.
  const dirtyPlayerMatches = await store.listDirtyPlayerMatches();
  for (const pm of dirtyPlayerMatches) {
    await recomputePlayerMatch(store, pm.matchId, pm.playerId);
  }

  // Phase 2 — manager-period: drain the markers, honoring the frozen gate; mark standing dirty.
  const candidates = await store.listDirtyManagerPeriods();
  let managerPeriods = 0;
  let skippedFrozen = 0;
  for (const mp of candidates) {
    const result = await recomputeManagerPeriod(store, mp.managerId, mp.periodId, opts);
    if (result.skipped) {
      skippedFrozen++; // leave the marker unprocessed for a later commissioner-override sweep
      continue;
    }
    await store.markManagerPeriodProcessed(mp); // last in its unit
    managerPeriods++;
  }

  return { playerMatches: dirtyPlayerMatches.length, managerPeriods, skippedFrozen };
}
