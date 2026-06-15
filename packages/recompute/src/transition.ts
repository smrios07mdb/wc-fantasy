/**
 * Group→playoff TRANSITION derivation — PURE (DECISIONS.md → Theme C; ARCHITECTURE.md §9).
 *
 * At the end of the group stage the league collapses into a guillotine SURVIVAL LADDER over the World
 * Cup's 5 knockout rounds (R32 → R16 → QF → SF → Final). This module derives the two fixed inputs the
 * transition job writes ONCE:
 *   1. {@link selectPlayoffField} — the seeded top-N field from the final group standings.
 *   2. {@link cutScheduleFor} — the per-round elimination schedule that collapses the field to one
 *      champion: `field − 1` eliminations distributed across the 5 rounds, FRONT-LOADED (non-increasing)
 *      and each round ≥ 1.
 *
 * Both are deterministic pure functions of their inputs (no IO/clock/db) — the §4 load-bearing principle,
 * so the transition is recomputable from the stored standings exactly like a score. Applying the result
 * (writing `playoff_entry`, the knockout periods' `cut_count`, releasing rosters, resetting FAAB, flipping
 * `league.status`) is the transactional job (apps/worker); RUNNING each round (calling
 * {@link ./guillotine.selectGuillotineCuts} at round close) is the later Phase-2 prompt. This phase only
 * sets up the field + schedule those consume.
 */
import { KNOCKOUT_ROUNDS, type KnockoutRound } from "@app/shared";

/** The minimum playoff field size: `field − 1` eliminations across 5 rounds with each round ≥ 1 requires
 *  `field − 1 ≥ 5`, i.e. a field of at least 6 (DECISIONS.md → Theme C; the locked examples start at 6). */
export const MIN_PLAYOFF_FIELD = KNOCKOUT_ROUNDS.length + 1; // 6

/** One seeded member of the playoff field. `seed` is the group-stage seed (1 = best), carried verbatim. */
export interface PlayoffFieldEntry {
  managerId: string;
  seed: number;
}

/** A seeded standing row as the caller hands it over (a `standing` table row, or a `computeStandings`
 *  result — both carry the same `{ managerId, seed }`). Only these two fields are read. */
export interface SeededStanding {
  managerId: string;
  seed: number;
}

/**
 * The seeded top-N playoff field from the FINAL group standings. Takes the `fieldSize` lowest seeds (1 =
 * best) and returns them in seed order, seeds carried verbatim — no re-seeding (the playoff seeds ARE the
 * group seeds, the Theme-C decision). Throws on a malformed request rather than silently truncating:
 *   - `fieldSize < MIN_PLAYOFF_FIELD` (6) — the cut schedule could not give every round ≥ 1;
 *   - `fieldSize > standings.length` — not enough managers to fill the field;
 *   - duplicate or non-contiguous seeds — a corrupt standings input (each seed must be unique).
 */
export function selectPlayoffField(
  standings: readonly SeededStanding[],
  fieldSize: number,
): PlayoffFieldEntry[] {
  if (!Number.isInteger(fieldSize)) {
    throw new Error(`selectPlayoffField: fieldSize must be an integer, got ${fieldSize}`);
  }
  if (fieldSize < MIN_PLAYOFF_FIELD) {
    throw new Error(
      `selectPlayoffField: fieldSize ${fieldSize} < minimum ${MIN_PLAYOFF_FIELD} (each of the ${KNOCKOUT_ROUNDS.length} rounds must cut ≥ 1)`,
    );
  }
  if (fieldSize > standings.length) {
    throw new Error(
      `selectPlayoffField: fieldSize ${fieldSize} exceeds the ${standings.length} managers in the standings`,
    );
  }
  const seeds = new Set(standings.map((s) => s.seed));
  if (seeds.size !== standings.length) {
    throw new Error("selectPlayoffField: standings carry duplicate seeds (corrupt input)");
  }
  return [...standings]
    .sort((a, b) => a.seed - b.seed)
    .slice(0, fieldSize)
    .map((s) => ({ managerId: s.managerId, seed: s.seed }));
}

/** One knockout round's cut entry: the WC round label + how many managers it eliminates. */
export interface CutScheduleEntry {
  round: KnockoutRound;
  cutCount: number;
}

