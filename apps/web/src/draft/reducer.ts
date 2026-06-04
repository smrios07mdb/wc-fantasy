/**
 * PURE Realtime reducers (ARCHITECTURE.md §5: "re-render from the authoritative row state"). When a
 * broadcast lands, the screen folds the changed ROW into its snapshot — no client-derived draft truth,
 * no refetch. The broadcast payload is the raw Postgres row (snake_case columns), so these take the
 * `new` record and patch the view model. A newly-picked player is resolved from the local available
 * pool (the screen already has it, since it WAS available) and consumed; everything stays idempotent so
 * a duplicate/late broadcast is harmless.
 */
import type { DraftStatus } from "@app/shared";
import type { DraftRoomState } from "./types";

/** The `draft` row columns we patch from (snake_case, as Postgres broadcasts them). */
export interface DraftRowChange {
  status?: DraftStatus;
  current_pick_no?: number | null;
  current_manager_id?: string | null;
  pick_deadline_at?: string | null;
}

/** Patch the pointer / deadline / status from a `draft` row broadcast. */
export function applyDraftRowChange(state: DraftRoomState, row: DraftRowChange): DraftRoomState {
  return {
    ...state,
    status: row.status ?? state.status,
    currentPickNo: row.current_pick_no ?? null,
    currentManagerId: row.current_manager_id ?? null,
    pickDeadlineAt: row.pick_deadline_at ?? null,
  };
}

/** The `draft_pick` row columns we fold in. */
export interface PickRowChange {
  pick_no: number;
  manager_id: string;
  player_id: string | null;
  is_auto?: boolean;
}

/** Fold a `draft_pick` broadcast into the snapshot: add the pick, consume the player from the pool. */
export function applyPickRowChange(state: DraftRoomState, row: PickRowChange): DraftRoomState {
  // An unfilled pick row (no player yet) carries nothing to render.
  if (row.player_id === null) return state;
  // Idempotent: a pick already recorded for this slot is a no-op (late/duplicate broadcast).
  if (state.picks.some((p) => p.pickNo === row.pick_no)) return state;

  const player = state.availablePlayers.find((p) => p.id === row.player_id) ?? null;
  const picks = [
    ...state.picks,
    {
      pickNo: row.pick_no,
      managerId: row.manager_id,
      playerId: row.player_id,
      player,
      isAuto: row.is_auto ?? false,
    },
  ].sort((a, b) => a.pickNo - b.pickNo);

  return {
    ...state,
    picks,
    availablePlayers: state.availablePlayers.filter((p) => p.id !== row.player_id),
  };
}
