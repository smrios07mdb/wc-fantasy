/**
 * The ONE place the 3rd-place play-off is special-cased for the /pool (T-3RD). The pure @app/pool engine's
 * contract designates the IO loader as where `periodKind` is resolved (`fifa_match.periodId → period.kind`;
 * see packages/pool/src/pool.ts), so synthesizing the period HERE — at the loader boundary — keeps the pure
 * engine AND poolView.ts byte-untouched.
 *
 * The 3rd-place match ("Match for 3rd place") deliberately keeps `period_id = NULL` so it stays invisible to
 * lineups, player scoring, the guillotine cut ladder, and /playoffs (loadPlayoffs keys on `period.kind`, so a
 * real 6th knockout period would peg the live-round index on it forever and the tournament would never report
 * `complete` — DECISIONS → 3rd-place). To still surface it as a pickable, scored 2-way pick, this helper maps
 * `is_third_place` → a synthetic `knockout_round` / "3P" period: `derivePoolResult` then scores it as a 2-way
 * (FT→ET→pens), and `selectPoolPicksView`'s defensive branch renders a non-canonical knockout label as its
 * own bracket round. Every other fixture passes through with its real `period.kind` / `period.label`.
 */
import type { PeriodKind } from "@app/shared";

/**
 * The synthesized canonical label for the 3rd-place play-off in the /pool bracket. POOL-LOCAL on purpose —
 * it is NOT added to `@app/shared` KNOCKOUT_ROUNDS (that constant is the guillotine cut ladder and must stay
 * exactly the 5 rounds R32…Final).
 */
export const THIRD_PLACE_POOL_LABEL = "3P";

export interface PoolPeriodSource {
  /** The 3rd-place play-off marker (`fifa_match.is_third_place`). */
  readonly isThirdPlace: boolean;
  /** The linked period, or null when unseeded (the 3rd-place match is ALWAYS period-less). */
  readonly period: { readonly kind: PeriodKind; readonly label: string | null } | null;
}

/** Resolve the period kind/label the pure @app/pool engine should see for one /pool fixture. */
export function resolvePoolPeriod(match: PoolPeriodSource): {
  periodKind: PeriodKind | null;
  periodLabel: string | null;
} {
  if (match.isThirdPlace) {
    return { periodKind: "knockout_round", periodLabel: THIRD_PLACE_POOL_LABEL };
  }
  return { periodKind: match.period?.kind ?? null, periodLabel: match.period?.label ?? null };
}
