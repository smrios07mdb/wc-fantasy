/**
 * Types for the player box-score view-model (@app/player-box). Pure: no DB, no Supabase, no Next,
 * no process.env, no clock. All inputs are injected; {@link buildPlayerBox} is a pure function.
 */
import type { Position } from "@app/shared";
import type { ScoreBreakdown } from "@app/scoring";

// ─── inputs ──────────────────────────────────────────────────────────────────

/** Player identity — name, position, and nation derived from fifa_team.name (never player.country). */
export interface PlayerBoxPlayerInput {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  position: Position;
  /** Nation for flag display, derived from player→team→fifa_team.name (the P34 pattern). */
  nation: string | null;
  /** The player's current team id — used to detect home vs away in the fixture. */
  teamId: string | null;
}

/** Fixture context for the match this player appeared (or will appear) in. */
export interface PlayerBoxFixtureInput {
  kickoffAt: Date;
  /** MatchStatus string from the DB (scheduled | in_progress | completed | abandoned | postponed). */
  status: string;
  /** Nullable in the schema; null is treated as "unknown" (isHome = false). */
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string;
  awayTeamName: string;
}

/** The score_player_match row, with the already-computed breakdown. */
export interface PlayerBoxScoreInput {
  points: number;
  /** The ScoreBreakdown stored in breakdown_json — fed verbatim; lines rendered as-is. */
  breakdown: ScoreBreakdown;
}

/** Raw stat counts from stat_player_match. All nullable — a stat absent from the feed is null. */
export interface PlayerBoxStatInput {
  minutesPlayed: number | null;
  goals: number | null;
  assists: number | null;
  keyPasses: number | null;
  dribblesAttempted: number | null;
  dribblesCompleted: number | null;
  duelsWon: number | null;
  duelsLost: number | null;
  passesTotal: number | null;
  passesAccurate: number | null;
  longBallsTotal: number | null;
  longBallsAccurate: number | null;
  wasFouled: number | null;
  clearances: number | null;
  interceptions: number | null;
  tacklesWon: number | null;
  blockedShots: number | null;
  saves: number | null;
  savesInsideBox: number | null;
  punches: number | null;
  highClaims: number | null;
  possessionLost: number | null;
}

export interface BuildPlayerBoxInput {
  player: PlayerBoxPlayerInput;
  /** Null when the player has no fixture in this period (shouldn't happen for a squad player,
   *  but handled gracefully). */
  fixture: PlayerBoxFixtureInput | null;
  /** Null when the score row hasn't landed yet (match not started or first ingest tick pending). */
  score: PlayerBoxScoreInput | null;
  /** Null when no stat row exists yet. */
  stats: PlayerBoxStatInput | null;
  /** Wall-clock injection — used to derive an approximate match minute for in-progress fixtures. */
  now: Date;
}

// ─── outputs ─────────────────────────────────────────────────────────────────

/** One scored category row in a breakdown section. */
export interface ScoreLineView {
  /** Canonical SCORE_CATEGORIES value (e.g. "tackles_won"). */
  category: string;
  /** Short mono tag chip (e.g. "TCK"). */
  tag: string;
  /** Human-readable label (e.g. "Tackles won"). */
  label: string;
  /** Signed integer, e.g. +1 or −1. */
  points: number;
  /** Verbatim detail string from ScoreLine.detail (e.g. "5 tackles ÷ 3 = +1"), or null. */
  detail: string | null;
}

/** A SCORING.md section grouping scored lines. */
export interface SectionView {
  /** e.g. "Attacking", "Accumulators", "Discipline". */
  sectionLabel: string;
  lines: ScoreLineView[];
}

/** A stat count that carries no scoring points — shown for context. */
export interface TrackedStatRow {
  label: string;
  count: number;
}

/** The fixture display, derived from the input + now for in-progress minutes. */
export interface FixtureView {
  homeTeamName: string;
  awayTeamName: string;
  kickoffIso: string;
  /** "FT", "45'", "KO soon", etc. */
  minuteLabel: string;
  /** True when the player's team is the home side. */
  isHome: boolean;
}

export interface PlayerBoxHeader {
  displayName: string;
  /** "F. Surname" format, falling back to displayName. */
  shortName: string;
  position: Position;
  nation: string | null;
  fixture: FixtureView | null;
  /** Equals breakdown_json.total — must match the ScorePill on the lineup screen. */
  periodTotal: number;
}

/**
 * Describes whether a score row exists and what state the match is in.
 * Drives the empty-state copy in the modal.
 */
export type BoxState =
  /** Player's fixture is still scheduled — hasn't kicked off. */
  | "not-started"
  /** Match in progress, but no score row yet (first ingest tick pending). */
  | "in-progress-no-score"
  /** Match in progress, score row exists (even if lines=[]).  */
  | "in-progress"
  /** Match complete, score row present. */
  | "played"
  /** No fixture found for this player/period. */
  | "no-fixture";

export interface PlayerBoxView {
  header: PlayerBoxHeader;
  state: BoxState;
  /** Grouped scored lines from breakdown_json. Empty array when no score row. */
  sections: SectionView[];
  /** Unscored stat counts from stat_player_match shown as context rows. Empty when no stat row. */
  trackedStats: TrackedStatRow[];
  /** Sum of score_player_match.points across ALL the player's periods this season, or null if the
   *  server chose not to compute it (lazy seam — the API includes it when cheap). */
  season: { total: number } | null;
}
