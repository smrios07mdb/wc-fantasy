/**
 * Shared types for the set-lineup screen. The server loader (`app/lineup/loadLineup.ts`) produces a
 * {@link SetLineupState}; the pure view helpers ({@link ./view}) turn it into a formation/bench model and
 * run the lock-respecting legality check; the client component renders it and posts edits to the gated
 * route. Lock state here is the AUTHORITATIVE `lineup_slot.locked_at` projection (locked vs movable) —
 * the live playing/played split is the "vs the field" surface (a later prompt), out of scope here.
 */
import type { Position, PeriodStatus } from "@app/shared";

/** The opponent side of a squad player's fixture in a period — for the per-player fixture indicator. */
export interface OpponentInfo {
  /** The opponent team's display name (from fifa_team.name). */
  opponentName: string;
  /** Same as opponentName — passed to toIso2 for the flag emoji (fifa_team.name is the flag resolver input). */
  opponentNation: string | null;
  /** True when the player's team is the home side. Drives "vs" (home) vs "@" (away) prefix. */
  isHome: boolean;
}

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

/**
 * A rostered player's pre-kickoff availability for his next fixture — the Set Lineup badge state,
 * derived from the worker's T-75 `match_lineup_entry` snapshot:
 *   "starting"     — confirmed in his country's real starting XI
 *   "not_starting" — benched, or left out of the matchday squad (the actionable state)
 * The resolver returns `StarterStatus | null`; `null` means the lineup hasn't been announced for his
 * match yet → render NO badge (the calm, dominant default for most of the week — there is no "TBA" chip).
 */
export type StarterStatus = "starting" | "not_starting";

/**
 * Per-slot forfeit-model metadata for ONE squad player in a period — the C1 read contract the
 * destructive-confirm UI (C2) consumes. C1 does NOT render any of this (no new destructive affordance):
 * the live client still drives drag/movability off {@link PeriodLineup.locks} (unchanged), so adding these
 * fields surfaces no bench-played action until C2 wires the confirm.
 */
export interface SlotMeta {
  /** A `score_player_match` row exists for (player, his match this period) — the authoritative "has played"
   *  (NOT `locked_at`). Note: the row lands at the first recompute tick, slightly after kickoff. */
  hasPlayed: boolean;
  /** The points the player has already earned this period — what benching him would FORFEIT. 0 if unplayed. */
  pointsAtStake: number;
  /** `voided_at IS NOT NULL` — he was already forfeited (one-way). */
  voided: boolean;
  /** May this slot still be edited at all? `period.frozen_at IS NULL AND voided_at IS NULL` (the forfeit
   *  model's movability gate). Has-played no longer blocks movement — only a frozen period or a prior
   *  forfeit does. (Promoting a played player into the XI is still blocked at the mutation, not here.) */
  movable: boolean;
}

/** One editable (or pre-settable) period: its window, the saved XI, and what's already locked. */
export interface PeriodLineup {
  periodId: string;
  label: string;
  status: PeriodStatus;
  closesAt: string | null; // ISO; null = no explicit close
  /** The currently-saved starters (the other squad players are the bench). */
  starterIds: string[];
  /** Slots already locked by play in this period (frozen — not movable). Drives the C1 client's drag
   *  movability UNCHANGED (the forfeit model's new `movable` lives in {@link slotMeta} for C2). */
  locks: PeriodLock[];
  /** The C1 forfeit read contract, per squad player id (C2 consumes; C1 does not render). */
  slotMeta: Record<string, SlotMeta>;
  /** ISO kickoff of each player's match in this period, for the per-player indicator (optional). */
  kickoffByPlayer: Record<string, string | null>;
  /** Opponent for each player's match in this period; null when the player's team has no fixture or the
   *  opponent side is TBD (knockout round not yet determined). The UI renders null as "TBD". */
  opponentByPlayer: Record<string, OpponentInfo | null>;
  /** Each squad player's pre-kickoff availability badge state for this period's fixture, from the T-75
   *  `match_lineup_entry` snapshot (resolved against the SAME fifa_match row as kickoff/opponent). null =
   *  lineup not announced for his match → no badge. Optional so existing fixtures stay valid; buildPitch
   *  defaults a missing entry to null (no badge). */
  starterStatusByPlayer?: Record<string, StarterStatus | null>;
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
  /** League IANA timezone — formats each player's kickoff/lock deadline as the local wall clock. */
  timezone: string;
}
