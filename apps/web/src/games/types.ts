/**
 * Types for the single-match Game Detail view (T5/T6) — the real-match box score overlaid with the
 * fantasy layer. PURE: no DB, no Supabase, no Next, no process.env, no clock. All inputs are injected;
 * {@link buildGameDetail} is a pure function (mirrors `@app/player-box` + the web pure-view modules).
 *
 * Dates cross the server→client boundary as ISO strings; the builder ALSO emits a deterministic UTC
 * `kickoffLabel` so the client never re-formats a Date (no hydration mismatch).
 */
import type { MatchStatus, PeriodKind, Position, RatingSource } from "@app/shared";

// ─── owner overlay ──────────────────────────────────────────────────────────────

/**
 * How a fantasy manager relates to a player FOR THIS MATCH'S PERIOD:
 *   - "started" — fielded the player in their XI (lineup_slot.is_starter = true)
 *   - "benched" — held the player on the bench (lineup_slot row, is_starter = false)
 *   - "owned"   — actively rosters the player (roster_player, dropped_at IS NULL) but did NOT field him
 * Resolved ONLY when the match links to a fantasy period; otherwise the overlay is empty (no tags).
 */
export type OwnerState = "started" | "benched" | "owned";

export interface OwnerTag {
  readonly managerId: string;
  readonly managerName: string;
  readonly isMe: boolean;
  readonly state: OwnerState;
}

// ─── per-player line ──────────────────────────────────────────────────────────────

/** A compact inline stat chip (the FULL breakdown is the reused PlayerScoreSheet modal). */
export interface StatChip {
  readonly label: string;
  readonly value: string;
}

/** A player's role in THIS match. */
export type PlayerRole = "starter" | "sub" | "bench";

export interface PlayerLine {
  readonly playerId: string;
  readonly displayName: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly position: Position;
  /** Nation for the flag — derived from fifa_team.name at query time (NEVER player.country). */
  readonly nation: string | null;
  readonly role: PlayerRole;
  /** Any appearance signal (stat row / score row / named in an event). */
  readonly appeared: boolean;
  /** Subbed-on / subbed-off effective minute (time + added time); null when not subbed. */
  readonly cameOnMinute: number | null;
  readonly wentOffMinute: number | null;
  /**
   * Sub-pairing labels for the lineup-row badges (from the substitution event's player_in↔player_out
   * pair): the player who came on for him when he was withdrawn (`subbedOffForName`, drives the ↓ badge)
   * and the player he replaced when he came on (`subbedOnForName`, drives the ↑ badge). Null when there
   * is no pairing (e.g. a red-card exit has no replacement, or the come-on event lacked an id).
   */
  readonly subbedOffForName: string | null;
  readonly subbedOnForName: string | null;
  readonly minutes: number | null;
  readonly yellowCards: number;
  readonly redCard: boolean;
  /**
   * 0–10 real-match rating resolved from rating_player_match (manual > balldontlie via the shared
   * resolver), or null until the feed posts one. The RATING lens — kept distinct from the FANTASY
   * points lens below; the two numbers are never blurred (handoff README §Overview).
   */
  readonly rating: number | null;
  /** score_player_match.points for this match; null until the score row lands. */
  readonly fantasyPoints: number | null;
  readonly chips: readonly StatChip[];
  /** The fantasy manager tag; null when unowned OR the match has no fantasy-period link. */
  readonly owner: OwnerTag | null;
}

// ─── squad side ──────────────────────────────────────────────────────────────────

