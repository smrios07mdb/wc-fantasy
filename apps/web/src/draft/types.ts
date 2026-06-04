/**
 * The draft-room VIEW MODEL — the plain, JSON-serializable snapshot the server loader produces, the
 * page passes to the client, and Realtime patches in place. It deliberately mirrors the authoritative
 * rows (`draft` / `draft_pick` / `player` / `roster_player`) so the client can re-render purely from
 * row state (ARCHITECTURE.md §5) — no client-derived draft truth. The decision logic stays in
 * `@app/draft`; these types carry only what the screen renders.
 */
import type { DraftStatus, Position } from "@app/shared";

/** A league member in the draft, in seeded snake-slot order (`manager.draft_slot` ascending). */
export interface DraftManager {
  id: string;
  displayName: string;
  /** 1-based snake slot. */
  draftSlot: number;
  /** True for the session's own manager (the accent "you" marker). */
  isMe: boolean;
  /** Presence — populated live from the Realtime channel, not the DB. */
  online?: boolean;
}

/** A draftable player (the pool row, trimmed to what the board/list render). */
export interface DraftPlayer {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  position: Position;
  /** ISO-3 nation code (drives the flag chip), or null if unknown. */
  country: string | null;
}

/** One filled pick on the board. `player` is null only for the (rare) unresolved-player edge. */
export interface DraftPick {
  pickNo: number;
  managerId: string;
  playerId: string | null;
  player: DraftPlayer | null;
  isAuto: boolean;
}

/**
 * The full draft-room snapshot. `pickDeadlineAt` is an ISO string (serializable across the RSC→client
 * boundary); the countdown converts it to ms and renders LOCALLY against it, re-synced on every
 * broadcast — the server deadline is the only truth (ARCHITECTURE.md §5).
 */
export interface DraftRoomState {
  draftId: string;
  leagueId: string;
  status: DraftStatus;
  currentPickNo: number | null;
  currentManagerId: string | null;
  pickDeadlineAt: string | null;
  draftPickSeconds: number;
  /** Slot-ordered managers (the board columns). */
  managers: DraftManager[];
  /** Made picks, pickNo-ascending (unfilled slots are absent). */
  picks: DraftPick[];
  /** The undrafted pool = all players minus actively-owned (board/available list source). */
  availablePlayers: DraftPlayer[];
  /** The session manager (whose pick the screen can submit, and whose roster/queue it shows). */
  sessionManagerId: string;
  /** The session manager's pre-set autopick queue, player ids in stored priority order. */
  myQueue: string[];
}
