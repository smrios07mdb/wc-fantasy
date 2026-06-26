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

export interface FIFATeamRef {
  id: number;
  name?: string | null;
  abbreviation?: string | null;
  country_code?: string | null;
  confederation?: string | null;
  [key: string]: unknown;
}
/**
 * Nested player object (the GOAT `/events` player/assist_player/player_in/player_out fields, and the
 * `/rosters` nested bio). Analogous to {@link FIFATeamRef}: `id` is the only field the mappers read;
 * the rest are tolerated via the index signature.
 */
export interface FIFAPlayerRef {
  id: number;
  name?: string | null;
  short_name?: string | null;
  position?: string | null;
  date_of_birth?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  height_cm?: number | null;
  jersey_number?: string | null;
  [key: string]: unknown;
}
/** Nested referee object on a match (GOAT `/matches` shape — an object, NOT a bare string). */
export interface FIFARefereeRef {
  id: number;
  name?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  [key: string]: unknown;
}
export interface FIFAStageRef {
  id: number;
  /** "Group Stage" | "Round of 32" | "Round of 16" | "Quarter-finals" | "Semi-finals" | "Final" */
  name?: string | null;
  order?: number | null;
  [key: string]: unknown;
}
export interface FIFAGroupRef {
  id: number;
  name?: string | null; // "Group A"
  [key: string]: unknown;
}

export interface FIFAMatch {
  id: number;
  status: string;
  /** ISO 8601 UTC. */
  datetime: string;
  match_number?: number | null;
  season?: { id: number; year: number } | null;
  stage?: FIFAStageRef | null;
  group?: FIFAGroupRef | null;
  /** Group stage: this is the matchday (1/2/3). */
  round_number?: number | null;
  round_name?: string | null;
  home_team?: FIFATeamRef | null;
  away_team?: FIFATeamRef | null;
  home_score?: number | null;
  away_score?: number | null;
  extra_time_home_score?: number | null;
  extra_time_away_score?: number | null;
  home_score_penalties?: number | null;
  away_score_penalties?: number | null;
  home_formation?: string | null;
  away_formation?: string | null;
  /** GOAT `/matches`: a nested object `{ id, name, country_code, country_name }`, NOT a bare string. */
  referee?: FIFARefereeRef | null;
  [key: string]: unknown;
}

/**
 * Nested player object on a `match_lineups` row. The id space matches `/rosters` (`player.id`), which
 * `upsertLineupEntries` resolves to internal ids. Same `player.id` nesting trap as {@link FIFAMatchEvent}.
 */
export interface FIFAMatchLineupPlayer {
  id: number;
  name?: string;
  short_name?: string;
  position?: string | null;
  jersey_number?: string | null;
  [key: string]: unknown;
}
/**
 * VERIFIED live GOAT `match_lineups` shape: a FLAT list of ONE row per player (NOT a per-match object
 * with an `entries` array). Bench players appear as their own rows with `is_starter: false`. `match_id`
 * is top-level (satisfies `matchScoped`); the player id is nested at `player.id` (NOT `player_id`).
 */
export interface FIFAMatchLineupEntry {
  match_id: number;
  team_id?: number | null;
  player: FIFAMatchLineupPlayer;
  is_starter: boolean;
  is_substitute?: boolean;
  shirt_number?: number | null;
  position?: string | null;
  formation?: string | null;
  [key: string]: unknown;
}

export interface FIFAMatchEvent {
  id: number;
  match_id: number;
  /** e.g. "goal" | "card" | "substitution". */
  incident_type: string;
  /** e.g. "penalty" | "yellow" | "red" | "second_yellow" | "own_goal". */
  incident_class?: string | null;
  time_minute?: number | null;
  added_time?: number | null;
  period?: string | null;
  is_home?: boolean | null;
  /** NESTED objects on the documented GOAT shape — the player id lives at `player.id`, not `player_id`. */
  player?: FIFAPlayerRef | null;
  assist_player?: FIFAPlayerRef | null;
  player_in?: FIFAPlayerRef | null;
  player_out?: FIFAPlayerRef | null;
  home_score?: number | null;
  away_score?: number | null;
  shootout_sequence?: number | null;
  shootout_description?: string | null;
  rescinded?: boolean | null;
  reason?: string | null;
  [key: string]: unknown;
}

export interface FIFAPlayerMatchStats {
  match_id: number;
  player_id: number;
  team_id?: number | null;
  is_home?: boolean | null;
  minutes_played?: number | null;
  rating?: number | null;
  expected_goals?: number | null;
  expected_assists?: number | null;
  goals?: number | null;
  assists?: number | null;
  shots_on_target?: number | null;
  key_passes?: number | null;
  passes_total?: number | null;
  passes_accurate?: number | null;
  long_balls_total?: number | null;
  long_balls_accurate?: number | null;
  crosses_total?: number | null;
  crosses_accurate?: number | null;
  dribbles_attempted?: number | null;
  dribbles_completed?: number | null;
  tackles?: number | null;
  tackles_won?: number | null;
  interceptions?: number | null;
  clearances?: number | null;
  blocked_shots?: number | null;
  duels_won?: number | null;
  duels_lost?: number | null;
  aerial_duels_won?: number | null;
  aerial_duels_lost?: number | null;
  fouls_committed?: number | null;
  was_fouled?: number | null;
  touches?: number | null;
  possession_lost?: number | null;
  ball_recoveries?: number | null;
  big_chances_created?: number | null;
  big_chances_missed?: number | null;
  saves?: number | null;
  saves_inside_box?: number | null;
  punches?: number | null;
  high_claims?: number | null;
  [key: string]: unknown;
}