export interface SquadSide {
  /** Resolved team name, or the shared UNNAMED_OPPONENT fallback — NEVER a raw team UUID. */
  readonly teamName: string;
  /** Country value for the flag (alpha-2 / FIFA-3 / name); null when unknown. Equals the team name. */
  readonly teamCode: string | null;
  readonly score: number | null;
  readonly starters: readonly PlayerLine[];
  /**
   * The formation-PITCH set = the reconciled KICKOFF XI, IDENTICAL to `starters` on a side with an
   * official sheet (`role: "starter"` ⟺ on the kickoff pitch). It is NOT the raw `is_starter` sheet:
   * the feed over-marks `is_starter` on some completed matches, so the kickoff XI is computed as a
   * deterministic cascade — candidates = (`is_starter` rows) ∪ (any `player_out`, who was on at
   * kickoff); kept iff NOT a `player_in` (a come-on is a Sub) AND (withdrawn, OR minutes > 0, OR named
   * in an on-field event). Subbed-off / sent-off starters stay (the formation is fixed at kickoff); a
   * come-on never gets a token. Empty when the side has no sheet. If the cascade can't resolve to 11 the
   * kept set is rendered as-is (never padded/trimmed) and a {@link LineupAnomaly} is surfaced.
   */
  readonly pitch: readonly PlayerLine[];
  /** Substitutes who came on. */
  readonly subs: readonly PlayerLine[];
  /** Named bench who did not feature. */
  readonly bench: readonly PlayerLine[];
}

// ─── header + view ───────────────────────────────────────────────────────────────

export interface GameDetailHeader {
  readonly matchId: string;
  readonly status: MatchStatus;
  readonly kickoffIso: string;
  /** Deterministic UTC label, e.g. "Sat 21 Jun · 18:00". */
  readonly kickoffLabel: string;
  /** Canonical period.label, else the raw feed round, else null. Display only — NEVER a phase signal. */
  readonly matchdayLabel: string | null;
  readonly periodKind: PeriodKind | null;
  /** True when the match links to a fantasy period (drives the owner overlay + tap-to-breakdown). */
  readonly hasFantasyOverlay: boolean;
}

// ─── team statistics (T17) ────────────────────────────────────────────────────────

/** How a stat row's value is rendered + how its lead highlight + bar fill behave. */
export type StatFormat = "pct" | "dec" | "int";

/**
 * One home-vs-away team-stat row (mirrors the design-reference StatBar). Values come from the three
 * typed stat_team_match columns + the retained `extra` jsonb (a derived percentage for accuracy/duels).
 * Either side null = "not reported by the feed" → the UI renders "–" and an empty bar. Display-only.
 */
export interface GameStatRow {
  /** Stable key (e.g. "poss", "xg") — React key + UI hooks; never a raw feed field name to render. */
  readonly key: string;
  readonly label: string;
  readonly format: StatFormat;
  /** Lower-is-better (fouls / offsides / yellow / saves) → the LOWER side gets the lead highlight. */
  readonly neutral: boolean;
  readonly home: number | null;
  readonly away: number | null;
}

/** A titled group of stat rows (Overview has a null title). */
export interface GameStatGroup {
  readonly title: string | null;
  readonly rows: readonly GameStatRow[];
}

/** The Statistics tab view-model — grouped home-vs-away team aggregates. */
export interface GameStatistics {
  readonly groups: readonly GameStatGroup[];
}

// ─── kickoff-XI reconciliation anomaly ─────────────────────────────────────────────

/**
 * A side whose computed kickoff XI ≠ 11 after the reconciliation cascade (a feed contradiction the
 * cascade could not resolve). The builder NEVER pads or silently drops to force 11 — it renders the
 * kept set and surfaces this so the loader can log it (match_id / team_id / count / kept / removed).
 */
export interface LineupAnomaly {
  readonly side: "home" | "away";
  readonly teamId: string | null;
  /** The computed kickoff-XI size that triggered the anomaly (≠ 11). */
  readonly count: number;
  /** The player ids kept on the pitch (the rendered set). */
  readonly keptPlayerIds: readonly string[];
  /** Candidate ids (is_starter ∪ player_out) that the cascade removed from the pitch. */
  readonly removedPlayerIds: readonly string[];
}

// ─── events timeline (T16b) ─────────────────────────────────────────────────────────

export type GameEventKind = "goal" | "sub" | "card" | "marker";

/**
 * One ordered entry in the match-events timeline — a goal, substitution, card, or a synthetic KO/HT/FT
 * marker — sharing a flat shape. The builder emits them CHRONOLOGICALLY (KO first … FT last) and accumulates
 * a running score by replaying goals in order: an own goal credits the OPPOSING side and a VAR-overturned
 * goal is excluded, both keyed on the shared engine predicates (`isOwnGoalEvent` / `overturnedGoals`) so the
 * timeline can never silently disagree with scoring. The UI reverses for latest-first display.
 */
