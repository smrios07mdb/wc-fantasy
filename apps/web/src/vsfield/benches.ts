/**
 * Bench display types for the live "vs the field" screen — a DISPLAY-ONLY sibling of the server-computed
 * `VsFieldView` (@app/vsfield). The vsfield engine (`buildVsField`) is built around the scoring XI and has
 * no bench concept; benches are composed in the apps/web loader (`loadVsField`) from the SAME current-period
 * `lineup_slot` read it already does (now reading `is_starter = false` rows too) and carried alongside the
 * snapshot. Keeping these types in src/vsfield (library) keeps the dependency direction clean: the loader,
 * the client shell, the presentational components, AND the refetch client (`snapshotClient`) all depend on
 * this one module — nothing in @app/vsfield changes.
 *
 * Bench points (T14): per-player `score_player_match.points` composed SERVER-SIDE from the SAME period-scoped
 * read the starters use (path a — no new table/RLS/migration). State is derived from the player's match status
 * via their `player.teamId` join. A bench player with no score row → "yet-to-play" / 0 pts.
 */
import type { Position } from "@app/shared";
import type { StarterState, VsFieldView } from "@app/vsfield";
import type { SelectablePeriod } from "@/src/period/selectablePeriods";
import type { KnockoutContext } from "./knockout";

/** One bench player (a current-period `lineup_slot` with `is_starter = false`) — display-only. */
export interface BenchPlayerView {
  playerId: string;
  /** `player.display_name`. */
  name: string;
  /** Nation from the `fifa_team.name` join (NEVER `player.country` — P34); null if no team link. */
  nation: string | null;
  role: Position;
  /** Match state derived from the player's team match status (T14). */
  state: StarterState;
  /**
   * Points from `score_player_match` for the displayed period (T14, path a — server-only). Defaults to 0
   * when no row exists (yet-to-play or player genuinely scored 0).
   */
  points: number;
}

/** A single manager's bench (substitutes) for the current period. */
export interface ManagerBench {
  managerId: string;
  players: BenchPlayerView[];
}

/**
 * `loadVsField`'s return: the pure `buildVsField` snapshot PLUS the loader-composed `benches`, and (T11)
 * the prior-matchday selector metadata. `benches`, `selectablePeriods`, and `isLivePeriod` are all sibling
 * fields — none enters the engine's input or output, so @app/vsfield stays untouched.
 *
 * `currentPeriod` (from the engine) is the period being DISPLAYED — the live wave by default, or a
 * caller-selected started prior. `selectablePeriods` is the started-set the selector offers (completed
 * priors + the live one, future excluded). `isLivePeriod` is true only when the displayed period is the
 * actual live wave — the client drives the Realtime subscription off it (a prior period is static).
 */
export type VsFieldViewWithBenches = VsFieldView & {
  benches: ManagerBench[];
  /** The prior-matchday selector options (T11) — started periods only, canonical order. */
  selectablePeriods: SelectablePeriod[];
  /** True when the displayed period is the live wave (drives the live subscription; false for a prior). */
  isLivePeriod: boolean;
  /**
   * The knockout ("The Cut") projection — T15-CUT. Present ONLY when the displayed period is the live
   * knockout wave (or the champion endgame on the default view); ALWAYS undefined during the group
   * phase and on a selected prior matchday. A display sibling like `benches` — @app/vsfield untouched.
   */
  ko?: KnockoutContext;
};
