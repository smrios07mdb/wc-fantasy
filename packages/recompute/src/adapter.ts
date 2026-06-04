/**
 * DB-rows → `ScoreInput` adapter — PURE (no IO, no clock). A thin DB-read wrapper (prismaStore)
 * gathers the rows into a {@link ScoreInputBundle}; this module turns that bundle into the exact
 * `ScoreInput` the Prompt-02 engine consumes, owning every derivation ARCHITECTURE.md §7 prescribes
 * (the rule lives HERE, not upstream). Because it is a pure function of its inputs it is unit-
 * testable without a database, and a score stays a pure function of stored inputs (§4).
 */
import type { Position, RatingSource } from "@app/shared";
import type { ScoreInput } from "@app/scoring";

// ── Row shapes (the subset of the schema the engine consumes; all feed counts nullable) ──────────

export interface StatRow {
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
  blockedShots: number | null;
  interceptions: number | null;
  tacklesWon: number | null;
  saves: number | null;
  savesInsideBox: number | null;
  punches: number | null;
  highClaims: number | null;
  possessionLost: number | null;
}

/** `manual_stat_player_match`: the feed-gap fields the operator tags (penalty won/committed). */
export interface ManualRow {
  penaltyWon: number;
  penaltyCommitted: number;
}

/** One `event_match` row (goal / card / substitution / …). */
export interface EventRow {
  incidentType: string;
  incidentClass: string | null;
  timeMinute: number | null;
  addedTime: number | null;
  playerId: string | null;
  assistPlayerId: string | null;
  playerInId: string | null;
  playerOutId: string | null;
  rescinded: boolean;
}

/** One `shot_match` row (penalty detection for missed/saved derivations). */
export interface ShotRow {
  playerId: string | null;
  shotType: string | null;
  situation: string | null;
  isPenalty: boolean;
  minute: number | null;
}

/** Whole-match team context for the clean-sheet / goals-conceded / attribution derivations. */
export interface MatchTeamContext {
  /** The team this player turned out for (drives "which goals are against us"). */
  playerTeamId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  /** scorer / penalty-taker playerId → their teamId (for conceded / own-goal / penalty attribution). */
  teamByPlayerId: Readonly<Record<string, string | null | undefined>>;
}

/**
 * Everything the adapter needs for one (match, player). `role` is the role ACTUALLY played — the
 * read-wrapper resolves it (manual goalie-emergency override, else `player.position`; ARCHITECTURE
 * §3 puts that role change on the Cowork surface). `rating`/`ratingSource` come pre-resolved.
 */
export interface ScoreInputBundle {
  playerId: string;
  role: Position;
  rating: number | null;
  ratingSource: RatingSource | null;
  stat: StatRow | null;
  manual: ManualRow | null;
  events: readonly EventRow[];
  shots: readonly ShotRow[];
  team: MatchTeamContext;
}

// ── tiny pure helpers ────────────────────────────────────────────────────────────────────────

const n = (v: number | null | undefined): number => v ?? 0;

/** Lowercase + strip non-alphanumerics, so "second-yellow" / "yellowRed" normalise comparably. */
const norm = (s: string | null | undefined): string =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Effective match minute (incl. added time) — the Card-handling clarification bucket key. */
const effMinute = (e: { timeMinute: number | null; addedTime: number | null }): number =>
  n(e.timeMinute) + n(e.addedTime);

const label = (e: EventRow): string => `${norm(e.incidentType)} ${norm(e.incidentClass)}`;

// ── card classification (the §7 incident_class "second-yellow vs red" confirm-in-code item) ──────

type CardKind = "yellow" | "second_yellow" | "red";

/**
 * Classify a card event defensively from incidentType+incidentClass. A card that is BOTH yellow and
 * red (e.g. "yellowRed") — or explicitly "second" — is a **second yellow, NOT a straight red**.
 * TODO(confirm): verify `match_events.incident_class` labels against first live data (ARCHITECTURE §7).
 */