export interface FIFATeamMatchStats {
  match_id: number;
  team_id: number;
  is_home?: boolean | null;
  /** Possession share, percent. The documented field is `possession_pct` (NOT `possession`). */
  possession_pct?: number | null;
  expected_goals?: number | null;
  big_chances?: number | null;
  big_chances_missed?: number | null;
  shots_total?: number | null;
  shots_on_target?: number | null;
  shots_off_target?: number | null;
  shots_blocked?: number | null;
  shots_inside_box?: number | null;
  shots_outside_box?: number | null;
  hit_woodwork?: number | null;
  corners?: number | null;
  offsides?: number | null;
  fouls?: number | null;
  yellow_cards?: number | null;
  passes_total?: number | null;
  passes_accurate?: number | null;
  passes_final_third?: number | null;
  long_balls_total?: number | null;
  long_balls_accurate?: number | null;
  crosses_total?: number | null;
  crosses_accurate?: number | null;
  tackles?: number | null;
  interceptions?: number | null;
  clearances?: number | null;
  saves?: number | null;
  ground_duels_won?: number | null;
  ground_duels_total?: number | null;
  aerial_duels_won?: number | null;
  aerial_duels_total?: number | null;
  dribbles_completed?: number | null;
  dribbles_total?: number | null;
  throw_ins?: number | null;
  goal_kicks?: number | null;
  free_kicks?: number | null;
  [key: string]: unknown;
}

export interface FIFAShot {
  id: number;
  match_id: number;
  player_id?: number | null;
  team_id?: number | null;
  is_home?: boolean | null;
  shot_type?: string | null;
  /** Penalty detection lives here (situation === "penalty", confirmed in the GOAT docs). */
  situation?: string | null;
  body_part?: string | null;
  goal_type?: string | null;
  xg?: number | null;
  xgot?: number | null;
  player_x?: number | null;
  player_y?: number | null;
  goal_mouth_x?: number | null;
  goal_mouth_y?: number | null;
  block_x?: number | null;
  block_y?: number | null;
  /** The documented minute field is `time_minute` (NOT `minute`). */
  time_minute?: number | null;
  added_time?: number | null;
  time_seconds?: number | null;
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

// ── Odds (pre-match) ────────────────────────────────────────────────────────────

/**
 * A single bookmaker's player prop quote (GOAT `/odds/player_props`). `market` is a oneOf: a `milestone`
 * market (yes/no, one `odds`) covers anytime_goal/first_goal/red_card; an `over_under` market carries
 * `over_odds`/`under_odds`. `line_value` is a STRING ("1", "0.5", …). Odds are American integers.
 */
export interface FIFAPlayerProp {
  id: number;
  match_id: number;
  player_id: number;
  /** draftkings | fanduel | betmgm | betrivers | caesars | fanatics */
  vendor: string;
  /** anytime_goal | assists | shots | shots_on_target | first_goal | saves | tackles | card | … */
  prop_type: string;
  line_value: string;
  market: FIFAPlayerPropMarketMilestone | FIFAPlayerPropMarketOverUnder;
  updated_at?: string | null;
  [key: string]: unknown;
}
export interface FIFAPlayerPropMarketMilestone {
  type: "milestone";
  odds: number;
  [key: string]: unknown;
}
export interface FIFAPlayerPropMarketOverUnder {
  type: "over_under";
  over_odds: number;
  under_odds: number;
  [key: string]: unknown;
}

/**
 * A futures-market quote (GOAT `/odds/futures`). `market_type === "tournament_winner"` is the team
 * win-the-cup market; `subject` is the team the odds are for (id → fifa_team). `american_odds` may be null.
 */
export interface FIFAFuturesOdd {
  id: number;
  /** e.g. "tournament_winner" */
  market_type: string;
  market_name?: string | null;
  subject?: FIFATeamRef | null;
  vendor?: string | null;
  american_odds?: number | null;
  decimal_odds?: number | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

/**
 * A `group_standings` row (GOAT `/fifa/worldcup/v1/group_standings`) — one team's standing within its
 * World Cup group for the requested edition. The endpoint is SEASON-scoped + NON-paginated (a bare
 * `data[]`, NO `meta.next_cursor`). The row keys to a team via NESTED `team.id` (NOT a flat `team_id`,
 * unlike {@link FIFATeamMatchStats}) and to a group via NESTED `group.id` / `group.name` — and here
 * `group.name` is the bare letter "A".."L" (unlike {@link FIFAMatch}.`group.name` = "Group A"). There is
 * NO form / recent-results field on this object (recent form lives only on the separate
 * `match_team_form` endpoint). Requires ALL-STAR tier or higher; the app's GOAT key covers it (same
 * `Authorization` credential as `team_match_stats`).
 */
export interface FIFAStanding {
  season: { id: number; year: number };
  team: FIFATeamRef;
  group: FIFAGroupRef;
  /** Rank within the group (1 = top) — the feed's authoritative order, incl. the FIFA tie-breaks. */
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
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
export interface FuturesParams extends ListParams {
  /** World Cup edition years; defaults to [2026] in the client when omitted. */
  seasons?: number[];
}
/**
 * `group_standings` request params. SEASON-scoped only — there is no `match_id`, no group filter, and no
 * cursor/perPage (the endpoint is non-paginated), so this deliberately does NOT extend {@link ListParams}.
 */
export interface StandingsParams {
  /** World Cup edition years; defaults to [2026] in the client when omitted. */
  seasons?: number[];
}
