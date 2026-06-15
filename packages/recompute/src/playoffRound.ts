/**
 * Playoff per-round APPLICATION glue — PURE (DECISIONS.md → Theme C; ARCHITECTURE.md §9).
 *
 * This is the resolution layer that sits ABOVE the (untouched) cut SELECTOR {@link selectGuillotineCuts}:
 * given one knockout round's `{ managerId, points }` for the managers still ALIVE, the cumulative
 * tournament totals (the boundary tiebreak), and the round's `cut_count`, it produces the resolved cut and
 * classifies the outcome —
 *   • `determined`        — the selector fully settled the cut (round score + cumulative tiebreak);
 *   • `needsCommissioner` — a boundary tie survives the tiebreak; the commissioner must adjudicate;
 *   • `invalid-tiebreak`  — a `--break-tie` choice was supplied but is malformed (not the right set/count).
 *
 * It NEVER reimplements `selectGuillotineCuts`. For adjudication it re-invokes the SAME pure selector with
 * the named managers' cumulative totals sunk below every other (and the surviving tied managers' raised
 * above), so the selector deterministically cuts exactly `(the already-determined cuts) ∪ (the named)` —
 * never an arbitrary auto-cut. {@link championAfterCut} is the lone-survivor predicate the final round
 * uses to flip the last manager to `champion`. Pure + deterministic: no IO, no clock, no db.
 *
 * APPLYING the resolution (flipping `playoff_entry.status`, the frozen/idempotency/ordering preconditions,
 * the commissioner gate + audit) is the worker orchestrator (`apps/worker/src/commish/advance.ts`); this
 * module only DECIDES.
 */
import { selectGuillotineCuts } from "./guillotine";
import type { ManagerPeriodPoints } from "./standing";

const cmpId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export interface RoundCutInput {
  /** This round's `{ managerId, points }` for the managers still alive (1 row per alive manager). */
  aliveRoundScores: ManagerPeriodPoints[];
  /** manager → Σ tournament points to date (the boundary tiebreak). Missing → 0 (selector's default). */
  cumulativeTotals: ReadonlyMap<string, number>;
  /** How many managers this round eliminates (`period.cut_count`). */
  cutCount: number;
  /** Commissioner adjudication: the managers chosen to be cut from the residual tied set (`--break-tie`).
   *  Only meaningful when the selector returns a residual tie; ignored (rejected) otherwise. */
  breakTie?: readonly string[];
}

export type RoundCutResolution =
  | { kind: "determined"; eliminated: string[]; survivors: string[]; champion: string | null }
  | { kind: "needsCommissioner"; tied: string[]; cutsRemaining: number }
  | { kind: "invalid-tiebreak"; reason: string; tied: string[]; cutsRemaining: number };

/** The lone-survivor predicate: after the cut, exactly one alive manager remains ⇒ the champion. */
export function championAfterCut(
  aliveIds: readonly string[],
  eliminated: readonly string[],
): string | null {
  const cut = new Set(eliminated);
  const survivors = aliveIds.filter((id) => !cut.has(id));
  return survivors.length === 1 ? survivors[0]! : null;
}

/** Build the `determined` result from a fully-settled eliminated set (sorts both sides for determinism). */
function determined(
  aliveIds: readonly string[],
  eliminated: readonly string[],
): RoundCutResolution {
  const cut = new Set(eliminated);
  return {
    kind: "determined",
    eliminated: [...eliminated].sort(cmpId),
    survivors: aliveIds.filter((id) => !cut.has(id)).sort(cmpId),
    champion: championAfterCut(aliveIds, eliminated),
  };
}

/**
 * Resolve one knockout round's cut. Reuses {@link selectGuillotineCuts} verbatim; on a `--break-tie`
 * adjudication it re-invokes the selector with the cumulative totals nudged so the named managers are the
 * strict-lowest and the spared tied managers the strict-highest — recovering the full eliminated set
 * `(determined cuts) ∪ (named)` from the pure function without duplicating its boundary math.
 */
export function resolveRoundCut(input: RoundCutInput): RoundCutResolution {
  const { aliveRoundScores, cumulativeTotals, cutCount, breakTie } = input;
  const aliveIds = aliveRoundScores.map((s) => s.managerId);

  const cuts = selectGuillotineCuts(aliveRoundScores, cumulativeTotals, cutCount);

  // Fully determined by round score + cumulative tiebreak — a supplied --break-tie is then meaningless.
  if (cuts.eliminated) {
    if (breakTie && breakTie.length > 0) {
      return {
        kind: "invalid-tiebreak",
        reason: "the cut is fully determined — there is no boundary tie to break",
        tied: [],
        cutsRemaining: 0,
      };
    }
    return determined(aliveIds, cuts.eliminated);
  }

  // A boundary tie survived the cumulative tiebreak.
  const tied = [...cuts.tied!];
  const cutsRemaining = cuts.cutsRemaining!;
  if (!breakTie || breakTie.length === 0) {
    return { kind: "needsCommissioner", tied, cutsRemaining };
  }

  // Validate the adjudication: a unique subset of `tied` of exactly `cutsRemaining` managers.
  const named = [...new Set(breakTie)];
  const tiedSet = new Set(tied);
  if (named.length !== cutsRemaining || !named.every((id) => tiedSet.has(id))) {
    return {
      kind: "invalid-tiebreak",
      reason: `--break-tie must name exactly ${cutsRemaining} manager(s) from the tied set {${tied.join(", ")}}`,
      tied,
      cutsRemaining,
    };
  }

  // Re-resolve via the SAME selector with the tie broken: sink the named below all, raise the spared
  // above all. The already-determined cuts keep their (lower) totals, so the selector now cuts exactly
  // those plus the named, with no residual tie.
  const namedSet = new Set(named);
  const vals = [...cumulativeTotals.values()];
  const floor = Math.min(0, ...vals);
  const ceil = Math.max(0, ...vals);
  const adjusted = new Map(cumulativeTotals);
  named.forEach((id, i) => adjusted.set(id, floor - 1 - i));
  tied.filter((id) => !namedSet.has(id)).forEach((id, i) => adjusted.set(id, ceil + 1 + i));

  const decided = selectGuillotineCuts(aliveRoundScores, adjusted, cutCount);
  if (!decided.eliminated) {
    // A validated adjudication MUST fully settle the cut; a residual tie here is an internal inconsistency.
    throw new Error("resolveRoundCut: adjudicated tie did not resolve — internal inconsistency");
  }
  return determined(aliveIds, decided.eliminated);
}
