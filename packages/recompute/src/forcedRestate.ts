/**
 * Commissioner FORCED restatement — the decision + orchestration behind `job:recompute`.
 *
 * Unlike {@link ./recompute sweep}, which DRAINS the dirty markers and only touches what changed, this
 * rebuilds scores from CURRENT state unconditionally: `recomputeManagerPeriod` for EVERY manager ×
 * period, then `recomputeStanding` for the league. It never reads a dirty flag — it is the operator's
 * "rebuild the scores now" lever after a scoring rule or data fix (mirrors the period-close split: the
 * pure decision lives here, the thin Prisma body in `apps/worker/src/jobs/recompute.ts`).
 *
 * The frozen gate is the same as the sweep's: a frozen period is left untouched unless `allowFrozen`
 * (commissioner override). `planForcedRestate` makes that the decision up front so the body can log/scope
 * accurately, and `recomputeManagerPeriod`'s own gate is an additional backstop.
 */
import { recomputeManagerPeriod, recomputeStanding, type RecomputeOptions } from "./recompute";
import type { ManagerPeriodRef, RecomputeStore } from "./store";

/** The minimal period view the planner needs (the body reads these from `period` rows). */
export interface ForcedRestatePeriod {
  id: string;
  /** Display label — matched (case-insensitive, trimmed) against an optional `--period` filter. */
  label: string;
  /** `period.frozen_at` — a frozen period is skipped unless `allowFrozen`. */
  frozenAt: Date | null;
}

export interface ForcedRestateOptions {
  /** Restrict the restatement to the period whose `label` matches (case-insensitive, trimmed). Null /
   *  undefined ⇒ ALL periods. */
  periodLabel?: string | null;
  /** Commissioner override: include FROZEN periods (mirrors `sweep`'s `allowFrozen`). Default false. */
  allowFrozen?: boolean;
}

export interface ForcedRestatePlan {
  /** The (manager, period) pairs to recompute, period-major then manager order (deterministic). */
  pairs: ManagerPeriodRef[];
  /** Period ids that WILL be recomputed (selected, minus frozen-without-override). */
  periodsToRecompute: string[];
  /** Period ids selected by the filter but skipped because frozen and no override. */
  skippedFrozenPeriods: string[];
  /** True when a `--period` filter was given but matched no period (operator typo). */
  periodFilterMatchedNothing: boolean;
}

export interface ForcedRestateSummary {
  /** (manager, period) recomputes actually executed (skips excluded). */
  managerPeriods: number;
  /** Standing rows written by `recomputeStanding`. */
  standingRows: number;
}

/**
 * PURE decision: which (manager, period) pairs a forced restatement should recompute. Applies the
 * optional `--period` label filter (case-insensitive, trimmed) and the frozen gate, and surfaces an
 * unmatched filter so the body can fail loudly on a typo. No IO, no clock.
 */
export function planForcedRestate(
  managerIds: readonly string[],
  periods: readonly ForcedRestatePeriod[],
  opts: ForcedRestateOptions = {},
): ForcedRestatePlan {
  const want = opts.periodLabel?.trim().toLowerCase() ?? null;
  const selected =
    want === null ? [...periods] : periods.filter((p) => p.label.trim().toLowerCase() === want);
  const periodFilterMatchedNothing = want !== null && selected.length === 0;

  const periodsToRecompute: string[] = [];
  const skippedFrozenPeriods: string[] = [];
  for (const p of selected) {
    if (p.frozenAt !== null && !opts.allowFrozen) skippedFrozenPeriods.push(p.id);
    else periodsToRecompute.push(p.id);
  }

  const pairs: ManagerPeriodRef[] = [];
  for (const periodId of periodsToRecompute) {
    for (const managerId of managerIds) pairs.push({ managerId, periodId });
  }

  return { pairs, periodsToRecompute, skippedFrozenPeriods, periodFilterMatchedNothing };
}

/**
 * Execute a {@link ForcedRestatePlan} against the store: recompute each (manager, period) pair, then the
 * league standing. `opts.allowFrozen` is threaded into `recomputeManagerPeriod` (a no-op for non-frozen
 * periods; permits restating the frozen ones the plan deliberately included). Standing is always
 * recomputed at the end — it is idempotent, so an empty plan leaves it unchanged.
 */
export async function forcedRestate(
  store: RecomputeStore,
  leagueId: string,
  plan: ForcedRestatePlan,
  opts: RecomputeOptions = {},
): Promise<ForcedRestateSummary> {
  let managerPeriods = 0;
  for (const ref of plan.pairs) {
    const result = await recomputeManagerPeriod(store, ref.managerId, ref.periodId, opts);
    if (!result.skipped) managerPeriods++;
  }
  const standingRows = await recomputeStanding(store, leagueId);
  return { managerPeriods, standingRows };
}
