/**
 * Bench display types for the live "vs the field" screen — a DISPLAY-ONLY sibling of the server-computed
 * `VsFieldView` (@app/vsfield). The vsfield engine (`buildVsField`) is built around the scoring XI and has
 * no bench concept; benches are composed in the apps/web loader (`loadVsField`) from the SAME current-period
 * `lineup_slot` read it already does (now reading `is_starter = false` rows too) and carried alongside the
 * snapshot. Keeping these types in src/vsfield (library) keeps the dependency direction clean: the loader,
 * the client shell, the presentational components, AND the refetch client (`snapshotClient`) all depend on
 * this one module — nothing in @app/vsfield changes.
 *
 * Bench players never score in fantasy (only starters do), so — unlike `StarterView` — a bench entry carries
 * NO live state / points / lock-on-play: just identity (name + nation kit) + role, surfaced for scouting at
 * the bottom of the head-to-head.
 */
import type { Position } from "@app/shared";
import type { VsFieldView } from "@app/vsfield";

/** One bench player (a current-period `lineup_slot` with `is_starter = false`) — display-only. */
export interface BenchPlayerView {
  playerId: string;
  /** `player.display_name`. */
  name: string;
  /** Nation from the `fifa_team.name` join (NEVER `player.country` — P34); null if no team link. */
  nation: string | null;
  role: Position;
}

/** A single manager's bench (substitutes) for the current period. */
export interface ManagerBench {
  managerId: string;
  players: BenchPlayerView[];
}

/**
 * `loadVsField`'s return: the pure `buildVsField` snapshot PLUS the loader-composed `benches`. `benches`
 * is a sibling field — it never enters the engine's input or output, so @app/vsfield stays untouched.
 */
export type VsFieldViewWithBenches = VsFieldView & { benches: ManagerBench[] };
