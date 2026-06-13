/**
 * @app/vsfield types — the injected inputs + the display model for the live "vs the field"
 * screen (ARCHITECTURE.md §5). PURE: every input is data the IO edge (the apps/web loader +
 * the authed read) gathers from §4 rows and hands over; nothing here touches the DB/clock.
 *
 * The all-play-all record + per-opponent H2H are NOT re-derived here — `buildVsField` calls the
 * Prompt-04 pairwise helper (`comparePeriodPairwise` / `periodRecords` from `@app/recompute`).
 */
import type { MatchStatus, Position } from "@app/shared";
import type { ManagerPeriodPoints, PeriodScores } from "@app/recompute";

export type { ManagerPeriodPoints, PeriodScores };

// ────────────────────────────────────────────────────────────────────────────
// Inputs (all injected — mirror §4 facts; no IO, no clock)
// ────────────────────────────────────────────────────────────────────────────

/** A manager's identity for display (`manager.id` + `manager.display_name`). */
export interface ManagerInfo {
  managerId: string;
  displayName: string;
}

/** The scoring period being viewed live (`period.id` + `period.label`), or null pre-season. */
export interface CurrentPeriod {
  id: string;
  label: string;
}

/**
 * One starter in a manager's current-period lineup (a `lineup_slot` with `is_starter = true`).
 * `teamId` (= `player.team_id`) is the join key to the period's `fifa_match`; `locked` mirrors
 * `lineup_slot.locked_at !== null` (lock-on-play). `name` (= `player.display_name`) + `nation`
 * (= the `fifa_team.name` join, NEVER `player.country` — P34) make each starter identifiable so the
 * vsfield drill-in can render a named, tappable XI. `points` (= `score_player_match.points` for the
 * starter's match this period; 0 when no scored row exists yet) is the at-a-glance pitch chip value
 * (Prompt 41, path a). It is composed SERVER-SIDE on the owner-bypass loader, so the browser's direct
 * read scope is UNCHANGED (still only `score_manager_period` + `standing`) — the points reach the
 * client exclusively inside the server-computed snapshot JSON (this supersedes the modal-only decision
 * that kept per-player points out of the payload; the box-score modal still serves the full breakdown).
 */
export interface StarterInput {
  playerId: string;
  name: string;
  nation: string | null;
  role: Position;
  teamId: string | null;
  locked: boolean;
  /** Live/banked points for the starter's match this period; 0 when no scored row exists yet. */
  points: number;
}

/** A manager's starters for the current period. */
export interface ManagerLineupInput {
  managerId: string;
  starters: StarterInput[];
}

/**
 * One of the current period's fixtures (`fifa_match`). Drives each starter's match state (via the
 * `team_id` join) AND the match strip. A team plays exactly one match per group matchday, so a
 * team id resolves to at most one fixture in a period.
 */
export interface PeriodMatchInput {
  matchId: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  status: MatchStatus;
  kickoffAt: Date;
  homeScore: number | null;
  awayScore: number | null;
}

/** A season standing row read from the `standing` table — the AUTHORITATIVE W/L/points/seed. */
export interface SeasonStandingInput {
  managerId: string;
  allPlayAllW: number;
  allPlayAllL: number;
  totalPoints: number;
  seed: number | null;
}

export interface BuildVsFieldInput {
  /** The league this whole-field snapshot is for (the client needs it to scope the subscription). */
  leagueId: string;
  /** The signed-in league member viewing the board (marks "you" + drives the H2H column). */
  viewerManagerId: string;
  /** Every manager in the league (the directory for names + the all-play-all field; N is variable). */
  managers: ManagerInfo[];
  /** The current scoring period, or null when none is live yet. */
  currentPeriod: CurrentPeriod | null;
  /** `score_manager_period` rows for the current period (manager → points). Missing → 0 (inactive). */
  currentPeriodScores: ManagerPeriodPoints[];
  /** `is_starter` `lineup_slot` rows for the current period, per manager. */
  lineupsForPeriod: ManagerLineupInput[];
  /** The current period's `fifa_match` rows. */
  matchStatuses: PeriodMatchInput[];
  /** `standing` rows (season scope). */
  standings: SeasonStandingInput[];
  /** Per `group_md` period scores — enriches the season view (by-period chips, draws, win%). */
  perPeriodScores?: PeriodScores[];
  /** Injected clock (purity): used for `asOf` + scheduled-match "starts in" display. */
  now: Date;
}

// ────────────────────────────────────────────────────────────────────────────
// Output (display model)
// ────────────────────────────────────────────────────────────────────────────

/** A starter's live state, derived from his match's status. */
export type StarterState = "yet-to-play" | "playing" | "played";

export interface StarterView {
  playerId: string;
  /** `player.display_name` — surfaced so the drill-in XI is identifiable + tappable. */
  name: string;
  /** Nation from the `fifa_team.name` join (NEVER `player.country` — P34); null if no team link. */
  nation: string | null;
  role: Position;
  state: StarterState;
  /**
   * Per-player points for this period — the pitch "points chip" headline (Prompt 41, path a). Mapped
   * verbatim from `StarterInput.points` (`score_player_match.points`); 0 for a yet-to-play starter or a
   * live one with no scored row yet. Carried in the server-computed snapshot, NOT a browser-direct read
   * (Theme F's real invariant — the browser's direct read scope — holds; the modal-only rule is revised).
   */
  points: number;
  locked: boolean;
}

/**
 * Mutually-exclusive counts over a manager's starters. `noMatch` = a starter with no resolvable
 * fixture (null team, or a postponed/abandoned match) — the edge bucket so the four sum to the
 * starter count.
 */
export interface StillToCome {
  yetToPlay: number;
  playing: number;
  played: number;
  noMatch: number;
}

/**
 * Provisional all-play-all record for THIS period (Theme C). `d` (ties) is DISPLAY ONLY — a tie is
 * neither a W nor an L (it is never folded into `w`/`l`); `d = (opponents) - w - l`.
 */
export interface ProvisionalRecord {
  w: number;
  l: number;
  d: number;
}

export type H2HResult = "win" | "loss" | "tie";

/** The viewer vs ONE opponent this period, from the VIEWER's perspective. */
export interface H2HVsViewer {
  result: H2HResult;
  points: number;
  opponentPoints: number;
  margin: number;
}

export interface FieldEntry {
  managerId: string;
  displayName: string;
  isMe: boolean;
  rank: number;
  points: number;
  record: ProvisionalRecord;
  starters: StarterView[];
  counts: StillToCome;
  /** null for the viewer's own row. */
  h2hVsViewer: H2HVsViewer | null;
}

export interface SeasonPeriodChip {
  periodId: string;
  w: number;
  l: number;
  points: number;
}

export interface SeasonEntry {
  managerId: string;
  displayName: string;
  isMe: boolean;
  seed: number | null;
  rank: number;
  allPlayAllW: number;
  allPlayAllL: number;
  totalPoints: number;
  /** w / (w + l); 0 when nothing has been played. */
  winPct: number;
  byPeriod: SeasonPeriodChip[];
}

export interface MatchView {
  matchId: string;
  homeTeamName: string | null;
  awayTeamName: string | null;
  status: MatchStatus;
  kickoffAt: string;
  homeScore: number | null;
  awayScore: number | null;
  /** For `scheduled` matches: whole minutes until kickoff (may be negative if overdue); else null. */
  startsInMinutes: number | null;
}

export interface VsFieldView {
  asOf: string;
  leagueId: string;
  viewerManagerId: string;
  currentPeriod: CurrentPeriod | null;
  field: FieldEntry[];
  season: SeasonEntry[];
  matches: MatchView[];
}
