/**
 * Roster legality — PURE. The squad shape is the LOCKED 15-man composition (2 GK / 5 DEF / 5 MID /
 * 3 FWD, DECISIONS.md → Theme B), sourced from @app/shared so the rule lives in exactly one place.
 * A pick is legal iff it does not push a position past its cap; a squad is complete once every cap is
 * met (which is exactly 15, since the caps sum to SQUAD_SIZE). No clock / IO / env.
 */
import { POSITIONS, SQUAD_COMPOSITION, type Position } from "@app/shared";

/** A manager's current count of actively-owned players per position. */
export type PositionCounts = Readonly<Record<Position, number>>;

/** The zero squad — a convenient starting point for tests and fresh managers. */
export const EMPTY_COUNTS: PositionCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };

/** Is adding one more player of `position` legal — i.e. still within that position's cap? */
export function isPositionLegal(counts: PositionCounts, position: Position): boolean {
  return counts[position] < SQUAD_COMPOSITION[position];
}

/** Is the squad full — every position at its cap (the 15-man squad, no slot left)? */
export function isSquadComplete(counts: PositionCounts): boolean {
  return POSITIONS.every((position) => counts[position] >= SQUAD_COMPOSITION[position]);
}
