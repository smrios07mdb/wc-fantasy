/**
 * BALLDONTLIE FIFA World Cup API response shapes (the GOAT-tier endpoints we poll).
 *
 * Fields reflect ARCHITECTURE.md §7's verified mapping; JSON is snake_case (left as-is).
 * TODO(prompt-NN): confirm exact field names + enum values against the first live GOAT data
 * (match_shots.situation, match_events.incident_class, whether duels_won includes aerials, …).
 * Unmapped fields are tolerated via the loose index signatures below.
 */

/** Cursor pagination wrapper used by every list endpoint. */
export interface CursorMeta {
  next_cursor?: number | string | null;
  per_page?: number;
}
export interface Paginated<T> {
  data: T[];
  meta: CursorMeta;
}

export interface FIFAMatch {
  id: number;
  status: string;
  /** ISO 8601 UTC. */
  datetime: string;
  stage?: string | null;
  group?: string | null;
  round?: string | null;
  home_team_id?: number | null;
  away_team_id?: number | null;
  home_score?: number | null;
  away_score?: number | null;
  home_score_et?: number | null;
  away_score_et?: number | null;
  home_score_pens?: number | null;
  away_score_pens?: number | null;
  home_formation?: string | null;
  away_formation?: string | null;
  referee?: string | null;
  [key: string]: unknown;
}

export interface FIFAMatchLineupEntry {
  player_id: number;
  team_id?: number | null;
  position?: string | null;
  is_starter: boolean;
  shirt_number?: number | null;
  [key: string]: unknown;
}
export interface FIFAMatchLineup {
  match_id: number;
  entries: FIFAMatchLineupEntry[];
  [key: string]: unknown;
}

export interface FIFAMatchEvent {
  id: number;
  match_id: number;
  /** e.g. "goal" | "card" | "substitution". */
  incident_type: string;
  /** e.g. "yellow" | "red" | "second_yellow" | "own_goal". */
  incident_class?: string | null;
  time_minute?: number | null;
  added_time?: number | null;
  period?: string | null;
  player_id?: number | null;
  assist_player_id?: number | null;
  player_in_id?: number | null;
  player_out_id?: number | null;
  rescinded?: boolean | null;
  [key: string]: unknown;
}

export interface FIFAPlayerMatchStats {
  match_id: number;
  player_id: number;
  minutes_played?: number | null;
  rating?: number | null;
  goals?: number | null;
  assists?: number | null;
  key_passes?: number | null;
  dribbles_attempted?: number | null;
  dribbles_completed?: number | null;
  duels_won?: number | null;
  duels_lost?: number | null;
  passes_total?: number | null;
  passes_accurate?: number | null;
  long_balls_total?: number | null;
  long_balls_accurate?: number | null;
  was_fouled?: number | null;
  clearances?: number | null;
  interceptions?: number | null;
  tackles_won?: number | null;
  blocked_shots?: number | null;
  saves?: number | null;
  saves_inside_box?: number | null;
  punches?: number | null;
  high_claims?: number | null;
  possession_lost?: number | null;
  [key: string]: unknown;
}

export interface FIFATeamMatchStats {
  match_id: number;
  team_id: number;
  offsides?: number | null;
  shots_blocked?: number | null;
  possession?: number | null;
  [key: string]: unknown;
}

export interface FIFAShot {
  id: number;
  match_id: number;
  player_id?: number | null;
  shot_type?: string | null;
  /** Penalty detection lives here (situation === "penalty"). */
  situation?: string | null;
  minute?: number | null;
  [key: string]: unknown;
}

/** Biographical player (the `/players` + nested `/rosters` shape). `position` is a single letter G/D/M/F. */
export interface FIFAPlayer {
  id: number;
  name: string;
  short_name?: string | null;
  position?: string | null;
  date_of_birth?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  height_cm?: number | null;
  jersey_number?: string | null;
  [key: string]: unknown;
}

/** A `/rosters` row: one player's per-edition squad entry. Carries `team_id` (→ fifa_team) + nested bio. */
export interface FIFARoster {
  team_id: number;
  player: FIFAPlayer;
  position?: string | null;
  appearances?: number | null;
  starts?: number | null;
  minutes_played?: number | null;
  goals?: number | null;
  assists?: number | null;
  yellow_cards?: number | null;
  red_cards?: number | null;
  avg_rating?: number | null;
  [key: string]: unknown;
}

// ── Request params ────────────────────────────────────────────────────────────

export interface ListParams {
  cursor?: string | number;
  perPage?: number;
}
export interface MatchListParams extends ListParams {
  seasons?: number[];
  dates?: string[];
  statuses?: string[];
}
export interface MatchScopedParams extends ListParams {
  matchId: number;
}
export interface RostersParams extends ListParams {
  /** World Cup edition years; defaults to [2026] in the client when omitted. */
  seasons?: number[];
  teamIds?: number[];
  playerIds?: number[];
}
