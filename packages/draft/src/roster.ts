/**
 * Roster legality — PURE. Draft positional caps are LIFTED (DECISIONS.md → Theme B amendment):
 * the draft is shape-unconstrained up to the 15-man total. A pick is legal iff the squad total is
 * still under SQUAD_SIZE; a squad is complete once the total reaches SQUAD_SIZE (any position mix).
 * Lineup/formation bounds (exactly 1 GK, min 3 DEF / 2 MID / 1 FWD) are unchanged — managers must
 * still self-assemble a fieldable XI after drafting. No clock / IO / env.
 */
import { POSITIONS, SQUAD_SIZE, type Position } from "@app/shared";

/** A manager's current count of actively-owned players per position. */
export type PositionCounts = Readonly<Record<Position, number>>;

/** The zero squad — a convenient starting point for tests and fresh managers. */
export const EMPTY_COUNTS: PositionCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };

/** Sum of all per-position counts — the manager's total squad size. */
export function squadTotal(counts: PositionCounts): number {
  return POSITIONS.reduce((acc, pos) => acc + counts[pos], 0);
}

/** Is adding one more player legal — i.e. the squad total is still under SQUAD_SIZE?
 *  The `_position` arg is kept for call-site stability; positional caps are no longer enforced. */
export function isPositionLegal(counts: PositionCounts, _position: Position): boolean {
  return squadTotal(counts) < SQUAD_SIZE;
}

/** Is the squad full — total of SQUAD_SIZE players, any position shape? */
export function isSquadComplete(counts: PositionCounts): boolean {
  return squadTotal(counts) >= SQUAD_SIZE;
}
