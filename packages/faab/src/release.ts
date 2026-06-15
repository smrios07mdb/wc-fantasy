/**
 * PURE validation for an immediate DROP-ONLY roster release (DECISIONS §D trim-down). A playoff advancer
 * who carried a 15-man group squad is capped at {@link PLAYOFF_ROSTER}.cap (9) the instant the league flips
 * to `playoff`, but the FAAB swap path can only NET-ZERO (every bid forces a drop+add), so it can never pull
 * a survivor DOWN. This is the missing net-shed: the manager (or the commissioner backstop) names players to
 * release and they are dropped outright.
 *
 * Like the bid/FA validator this is a pure function returning a typed {@link ReleaseError} (as data) or
 * `null` when legal — the roster, the locked set, the cap, and the `allowLocked` / `confirmedUnfillable`
 * flags are all injected, so it is reused by the route handler and the `commish:trim` orchestrator and is
 * unit-testable with literals. The rules, in order:
 *   1. something to drop (a non-empty, owned selection);
 *   2. every drop is actively owned by this manager;
 *   3. no drop is LOCKED by play (lineup_slot.locked_at in a still-open matchday) — UNLESS `allowLocked`
 *      (the commissioner `--allow-locked-slot` carve-out);
 *   4. HARD floor: the post-release squad must keep ≥ {@link PLAYOFF_ROSTER}.starters (7) players, or it
 *      could never field a starting XI (never bypassable);
 *   5. SOFT fillability: a 7–{cap} end state that cannot field a legal playoff XI (a lane too thin —
 *      `canFieldPlayoffXI` is the single-sourced supply check from @app/lineup) is a CONFIRM-GATED warning
 *      (`release-unfillable`) the caller surfaces; the release is allowed once `confirmedUnfillable` is set.
 *      Above the cap (still trimming) fillability is not yet checked. Any post-count in 7..cap is allowed —
 *      the release is NOT forced to land on exactly the cap.
 */
import { canFieldPlayoffXI } from "@app/lineup";
import { PLAYOFF_ROSTER, type Position } from "@app/shared";
import {
  releaseBelowFloor,
  releaseLocked,
  releaseNothing,
  releaseNotOwned,
  releaseUnfillable,
  type ReleaseError,
} from "./errors";

/** A squad member the manager actively owns, with his playing position (the validator's roster input). */
export interface ReleaseRosterPlayer {
  playerId: string;
  position: Position;
}

/** Everything {@link validateRelease} needs — all injected by the IO layer, so the rules stay pure. */
export interface ReleaseValidationInput {
  /** The manager's CURRENT active roster (id + position). */
  roster: readonly ReleaseRosterPlayer[];
  /** The players the manager wants to release. */
  dropIds: readonly string[];
  /** Of the manager's roster, those LOCKED by play in a still-open matchday (the trim window has none). */
  lockedPlayerIds: ReadonlySet<string>;
  /** The phase squad cap (playoff = {@link PLAYOFF_ROSTER}.cap = 9). The fillability band is 7..cap. */
  rosterCap: number;
  /** Commissioner `--allow-locked-slot` carve-out: relax rule 3 so a played player can be released. */
  allowLocked: boolean;
  /** The caller confirmed an unfillable 7–{cap} end state (rule 5) — proceed deliberately. */
  confirmedUnfillable: boolean;
}

/**
 * Validate a drop-only release. Returns a typed {@link ReleaseError} (the soft `release-unfillable` warning
 * included) or `null` when the release is legal. The caller distinguishes the confirm-gated warning by its
 * `code` and re-submits with `confirmedUnfillable: true`.
 */
export function validateRelease(input: ReleaseValidationInput): ReleaseError | null {
  const dropSet = new Set(input.dropIds); // dedupe — a repeated id is one drop

  // (1) something to drop.
  if (dropSet.size === 0) return releaseNothing();

  // (2) every drop is actively owned.
  const ownedIds = new Set(input.roster.map((p) => p.playerId));
  for (const id of dropSet) {
    if (!ownedIds.has(id)) return releaseNotOwned(id);
  }

  // (3) no drop is locked by play — unless the commissioner carve-out is in force.
  if (!input.allowLocked) {
    for (const id of dropSet) {
      if (input.lockedPlayerIds.has(id)) return releaseLocked(id);
    }
  }

  // (4) HARD floor: never leave fewer than the playoff starter count (7). (dropSet ⊆ owned ⇒ exact count.)
  const postCount = input.roster.length - dropSet.size;
  if (postCount < PLAYOFF_ROSTER.starters) {
    return releaseBelowFloor(postCount, PLAYOFF_ROSTER.starters);
  }

  // (5) SOFT fillability (only within the 7..cap band — above the cap the manager is still trimming): a
  //     7–{cap} end state that cannot field a legal playoff XI is a confirm-gated warning.
  if (postCount <= input.rosterCap && !input.confirmedUnfillable) {
    const postCounts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of input.roster) {
      if (!dropSet.has(p.playerId)) postCounts[p.position] += 1;
    }
    if (!canFieldPlayoffXI(postCounts)) return releaseUnfillable(postCount);
  }

  return null;
}
