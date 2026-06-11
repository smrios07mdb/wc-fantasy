/**
 * The lineup store PORT. Every database read/write the controller ({@link ./controller}) needs is
 * expressed here, so `setLineup` is a pure function of this interface and is unit-testable against the
 * in-memory double ({@link ./memoryStore}). The production implementation is the thin Prisma adapter
 * ({@link ./prismaStore}), reachable only via `@app/lineup/prisma`.
 *
 * The ONE non-trivial method is {@link LineupStore.saveLineup}: it writes the manager's full set of
 * `lineup_slot` rows for a period in ONE transaction, and re-checks the lock latch at write time — a
 * `locked_at IS NOT NULL` row may not change `is_starter`, so a commit that would flip a locked slot is
 * refused (returns a conflict), never half-applied. The DB trigger `enforce_lineup_lock()` is the
 * ultimate backstop; the store reproduces it so the memory double exercises the same constraint.
 */
import type { Position } from "@app/shared";
import type { SquadPlayer, PeriodWindow } from "./validate";

/** An existing `lineup_slot` row for a (manager, period): who, starting or benched, and locked-by-play? */
export interface SlotRow {
  playerId: string;
  isStarter: boolean;
  /** `lineup_slot.locked_at IS NOT NULL` — the player has played and the row is frozen. */
  locked: boolean;
}

/** Everything `setLineup` reads in one shot: the squad, the current slots (→ lock state), the window. */
export interface LineupContext {
  leagueId: string;
  /** The manager's active 15-man squad (active roster_player rows), each with his position. */
  squad: SquadPlayer[];
  /** The current `lineup_slot` rows for this (manager, period) — empty if none set yet. */
  slots: SlotRow[];
  /** The target period's window, or `null` if the period id is unknown for this manager's league. */
  period: PeriodWindow | null;
}

/** One desired `lineup_slot` row in a save (the FULL squad is written: 11 starters + the bench). */
export interface DesiredSlot {
  playerId: string;
  role: Position;
  isStarter: boolean;
}

/** The atomic unit of a save: the manager's whole per-period slot assignment. */
export interface LineupCommit {
  managerId: string;
  periodId: string;
  desired: DesiredSlot[];
  /** Commissioner `--allow-locked-slot` carve-out: write even a slot locked by play. The store SKIPS its
   *  write-time latch re-check, and the Prisma adapter sets a per-transaction GUC the DB trigger
   *  `enforce_lineup_lock()` reads and exempts. The normal path leaves this false/undefined → latch holds. */
  allowLockedSlot?: boolean;
}

/** A save either lands, or is refused because a locked slot would have to change (write-time latch). */
export type SaveOutcome =
  | { ok: true }
  | { ok: false; conflict: { playerId: string; isStarter: boolean } };

export interface LineupStore {
  /** Load the squad + current slots + period window for a (manager, period), or null if no such manager. */
  loadLineupContext(managerId: string, periodId: string): Promise<LineupContext | null>;
  /** Atomically write the desired slot set. Re-checks the lock latch; returns a conflict (no write) if a
   *  locked slot would change — keeping the server authoritative even if the client lies. */
  saveLineup(commit: LineupCommit): Promise<SaveOutcome>;
}
