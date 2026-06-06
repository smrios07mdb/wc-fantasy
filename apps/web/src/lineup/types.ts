/**
 * Shared types for the set-lineup screen. The server loader (`app/lineup/loadLineup.ts`) produces a
 * {@link SetLineupState}; the pure view helpers ({@link ./view}) turn it into a formation/bench model and
 * run the lock-respecting legality check; the client component renders it and posts edits to the gated
 * route. Lock state here is the AUTHORITATIVE `lineup_slot.locked_at` projection (locked vs movable) —
 * the live playing/played split is the "vs the field" surface (a later prompt), out of scope here.
 */
import type { Position, PeriodStatus } from "@app/shared";

export interface LineupPlayer {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  position: Position;
  country: string | null;
}

/** A locked slot in a period: the player has played and is frozen in `isStarter`'s role. */
export interface PeriodLock {
  playerId: string;
  isStarter: boolean;
}

/** One editable (or pre-settable) period: its window, the saved XI, and what's already locked. */
export interface PeriodLineup {
  periodId: string;
  label: string;
  status: PeriodStatus;
  closesAt: string | null; // ISO; null = no explicit close
  /** The currently-saved starters (the other squad players are the bench). */
  starterIds: string[];
  /** Slots already locked by play in this period (frozen — not movable). */
  locks: PeriodLock[];
  /** ISO kickoff of each player's match in this period, for the per-player indicator (optional). */
  kickoffByPlayer: Record<string, string | null>;
}

export interface SetLineupState {
  /** The session manager's id — every save posts this in the body (server re-asserts ownership). */
  sessionManagerId: string;
  displayName: string;
  /** The manager's active 15-man squad. */
  squad: LineupPlayer[];
  /** The current period + upcoming windows that can be pre-set. */
  periods: PeriodLineup[];
  activePeriodId: string;
}