function classifyCard(e: EventRow): CardKind | null {
  const l = label(e);
  const yellow = l.includes("yellow");
  const red = l.includes("red");
  if (!yellow && !red && !l.includes("card")) return null;
  const second =
    l.includes("second") || l.includes("yellow2") || l.includes("2ndyellow") || (yellow && red);
  if (second) return "second_yellow";
  if (red) return "red";
  if (yellow) return "yellow";
  return null;
}

function isGoalEvent(e: EventRow): boolean {
  return label(e).includes("goal");
}

function isOwnGoalEvent(e: EventRow): boolean {
  return isGoalEvent(e) && label(e).includes("own");
}

// ── derivations ───────────────────────────────────────────────────────────────────────────────

/** The player's on-pitch window [entry, exit] in effective minutes (exit = ∞ if never withdrawn). */
interface OnPitch {
  entry: number;
  exit: number;
}

function onPitchWindow(events: readonly EventRow[], playerId: string): OnPitch {
  let entry = 0; // starters are on from kickoff (no sub-in event)
  let exit = Number.POSITIVE_INFINITY; // played to the final whistle unless withdrawn / sent off
  for (const e of events) {
    if (e.rescinded) continue;
    if (e.playerInId === playerId) entry = effMinute(e);
    if (e.playerOutId === playerId) exit = Math.min(exit, effMinute(e));
    if (e.playerId === playerId) {
      const kind = classifyCard(e);
      if (kind === "red" || kind === "second_yellow") exit = Math.min(exit, effMinute(e));
    }
  }
  return { entry, exit };
}

/** Whole-match goals against the player's team — clean-sheet input, from the match score (§7). */
function teamGoalsAgainst(t: MatchTeamContext): number {
  if (t.playerTeamId != null && t.playerTeamId === t.homeTeamId) return n(t.awayScore);
  if (t.playerTeamId != null && t.playerTeamId === t.awayTeamId) return n(t.homeScore);
  return 0;
}

/** Is this goal event conceded by the player's team? (opponent goal, or own-goal by own team). */
function concededByPlayerTeam(
  e: EventRow,
  playerTeamId: string | null,
  teamBy: MatchTeamContext["teamByPlayerId"],
): boolean {
  if (playerTeamId == null || e.playerId == null) return false;
  const scorerTeam = teamBy[e.playerId];
  if (scorerTeam == null) return false;
  return isOwnGoalEvent(e) ? scorerTeam === playerTeamId : scorerTeam !== playerTeamId;
}

/** Goals conceded WHILE the player was on the pitch — the −1/2 input, from event minutes (§7). */
function goalsConcededWhileOn(b: ScoreInputBundle, window: OnPitch): number {
  let count = 0;
  for (const e of b.events) {
    if (e.rescinded || !isGoalEvent(e)) continue;
    if (!concededByPlayerTeam(e, b.team.playerTeamId, b.team.teamByPlayerId)) continue;
    const m = effMinute(e);
    if (m >= window.entry && m <= window.exit) count++;
  }
  return count;
}

const isPenaltyShot = (s: ShotRow): boolean => s.isPenalty || norm(s.situation) === "penalty";
const isGoalShot = (s: ShotRow): boolean => norm(s.shotType) === "goal";
const isSavedShot = (s: ShotRow): boolean => {
  const t = norm(s.shotType);
  return t === "save" || t === "saved";
};

/** Penalty missed (−3): a penalty taken by this player that did not score (incl. saved). */
function penaltyMissed(b: ScoreInputBundle): number {
  return b.shots.filter((s) => s.playerId === b.playerId && isPenaltyShot(s) && !isGoalShot(s))
    .length;
}