export interface GameEvent {
  readonly kind: GameEventKind;
  /**
   * Beneficiary side of a goal (an own goal flips to the opponent); the acting side of a sub/card; null for
   * the KO/HT/FT markers AND for a goal whose scorer can't be resolved to a side (counted, never silently
   * credited — see {@link EventScoreAnomaly}).
   */
  readonly side: "home" | "away" | null;
  /** Effective minute (time_minute + added_time) for ordering; null for the synthetic markers. */
  readonly minute: number | null;
  /** Pre-formatted clock label ("73'" / "45+2'"); null on markers. Built server-side (no client re-format). */
  readonly minuteLabel: string | null;
  /** `1H` / `2H` / `ET` / `PEN`, for the ordering rank; null on synthetic markers. */
  readonly period: string | null;
  /** Marker name ("Kick-off" / "Half-time" / "Full-time") or a card reason; null otherwise. */
  readonly label: string | null;
  /** Running home/away score AFTER this event (a marker carries the score at that point). */
  readonly homeScore: number;
  readonly awayScore: number;
  /** Scorer / carded / subbed-ON player id — lets the UI cross-reference the per-player owner tag. */
  readonly playerId: string | null;
  readonly playerName: string | null;
  /** Goal assist scorer name; null otherwise. */
  readonly assistName: string | null;
  /** Subbed-OFF player name (sub events); null otherwise. */
  readonly secondaryName: string | null;
  readonly cardKind: "yellow" | "red" | null;
  readonly isPenalty: boolean;
  readonly isOwnGoal: boolean;
}

/**
 * Terminal-match reconciliation flag: the score accumulated from the timeline's goal events did NOT equal
 * the stored authoritative (VAR-correct) final score, OR a goal's scorer could not be resolved to a side.
 * Mirrors the {@link LineupAnomaly} safety net (T-RECON) — the loader logs it; the timeline still renders
 * the accumulated score (an observable divergence, never a silent desync). Null in the normal (agreeing) case.
 */
export interface EventScoreAnomaly {
  readonly computedHome: number;
  readonly computedAway: number;
  readonly finalHome: number | null;
  readonly finalAway: number | null;
  /** Goals dropped from the running score because their scorer didn't resolve to a side. */
  readonly unresolvedGoals: number;
}

export interface GameDetailView {
  readonly header: GameDetailHeader;
  readonly home: SquadSide;
  readonly away: SquadSide;
  /**
   * Home-vs-away team match statistics, or null when the feed has posted NO team-stat row for either
   * side yet (not-played / early-live) — the Statistics tab is hidden entirely in that case. When
   * present, individual rows may still be null (a metric the feed omits) and render "–".
   */
  readonly statistics: GameStatistics | null;
  /**
   * Ordered match-events timeline (T16b) — goals (scorer + assist + running score), substitutions, cards, and
   * the synthetic KO/HT/FT markers, in chronological order. Empty until the feed posts events. Display-only;
   * the running score replays the shared engine goal/own-goal/VAR predicates. Feeds the Events tab AND the
   * scoreboard scorers row.
   */
  readonly events: readonly GameEvent[];
  /** Terminal-match running-score reconciliation flag (T16b); null in the normal (agreeing) case. */
  readonly eventScoreAnomaly: EventScoreAnomaly | null;
  /** True when neither side has a single player line (no lineup announced + nobody scored yet). */
  readonly empty: boolean;
  /** periodId for the PlayerScoreSheet modal; null = no tap-to-breakdown (and no owner overlay). */
  readonly periodId: string | null;
  /**
   * Count of referenced participants that could not be DISPLAYED: either they have no `player` row
   * (outside the imported pool) or their team is neither side of the match. Surfaced honestly in the
   * UI as a small note rather than silently dropped.
   */
  readonly unresolvedParticipants: number;
  /**
   * Kickoff-XI reconciliation anomalies — one per side whose computed starting XI ≠ 11. Empty in the
   * normal case; non-empty entries are logged by the loader (the safety net is observable, not swallowed).
   */
  readonly lineupAnomalies: readonly LineupAnomaly[];
}

// ─── builder input (already-fetched, side-agnostic rows) ──────────────────────────

