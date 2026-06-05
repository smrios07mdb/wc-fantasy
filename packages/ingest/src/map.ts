/**
 * PURE feed→row mappers (ARCHITECTURE.md §4/§7). No IO, no clock. Output rows are keyed by
 * BALLDONTLIE ids; the store resolves them to internal UUIDs. EVERY column the §7 map consumes is
 * mapped — an unmapped column silently undercounts a score (the adapter coalesces null→0 downstream).
 */
import type { PeriodKind, Position } from "@app/shared";
import type {
  FIFAMatch,
  FIFAMatchEvent,
  FIFAPlayerMatchStats,
  FIFAShot,
  FIFATeamMatchStats,
} from "@app/feed";

const n = (v: number | null | undefined): number | null => v ?? null;
const s = (v: string | null | undefined): string | null => v ?? null;

/**
 * Map the BALLDONTLIE FIFA roster position (single-letter `G/D/M/F`, verified exhaustive across all
 * 1,253 2026 roster rows) to our {@link Position} enum. Unknown/null → `MID` defensively, so an
 * unexpected code from a future edition can never crash the rosters sync.
 */
const POSITION_BY_CODE: Record<string, Position> = { G: "GK", D: "DEF", M: "MID", F: "FWD" };
export function mapPosition(code: string | null | undefined): Position {
  return POSITION_BY_CODE[(code ?? "").trim().toUpperCase()] ?? "MID";
}

