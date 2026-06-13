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
  FIFAPlayerRef,
  FIFAShot,
  FIFATeamMatchStats,
} from "@app/feed";
import { FeedShapeMismatchError } from "./errors";

const n = (v: number | null | undefined): number | null => v ?? null;
const s = (v: string | null | undefined): string | null => v ?? null;

type Ctx = Record<string, unknown>;

/** A structurally-required numeric id — present and finite, or fail loud. */
function requireNumber(entity: string, field: string, v: unknown, ctx: Ctx): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  throw new FeedShapeMismatchError(
    entity,
    field,
    `expected a finite number, got ${v === null ? "null" : typeof v}`,
    ctx,
  );
}

/** A structurally-required non-empty string, or fail loud. */
function requireString(entity: string, field: string, v: unknown, ctx: Ctx): string {
  if (typeof v === "string" && v.length > 0) return v;
  throw new FeedShapeMismatchError(
    entity,
    field,
    `expected a non-empty string, got ${v === null ? "null" : typeof v}`,
    ctx,
  );
}

/**
 * Extract `.id` from a documented NESTED player ref. Null/absent → null (a legitimately empty slot,
 * e.g. no assist). A non-null value that is NOT a `{ id: number }` object (e.g. the OLD flat `*_id`
 * number) fails loud — this is the exact mistake that silently nulled every player link before.
 */
function refId(
  entity: string,
  field: string,
  ref: FIFAPlayerRef | null | undefined,
  ctx: Ctx,
): number | null {
  if (ref == null) return null;
  if (typeof ref === "object" && typeof ref.id === "number" && Number.isFinite(ref.id))
    return ref.id;
  throw new FeedShapeMismatchError(
    entity,
    field,
    `expected a nested { id } object or null, got ${typeof ref}`,
    ctx,
  );
}

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
  /** Un-promoted feed fields, verbatim (see {@link buildStatExtra}). null when none. Unscored. */
  extra: Record<string, unknown> | null;
}

/**
 * Feed keys that already have a home and must NEVER leak into `extra`: every promoted scoring column
 * (mapped above) plus the identity / separate-path fields (ids handled here; rating via mapRating).
 */
const STAT_EXTRA_OMIT: ReadonlySet<string> = new Set([
  // promoted columns
  "minutes_played",
  "goals",
  "assists",
  "key_passes",
  "dribbles_attempted",
  "dribbles_completed",
  "duels_won",
  "duels_lost",
  "passes_total",
  "passes_accurate",
  "long_balls_total",
  "long_balls_accurate",
  "was_fouled",
  "clearances",
  "interceptions",
  "tackles_won",
  "blocked_shots",
  "saves",
  "saves_inside_box",
  "punches",
  "high_claims",
  "possession_lost",
  // identity / separate path
  "match_id",
  "player_id",
  "team_id",
  "is_home",
  "rating",
]);

/**
 * CATCH-ALL for the un-promoted FIFAPlayerMatchStats fields (xG/xA, shots_on_target, crosses, aerial
 * duels, fouls_committed, touches, ball_recoveries, big_chances, …). Every own key the feed actually
 * sent that isn't in {@link STAT_EXTRA_OMIT} is retained VERBATIM — including any field a future feed
 * edition adds (forward-compat, matching the schema comment). Values are kept as-sent (nulls retained);
 * only keys the feed didn't send are omitted. Empty result → null.
 */
function buildStatExtra(f: FIFAPlayerMatchStats): Record<string, unknown> | null {
  const extra: Record<string, unknown> = {};
  for (const key of Object.keys(f)) {
    if (STAT_EXTRA_OMIT.has(key)) continue;
    const value = f[key];
    if (value === undefined) continue; // a key the feed didn't send (keep explicit nulls)
    extra[key] = value;
  }
  return Object.keys(extra).length > 0 ? extra : null;
}