export interface GdMatchInput {
  readonly matchId: string;
  readonly status: MatchStatus;
  readonly kickoffIso: string;
  readonly homeTeamId: string | null;
  readonly awayTeamId: string | null;
  readonly homeTeamName: string | null;
  readonly awayTeamName: string | null;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly periodId: string | null;
  readonly periodKind: PeriodKind | null;
  readonly periodLabel: string | null;
  readonly round: string | null;
}

export interface GdPlayerInput {
  readonly id: string;
  readonly displayName: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly position: Position;
  readonly teamId: string | null;
  /** fifa_team.name (the nation), joined at query time — never the player.country scalar. */
  readonly nation: string | null;
}

export interface GdStatInput {
  readonly playerId: string;
  readonly minutesPlayed: number | null;
  readonly goals: number | null;
  readonly assists: number | null;
  readonly saves: number | null;
}

export interface GdScoreInput {
  readonly playerId: string;
  readonly points: number;
}

/**
 * A source-tagged rating row (mirrors `rating_player_match`). The loader passes every source's row
 * through verbatim; the pure builder resolves ONE rating per player via the shared `resolveRating`
 * (manual > balldontlie) so the displayed number matches what scoring would use.
 */
export interface GdRatingInput {
  readonly playerId: string;
  readonly source: RatingSource;
  /** 0–10 value for this source, or null/absent when the source has no rating for this player-match. */
  readonly rating: number | null;
}

/**
 * One team's stat_team_match row (keyed by teamId), passed through verbatim by the loader. The three
 * typed columns plus the retained `extra` jsonb (everything else the feed sent). The pure builder
 * matches teamId to the match's home/away side and resolves the displayed rows. Display-only.
 */
export interface GdTeamStatInput {
  readonly teamId: string;
  readonly possession: number | null;
  readonly offsides: number | null;
  readonly shotsBlocked: number | null;
  readonly extra: Readonly<Record<string, unknown>> | null;
}

export interface GdLineupEntryInput {
  readonly playerId: string;
  readonly isStarter: boolean;
}

/**
 * One `event_match` row. Structurally a SUPERSET of `@app/recompute`'s `EventRow` (it only adds `period`),
 * so it is directly assignable to the shared engine predicates `isGoalEvent` / `isOwnGoalEvent` /
 * `overturnedGoals` / `classifyCard` — the events timeline keys goals/cards on the SAME classification
 * scoring uses (the T16b / T-CARD1 single-source pattern). `timeMinute` + `addedTime` are carried RAW (not
 * pre-collapsed to one minute) so the timeline can render the "45+2'" added-time form and reuse the
 * engine's effective-minute math; the per-player `cameOnMinute`/`wentOffMinute` collapse them locally.
 */
export interface GdEventInput {
  readonly incidentType: string;
  readonly incidentClass: string | null;
  readonly timeMinute: number | null;
  readonly addedTime: number | null;
  readonly playerId: string | null;
  /** Assist scorer id (`event_match.assist_player_id`) — added to the loader's id union (T16b). */
  readonly assistPlayerId: string | null;
  readonly playerInId: string | null;
  readonly playerOutId: string | null;
  readonly rescinded: boolean;
  /** `1H` / `2H` / `ET` / `PEN` — synthesizes the HT/FT markers + the period sort rank (T16b). */
  readonly period: string | null;
}

export interface BuildGameDetailInput {
  readonly match: GdMatchInput;
  readonly players: readonly GdPlayerInput[];
  readonly stats: readonly GdStatInput[];
  readonly scores: readonly GdScoreInput[];
  /** rating_player_match rows (source-tagged) for this match; the builder resolves one per player. */
  readonly ratings: readonly GdRatingInput[];
  /** stat_team_match rows (one per team) for this match; the builder maps each to home/away. */
  readonly teamStats: readonly GdTeamStatInput[];
  readonly lineupEntries: readonly GdLineupEntryInput[];
  readonly events: readonly GdEventInput[];
  /** playerId → owner tag (already name-resolved by the loader; empty when no period link). */
  readonly ownerByPlayer: Readonly<Record<string, OwnerTag>>;
  /** Participants the loader could not resolve to a `player` row (outside the pool). */
  readonly unresolvedFromPool: number;
}
