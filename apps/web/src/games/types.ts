/**
 * Types for the single-match Game Detail view (T5/T6) — the real-match box score overlaid with the
 * fantasy layer. PURE: no DB, no Supabase, no Next, no process.env, no clock. All inputs are injected;
 * {@link buildGameDetail} is a pure function (mirrors `@app/player-box` + the web pure-view modules).
 *
 * Dates cross the server→client boundary as ISO strings; the builder ALSO emits a deterministic UTC
 * `kickoffLabel` so the client never re-formats a Date (no hydration mismatch).
 */
import type { MatchStatus, PeriodKind, Position } from "@app/shared";

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
  readonly minutes: number | null;
  readonly yellowCards: number;
  readonly redCard: boolean;
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

export interface GameDetailView {
  readonly header: GameDetailHeader;
  readonly home: SquadSide;
  readonly away: SquadSide;
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

export interface GdLineupEntryInput {
  readonly playerId: string;
  readonly isStarter: boolean;
}

export interface GdEventInput {
  readonly playerId: string | null;
  readonly playerInId: string | null;
  readonly playerOutId: string | null;
  readonly incidentType: string;
  readonly incidentClass: string | null;
  /** Effective minute (time_minute + added_time); null when the feed omits it. */
  readonly minute: number | null;
  readonly rescinded: boolean;
}

export interface BuildGameDetailInput {
  readonly match: GdMatchInput;
  readonly players: readonly GdPlayerInput[];
  readonly stats: readonly GdStatInput[];
  readonly scores: readonly GdScoreInput[];
  readonly lineupEntries: readonly GdLineupEntryInput[];
  readonly events: readonly GdEventInput[];
  /** playerId → owner tag (already name-resolved by the loader; empty when no period link). */
  readonly ownerByPlayer: Readonly<Record<string, OwnerTag>>;
  /** Participants the loader could not resolve to a `player` row (outside the pool). */
  readonly unresolvedFromPool: number;
}
