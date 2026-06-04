/**
 * PURE draft-board view logic (no React, no IO). Turns the authoritative {@link DraftRoomState} into
 * the snake grid the board renders, plus the small turn/roster/filter helpers the screen needs. The
 * snake math matches `@app/draft`'s `managerForPick` exactly (round 0 forward, every later round
 * reversed) — the column always belongs to the same slot-ordered manager; only the pick NUMBER zig-zags.
 */
import type { Position } from "@app/shared";
import { POSITIONS, SQUAD_SIZE } from "@app/shared";
import type { DraftManager, DraftPick, DraftRoomState, DraftPlayer } from "./types";

/** The 15-man squad ⇒ 15 board rounds (DECISIONS.md → Theme B; SQUAD_SIZE in @app/shared). */
const SQUAD_ROUNDS = SQUAD_SIZE;

export interface BoardCell {
  /** 0-based round (row). */
  round: number;
  /** 0-based column = the manager's snake slot index. */
  col: number;
  /** 1-based global pick number that lands in this cell. */
  pickNo: number;
  managerId: string;
  /** The made pick, or null for an unfilled slot. */
  pick: DraftPick | null;
  /** True when this is the pick currently on the clock. */
  isCurrent: boolean;
}

export interface BoardRow {
  round: number;
  /** "forward" on even rounds, "backward" on odd — the snake reversal (display arrow). */
  direction: "forward" | "backward";
  cells: BoardCell[];
}

export interface Board {
  rounds: number;
  rows: BoardRow[];
}

/** 0-based round for a 1-based global pick, given N managers. */
export function roundForPick(pickNo: number, n: number): number {
  return Math.floor((pickNo - 1) / n);
}

/** The 1-based global pick number landing in (round, col) under the snake. */
function pickNoAt(round: number, col: number, n: number): number {
  const overall = round % 2 === 0 ? round * n + col : round * n + (n - 1 - col);
  return overall + 1;
}

/** Build the full snake board. Rounds = SQUAD rounds (picks.length-independent — it's the grid shape). */
export function buildBoard(state: DraftRoomState): Board {
  const managers = state.managers;
  const n = managers.length;
  const rounds = SQUAD_ROUNDS;
  const byPickNo = new Map<number, DraftPick>(state.picks.map((p) => [p.pickNo, p]));

  const rows: BoardRow[] = [];
  for (let r = 0; r < rounds; r++) {
    const cells: BoardCell[] = [];
    for (let c = 0; c < n; c++) {
      const pickNo = pickNoAt(r, c, n);
      cells.push({
        round: r,
        col: c,
        pickNo,
        managerId: managers[c]!.id,
        pick: byPickNo.get(pickNo) ?? null,
        isCurrent: state.currentPickNo === pickNo && state.status === "active",
      });
    }
    rows.push({ round: r, direction: r % 2 === 0 ? "forward" : "backward", cells });
  }
  return { rounds, rows };
}

/** Is the session manager on the clock in an active draft (i.e. may submit a pick)? */
export function isMyTurn(state: DraftRoomState): boolean {
  return state.status === "active" && state.currentManagerId === state.sessionManagerId;
}

/** The manager row currently on the clock, or null. */
export function onTheClockManager(state: DraftRoomState): DraftManager | null {
  if (state.currentManagerId === null) return null;
  return state.managers.find((m) => m.id === state.currentManagerId) ?? null;
}

/** A manager's made picks (pickNo-ascending). */
export function rosterFor(state: DraftRoomState, managerId: string): DraftPick[] {
  return state.picks.filter((p) => p.managerId === managerId).sort((a, b) => a.pickNo - b.pickNo);
}

/** Per-position counts of a set of picks (display-only — legality is the controller's job). */
export function positionCounts(picks: readonly DraftPick[]): Record<Position, number> {
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of picks) {
    if (p.player) counts[p.player.position] += 1;
  }
  return counts;
}

export interface AvailableFilter {
  query: string;
  position: Position | "ALL";
}

/** Filter the available pool by position + a case-insensitive query over name + country. */
export function filterAvailable(
  players: readonly DraftPlayer[],
  filter: AvailableFilter,
): DraftPlayer[] {
  const q = filter.query.trim().toLowerCase();
  return players.filter((p) => {
    if (filter.position !== "ALL" && p.position !== filter.position) return false;
    if (!q) return true;
    return [p.displayName, p.firstName, p.lastName, p.country].some(
      (s) => s != null && s.toLowerCase().includes(q),
    );
  });
}

/** Re-export the canonical positions for the filter chips (single source). */
export const POSITION_FILTERS: readonly (Position | "ALL")[] = ["ALL", ...POSITIONS];
