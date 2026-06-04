/**
 * Guillotine cut-SELECTION — PURE (DECISIONS.md → Theme C; ARCHITECTURE.md §9).
 *
 * The playoffs are a SURVIVAL LADDER, not a bracket: each knockout round, surviving managers are
 * ranked by that round's score and the lowest `cut_count` are eliminated. This module only *selects*
 * the cuts; APPLYING them (marking managers eliminated, trimming rosters, freeing cut rosters into the
 * FAAB pool, setting each round's `cut_count`) is the later group→playoff transition prompt.
 *
 * Cutoff tie rule: among managers tied at the elimination boundary, cut the one(s) with the LOWEST
 * cumulative tournament total points (Σ over ALL periods to date — regular season + playoffs; the
 * caller computes this on the fly from `score_manager_period`, no stored column). Backstop: if a tie
 * is STILL unbroken after that, we NEVER auto-cut an arbitrary manager — we return `needsCommissioner`
 * so the caller can surface it for adjudication. Deterministic for every input.
 */
import type { ManagerPeriodPoints } from "./standing";

export interface GuillotineCuts {
  /** The fully-determined eliminations (sorted by managerId). Present iff `needsCommissioner` is unset. */
  eliminated?: string[];
  /** True when a boundary tie survives the cumulative-points tiebreak. */
  needsCommissioner?: boolean;
  /** The managers still tied at the boundary (sorted), from which the commissioner must choose. */
  tied?: string[];
  /** How many of `tied` must still be cut. */
  cutsRemaining?: number;
}

const cmpId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Select the eliminations for one knockout round.
 *
 * @param survivorRoundScores this round's `{ managerId, points }` for the managers still alive.
 * @param cumulativeTournamentTotals manager → Σ tournament points to date (the boundary tiebreak).
 *   Missing entries default to `0` — the caller is expected to supply a total for every survivor.
 * @param cutCount how many managers this round eliminates (the locked tapering schedule, e.g. 2…1).
 */
export function selectGuillotineCuts(
  survivorRoundScores: ManagerPeriodPoints[],
  cumulativeTournamentTotals: ReadonlyMap<string, number>,
  cutCount: number,
): GuillotineCuts {
  const survivors = survivorRoundScores;
  // cut_count is an integer count (schema `Period.cut_count Int?`); a fractional value is a caller
  // bug — fail loudly here rather than crash deep in the boundary indexing below (where `!` assumes it).
  if (!Number.isInteger(cutCount)) {
    throw new Error(`selectGuillotineCuts: cut_count must be an integer, got ${cutCount}`);
  }
  if (cutCount <= 0 || survivors.length === 0) return { eliminated: [] };
  if (cutCount >= survivors.length) {
    return { eliminated: survivors.map((s) => s.managerId).sort(cmpId) };
  }

  // The boundary score is the `cut_count`-th lowest round score (index valid: 1 ≤ cutCount < length).
  const asc = [...survivors].sort((a, b) => a.points - b.points || cmpId(a.managerId, b.managerId));
  const boundaryScore = asc[cutCount - 1]!.points;

  const definitelyCut = survivors.filter((s) => s.points < boundaryScore).map((s) => s.managerId);
  const boundaryTied = survivors.filter((s) => s.points === boundaryScore).map((s) => s.managerId);
  const slotsRemaining = cutCount - definitelyCut.length; // always in [1, boundaryTied.length]

  if (slotsRemaining === boundaryTied.length) {
    // Round score alone settles it — every boundary-tied manager is cut.
    return { eliminated: [...definitelyCut, ...boundaryTied].sort(cmpId) };
  }

  // Break the boundary tie by LOWEST cumulative tournament total (ascending).
  const cum = (id: string): number => cumulativeTournamentTotals.get(id) ?? 0;
  const tiedByCum = [...boundaryTied].sort((a, b) => cum(a) - cum(b) || cmpId(a, b));
  const cumBoundary = cum(tiedByCum[slotsRemaining - 1]!); // index valid: 1 ≤ slotsRemaining ≤ length

  const cumDefinitelyCut = boundaryTied.filter((id) => cum(id) < cumBoundary);
  const cumTied = boundaryTied.filter((id) => cum(id) === cumBoundary);
  const subSlotsRemaining = slotsRemaining - cumDefinitelyCut.length; // always in [1, cumTied.length]

  if (subSlotsRemaining === cumTied.length) {
    return { eliminated: [...definitelyCut, ...cumDefinitelyCut, ...cumTied].sort(cmpId) };
  }

  // Still tied after the cumulative tiebreak → commissioner adjudicates; never an arbitrary cut.
  return {
    needsCommissioner: true,
    tied: [...cumTied].sort(cmpId),
    cutsRemaining: subSlotsRemaining,
  };
}