export function mapStatLine(f: FIFAPlayerMatchStats): StatLineRow {
  const ctx: Ctx = { match_id: f.match_id, player_id: f.player_id };
  return {
    matchBdlId: requireNumber("player_match_stats", "match_id", f.match_id, ctx),
    playerBdlId: requireNumber("player_match_stats", "player_id", f.player_id, ctx),
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
    extra: buildStatExtra(f),
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
  const ctx: Ctx = { id: f.id, match_id: f.match_id };
  return {
    bdlId: requireNumber("match_event", "id", f.id, ctx),
    matchBdlId: requireNumber("match_event", "match_id", f.match_id, ctx),
    incidentType: requireString("match_event", "incident_type", f.incident_type, ctx),
    incidentClass: s(f.incident_class), // carried VERBATIM (adapter keys 2nd-yellow vs red off it)
    timeMinute: n(f.time_minute),
    addedTime: n(f.added_time),
    period: s(f.period),
    // NESTED player objects on the documented shape — extract `.id` (fail loud on the old flat `*_id`).
    playerBdlId: refId("match_event", "player", f.player, ctx),
    assistPlayerBdlId: refId("match_event", "assist_player", f.assist_player, ctx),
    playerInBdlId: refId("match_event", "player_in", f.player_in, ctx),
    playerOutBdlId: refId("match_event", "player_out", f.player_out, ctx),
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

// The match_shots.situation token for a penalty, confirmed against the documented GOAT shape.
const PENALTY_SITUATION = "penalty";
export function mapShot(f: FIFAShot): ShotRowIn {
  const ctx: Ctx = { id: f.id, match_id: f.match_id };
  const situation = s(f.situation);
  return {
    bdlId: requireNumber("shot", "id", f.id, ctx),
    matchBdlId: requireNumber("shot", "match_id", f.match_id, ctx),
    playerBdlId: n(f.player_id),
    shotType: s(f.shot_type),
    situation,
    isPenalty: (situation ?? "").toLowerCase() === PENALTY_SITUATION,
    minute: n(f.time_minute), // documented field is `time_minute`, NOT `minute`
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
  const ctx: Ctx = { match_id: f.match_id, team_id: f.team_id };
  return {
    matchBdlId: requireNumber("team_match_stats", "match_id", f.match_id, ctx),
    teamBdlId: requireNumber("team_match_stats", "team_id", f.team_id, ctx),
    offsides: n(f.offsides),
    shotsBlocked: n(f.shots_blocked),
    possession: n(f.possession_pct), // documented field is `possession_pct`, NOT `possession`
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
    // round_name when present (knockouts); else the group matchday number as a label.
    round: f.round_name ?? (f.round_number != null ? String(f.round_number) : null),
    group: f.group?.name ?? null,
    stage: f.stage?.name ?? null,
    homeTeamBdlId: n(f.home_team?.id),
    awayTeamBdlId: n(f.away_team?.id),
    homeScore: n(f.home_score),
    awayScore: n(f.away_score),
    homeScoreEt: n(f.extra_time_home_score),
    awayScoreEt: n(f.extra_time_away_score),
    homeScorePens: n(f.home_score_penalties),
    awayScorePens: n(f.away_score_penalties),
    homeFormation: s(f.home_formation),
    awayFormation: s(f.away_formation),
    referee: s(f.referee?.name), // documented as a nested object { id, name, ... }, not a bare string
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
  const stageNorm = (f.stage?.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

  // Knockout: match the stage name (e.g. "Round of 32", "Quarter-finals", "Final").
  if (stageNorm && !stageNorm.includes("group")) {
    for (const [re, label] of KNOCKOUT)
      if (re.test(stageNorm)) return { kind: "knockout_round", label };
    const roundNorm = (f.round_name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const [re, label] of KNOCKOUT)
      if (re.test(roundNorm)) return { kind: "knockout_round", label };
  }

  // Group stage: round_number IS the matchday (1/2/3 → MD1/MD2/MD3).
  if (
    stageNorm.includes("group") &&
    Number.isInteger(f.round_number) &&
    (f.round_number as number) >= 1
  ) {
    return { kind: "group_md", label: `MD${f.round_number}` };
  }
  return null;
}