/** Penalty saved (+5, §5): a saved opponent penalty while this role-played GK was on the pitch. */
function penaltySaved(b: ScoreInputBundle, window: OnPitch): number {
  if (b.role !== "GK") return 0; // engine also gates on GK; we attribute only to the on-pitch keeper
  return b.shots.filter((s) => {
    if (!isPenaltyShot(s) || !isSavedShot(s)) return false;
    const takerTeam = s.playerId ? b.team.teamByPlayerId[s.playerId] : undefined;
    if (takerTeam == null || b.team.playerTeamId == null || takerTeam === b.team.playerTeamId)
      return false;
    const m = n(s.minute);
    return m >= window.entry && m <= window.exit;
  }).length;
}

/** Own goals (−2) charged to this player, from own-goal-flagged goal incidents. */
function ownGoals(b: ScoreInputBundle): number {
  return b.events.filter((e) => !e.rescinded && isOwnGoalEvent(e) && e.playerId === b.playerId)
    .length;
}

/** Cards for this player, honoring the stacking clarification (yellow set alongside a 2nd yellow). */
function cardsFor(
  events: readonly EventRow[],
  playerId: string,
): {
  yellowCard: boolean;
  secondYellowMinute: number | null;
  redCardMinute: number | null;
} {
  let yellowCard = false;
  let secondYellowMinute: number | null = null;
  let redCardMinute: number | null = null;
  for (const e of events) {
    if (e.rescinded || e.playerId !== playerId) continue;
    const kind = classifyCard(e);
    if (kind === "yellow") {
      yellowCard = true;
    } else if (kind === "second_yellow") {
      yellowCard = true; // stack the first yellow's −1 even if the feed only emits the 2nd-yellow event
      secondYellowMinute = effMinute(e);
    } else if (kind === "red") {
      redCardMinute = effMinute(e);
    }
  }
  return { yellowCard, secondYellowMinute, redCardMinute };
}

/**
 * Assemble the exact `ScoreInput` for one (match, player). Save-outside-box is NOT computed here:
 * the engine derives it from `saves` − `savesInsideBox` (the Prompt-02 contract), so the adapter
 * just supplies both raw counts.
 */
export function buildScoreInput(b: ScoreInputBundle): ScoreInput {
  const s = b.stat;
  const window = onPitchWindow(b.events, b.playerId);
  const cards = cardsFor(b.events, b.playerId);

  return {
    role: b.role,
    minutesPlayed: n(s?.minutesPlayed),
    rating: b.rating,
    ratingSource: b.ratingSource,

    goals: n(s?.goals),
    assists: n(s?.assists),

    keyPasses: n(s?.keyPasses),
    dribblesAttempted: n(s?.dribblesAttempted),
    dribblesCompleted: n(s?.dribblesCompleted),
    duelsWon: n(s?.duelsWon),
    duelsLost: n(s?.duelsLost),
    passesTotal: n(s?.passesTotal),
    passesAccurate: n(s?.passesAccurate),
    longBallsTotal: n(s?.longBallsTotal),
    longBallsAccurate: n(s?.longBallsAccurate),
    wasFouled: n(s?.wasFouled),
    clearances: n(s?.clearances),
    blockedShots: n(s?.blockedShots),
    interceptions: n(s?.interceptions),
    tacklesWon: n(s?.tacklesWon),
    possessionLost: n(s?.possessionLost),

    saves: n(s?.saves),
    savesInsideBox: n(s?.savesInsideBox),
    punches: n(s?.punches),
    highClaims: n(s?.highClaims),

    teamGoalsAgainst: teamGoalsAgainst(b.team),
    goalsConcededWhileOn: goalsConcededWhileOn(b, window),

    penaltyWon: n(b.manual?.penaltyWon),
    penaltyCommitted: n(b.manual?.penaltyCommitted),
    penaltyMissed: penaltyMissed(b),
    penaltySaved: penaltySaved(b, window),

    yellowCard: cards.yellowCard,
    secondYellowMinute: cards.secondYellowMinute,
    redCardMinute: cards.redCardMinute,
    ownGoals: ownGoals(b),
  };
}