export interface StatLineRow {
  matchBdlId: number;
  playerBdlId: number;
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

export function mapStatLine(f: FIFAPlayerMatchStats): StatLineRow {
  return {
    matchBdlId: f.match_id,
    playerBdlId: f.player_id,
    minutesPlayed: n(f.minutes_played),
    goals: n(f.goals),
    assists: n(f.assists),
    keyPasses: n(f.key_passes),
    dribblesAttempted: n(f.dribbles_attempted),
    dribblesCompleted: n(f.dribbles_completed),
    duelsWon: n(f.duels_won),
    duelsLost: n(f.duels_lost),
    passesTotal: n(f.passes_total),
    passesAccurate: n(f.passes_accurate),
    longBallsTotal: n(f.long_balls_total),
    longBallsAccurate: n(f.long_balls_accurate),
    wasFouled: n(f.was_fouled),
    clearances: n(f.clearances),
    interceptions: n(f.interceptions),
    tacklesWon: n(f.tackles_won),
    blockedShots: n(f.blocked_shots),
    saves: n(f.saves),
    savesInsideBox: n(f.saves_inside_box),
    punches: n(f.punches),
    highClaims: n(f.high_claims),
    possessionLost: n(f.possession_lost),
  };
}

/** The native BALLDONTLIE rating → rating_player_match(source='balldontlie'). null when absent. */
export function mapRating(f: FIFAPlayerMatchStats): {
  matchBdlId: number;
  playerBdlId: number;
  rating: number | null;
} {
  return { matchBdlId: f.match_id, playerBdlId: f.player_id, rating: n(f.rating) };
}

export interface EventRowIn {
  bdlId: number;
  matchBdlId: number;
  incidentType: string;
  incidentClass: string | null;
  timeMinute: number | null;
  addedTime: number | null;
  period: string | null;
  playerBdlId: number | null;
  assistPlayerBdlId: number | null;
  playerInBdlId: number | null;
  playerOutBdlId: number | null;
  rescinded: boolean;
}

export function mapEvent(f: FIFAMatchEvent): EventRowIn {
  return {
    bdlId: f.id,
    matchBdlId: f.match_id,
    incidentType: f.incident_type,
    incidentClass: s(f.incident_class), // carried VERBATIM (adapter keys 2nd-yellow vs red off it)
    timeMinute: n(f.time_minute),
    addedTime: n(f.added_time),
    period: s(f.period),
    playerBdlId: n(f.player_id),
    assistPlayerBdlId: n(f.assist_player_id),
    playerInBdlId: n(f.player_in_id),
    playerOutBdlId: n(f.player_out_id),
    rescinded: f.rescinded ?? false,
  };
}

export interface ShotRowIn {
  bdlId: number;
  matchBdlId: number;
  playerBdlId: number | null;
  shotType: string | null;
  situation: string | null;
  isPenalty: boolean;
  minute: number | null;
}

// TODO(confirm): the exact match_shots.situation token for a penalty (first live GOAT data).
const PENALTY_SITUATION = "penalty";
export function mapShot(f: FIFAShot): ShotRowIn {
  const situation = s(f.situation);
  return {
    bdlId: f.id,
    matchBdlId: f.match_id,
    playerBdlId: n(f.player_id),
    shotType: s(f.shot_type),
    situation,
    isPenalty: (situation ?? "").toLowerCase() === PENALTY_SITUATION,
    minute: n(f.minute),
  };
}

export interface TeamStatRowIn {
  matchBdlId: number;
  teamBdlId: number;
  offsides: number | null;
  shotsBlocked: number | null;
  possession: number | null;
}
export function mapTeamStat(f: FIFATeamMatchStats): TeamStatRowIn {
  return {
    matchBdlId: f.match_id,
    teamBdlId: f.team_id,
    offsides: n(f.offsides),
    shotsBlocked: n(f.shots_blocked),
    possession: n(f.possession),
  };
}

export type FeedMatchStatus = "scheduled" | "in_progress" | "completed" | "postponed" | "abandoned";
// TODO(confirm): the exact feed status vocabulary; normalize defensively.
export function normalizeStatus(raw: string): FeedMatchStatus {
  const t = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (t.includes("progress") || t === "live" || t === "inplay") return "in_progress";
  if (t.includes("complete") || t === "finished" || t === "ft") return "completed";
  if (t.includes("postpon")) return "postponed";
  if (t.includes("abandon")) return "abandoned";
  return "scheduled";
}

export interface MatchRowIn {
  bdlId: number;
  kickoffAtIso: string;
  status: FeedMatchStatus;
  round: string | null;
  group: string | null;
  stage: string | null;
  homeTeamBdlId: number | null;
  awayTeamBdlId: number | null;
  homeScore: number | null;
  awayScore: number | null;
  homeScoreEt: number | null;
  awayScoreEt: number | null;
  homeScorePens: number | null;
  awayScorePens: number | null;
  homeFormation: string | null;
  awayFormation: string | null;
  referee: string | null;
}

export function mapMatchRow(f: FIFAMatch): MatchRowIn {
  return {
    bdlId: f.id,
    kickoffAtIso: f.datetime,
    status: normalizeStatus(f.status),
    round: s(f.round),
    group: s(f.group),
    stage: s(f.stage),
    homeTeamBdlId: n(f.home_team_id),
    awayTeamBdlId: n(f.away_team_id),
    homeScore: n(f.home_score),
    awayScore: n(f.away_score),
    homeScoreEt: n(f.home_score_et),
    awayScoreEt: n(f.away_score_et),
    homeScorePens: n(f.home_score_pens),
    awayScorePens: n(f.away_score_pens),
    homeFormation: s(f.home_formation),
    awayFormation: s(f.away_formation),
    referee: s(f.referee),
  };
}

const KNOCKOUT: Array<[RegExp, string]> = [
  [/roundof32|r32/, "R32"],
  [/roundof16|r16/, "R16"],
  [/quarter|qf/, "QF"],
  [/semi|sf/, "SF"],
  [/final/, "Final"],
];

/**
 * Structural period label for a fixture — from round/matchday, NEVER kickoff time (a postponement
 * would corrupt a time-derived matchday). Knockout: round → canonical label. Group: a usable matchday
 * integer → MD{n}; otherwise null (the caller leaves period_id null + TODO(confirm)).
 */
export function derivePeriodLabel(f: FIFAMatch): { kind: PeriodKind; label: string } | null {
  const round = (f.round ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (round) {
    for (const [re, label] of KNOCKOUT)
      if (re.test(round)) return { kind: "knockout_round", label };
  }
  // Group: look for an explicit matchday integer (loose field — confirm exact key on live data).
  const md = (f as Record<string, unknown>)["matchday"];
  const num = typeof md === "number" ? md : typeof md === "string" ? Number(md) : NaN;
  if (Number.isInteger(num) && num >= 1) return { kind: "group_md", label: `MD${num}` };
  // TODO(confirm): the feed gives stage/group/round but no confirmed matchday integer; derive MD1/2/3
  // structurally once the live shape is known — never by sorting kickoff times.
  return null;
}