/**
 * The canonical per-round cut schedule (DECISIONS.md → Theme C, locked): distribute `field − 1`
 * eliminations across the 5 WC knockout rounds, FRONT-LOADED (non-increasing) with each round ≥ 1.
 * Deterministic: `base = ⌊(field−1)/5⌋`, remainder `r = (field−1) mod 5`; the first `r` rounds cut
 * `base + 1`, the rest cut `base`. Because `field ≥ 6 ⇒ base ≥ 1`, every round cuts at least one.
 *
 * Examples (the locked cases): 6→{1,1,1,1,1}, 8→{2,2,1,1,1}, 10→{2,2,2,2,1}, 12→{3,2,2,2,2}. The sum is
 * always `field − 1` (one champion remains after the Final). Supersedes the design's illustrative preset.
 */
export function cutScheduleFor(fieldSize: number): CutScheduleEntry[] {
  if (!Number.isInteger(fieldSize)) {
    throw new Error(`cutScheduleFor: fieldSize must be an integer, got ${fieldSize}`);
  }
  if (fieldSize < MIN_PLAYOFF_FIELD) {
    throw new Error(
      `cutScheduleFor: fieldSize ${fieldSize} < minimum ${MIN_PLAYOFF_FIELD} (each round must cut ≥ 1)`,
    );
  }
  const rounds = KNOCKOUT_ROUNDS.length; // 5
  const toCut = fieldSize - 1;
  const base = Math.floor(toCut / rounds);
  const remainder = toCut % rounds;
  return KNOCKOUT_ROUNDS.map((round, i) => ({
    round,
    cutCount: base + (i < remainder ? 1 : 0),
  }));
}

/** One manager's CURRENT rolling waiver position as the store hands it over (`null` = unseeded). */
export interface WaiverOrderSlot {
  managerId: string;
  waiverOrderPosition: number | null;
}

/** A surviving manager's NEW contiguous (1..K) waiver position after the carry-forward. */
export interface CarriedWaiverSlot {
  managerId: string;
  position: number;
}

/**
 * Carry the rolling waiver order forward across the group→playoff transition (DECISIONS.md → Theme D:
 * "the rolling waiver order carries forward (eliminated managers removed)"). Take the LIVE league-wide
 * order, KEEP only the surviving (advancing) managers, PRESERVE their relative order, and re-pack to a
 * contiguous `1..K` — NO re-seed (it is NOT reverse-draft-reseeded like the initial provisioning order).
 * The non-advancers are dropped entirely; the caller clears their `waiver_order_position` to NULL (the
 * `@@unique([leagueId, waiverOrderPosition])` index allows multiple NULLs). Pure + deterministic.
 *
 * Survivors are ranked by their CURRENT `waiverOrderPosition` ascending (the live order). A survivor with
 * a NULL position (unseeded — should not happen post-draft, but handled rather than crashed) sorts AFTER
 * every positioned survivor; ties break by `managerId` asc so the result is a total deterministic order.
 * Throws if a `survivingManagerIds` entry is absent from `current` (a corrupt caller) instead of silently
 * dropping a survivor from the field.
 */
export function carryForwardWaiverOrder(
  current: readonly WaiverOrderSlot[],
  survivingManagerIds: readonly string[],
): CarriedWaiverSlot[] {
  const positionById = new Map(current.map((s) => [s.managerId, s.waiverOrderPosition] as const));
  // A duplicate survivor id is a caller bug — re-packing it twice would mint a duplicate position.
  const survivors = new Set(survivingManagerIds);
  if (survivors.size !== survivingManagerIds.length) {
    throw new Error("carryForwardWaiverOrder: survivingManagerIds contains a duplicate");
  }
  for (const id of survivors) {
    if (!positionById.has(id)) {
      throw new Error(
        `carryForwardWaiverOrder: surviving manager ${id} is absent from the current order`,
      );
    }
  }
  // NULL positions sort last (Infinity); positioned survivors keep their live relative order.
  return [...survivors]
    .sort((a, b) => {
      const pa = positionById.get(a) ?? Number.POSITIVE_INFINITY;
      const pb = positionById.get(b) ?? Number.POSITIVE_INFINITY;
      return pa - pb || (a < b ? -1 : a > b ? 1 : 0);
    })
    .map((managerId, i) => ({ managerId, position: i + 1 }));
}
