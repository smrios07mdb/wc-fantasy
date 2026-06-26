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
  shotsOnTarget: number | null;
  ballRecoveries: number | null;
  bigChancesCreated: number | null;
  crossesAccurate: number | null;
  touches: number | null;
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
  /** Optional match id — used ONLY to label the conceded-reconciliation warn (see buildScoreInput). */
  matchId?: string;
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

// ── card classification — exact incident_type gate (sibling of isGoalEvent); §7 second-yellow seam ─

// CardKind keeps its full vocabulary: `second_yellow` is still read by onPitchWindow/cardsFor even
// though classifyCard can no longer mint it (no feed class token for it — see the SEAM note below).
export type CardKind = "yellow" | "second_yellow" | "red";

/**
 * The minimal row shape {@link classifyCard} reads — just the two incident discriminators. Both the
 * engine's {@link EventRow} and the web Game-Detail event row are structurally assignable to it, which is
 * what lets ONE classifier serve recompute (scoring) and the read-only box score (T-CARD1). The classifier
 * is the single source of truth; widening the param off `EventRow` is type-only — the body is unchanged.
 */
export interface CardEvent {
  incidentType: string;
  incidentClass: string | null;
}

/**
 * Classify a card event, keyed on `incident_type` EXACTLY (`'card'`) — the sibling of
 * {@link isGoalEvent}'s exact gate. The earlier form substring-matched the combined `label(e)` and was
 * correct on live data only by luck: a `varDecision/cardUpgrade` row cleared its `includes("card")`
 * admission yet matched no colour branch (→ null). Keying on `incident_type` immunises against a
 * future upgrade label that carries a colour token (e.g. a hypothetical `varDecision/red`) minting a
 * phantom red beside the real `card/*` row it annotates. A VAR card upgrade is a feed ANNOTATION; the
 * upgrade itself materialises as a real `card/{yellow,red}` row that scores on its own (live data,
 * Q4 2026-06-19 — ARCHITECTURE.md §7 / Appendix A, DECISIONS.md).
 *
 * SEAM (separate thread): a two-yellow dismissal has no feed class token (Q4 2026-06-19); classes are
 * only `red` / `yellow`. Detecting it — the first-yellow −1 plus the second-yellow minute band — needs
 * cross-row pairing of two `card/yellow` rows for the same (player, match), which is aggregation-layer
 * work (the discipline rollup), NOT a per-row classification. So second_yellow is not produced here.
 */
export function classifyCard(e: CardEvent): CardKind | null {
  if (norm(e.incidentType) !== "card") return null; // exact gate — mirrors isGoalEvent; non-card types never enter
  const cls = norm(e.incidentClass);
  if (cls === "red") return "red";
  if (cls === "yellow") return "yellow";
  return null;
}

/**
 * A real GOAL incident — `incident_type='goal'` EXACTLY (classes regular / penalty / ownGoal). It
 * deliberately does NOT key on the label substring "goal": that wrongly swept in `varDecision` rows
 * whose class merely CONTAINS "goal" (goalAwarded, goalNotAwarded, vip_for_goal), inflating conceded
 * (the VAR-substring bug — DECISIONS.md). VAR outcomes are read separately by {@link overturnedGoals}.
 *
 * Exported (export keyword only — scoring byte-identical) so the read-only Game-Detail events timeline
 * (T16b) keys goals on the SAME predicate scoring uses, the single-source pattern already established for
 * {@link classifyCard} (T-CARD1). The web `GdEventInput` is structurally assignable to {@link EventRow}.
 */
export function isGoalEvent(e: EventRow): boolean {
  return norm(e.incidentType) === "goal";
}

/** Own-goal sub-type of a goal incident (label carries "own") — shared with the T16b timeline. */
export function isOwnGoalEvent(e: EventRow): boolean {
  return isGoalEvent(e) && label(e).includes("own");
}

/** A `varDecision`/`goalNotAwarded` row — the one VAR class that VOIDS a goal (the overturn signal). */
function isGoalNotAwarded(e: EventRow): boolean {
  return norm(e.incidentType) === "vardecision" && norm(e.incidentClass) === "goalnotawarded";
}

/**
 * GOAL events overturned by VAR (Route A — DECISIONS.md). The feed leaves a disallowed goal's
 * `goal/*` row in place (not rescinded); the only overturn signal is a sibling
 * `varDecision/goalNotAwarded` event for the SAME scorer. We pair each goalNotAwarded to the nearest
 * not-yet-voided same-player goal within ≤3 effective minutes — one void cancels exactly one goal.
 * Every other varDecision class (goalAwarded, vip_for_goal, …) is ignored: under {@link isGoalEvent}
 * those are no longer goals at all. Pure — derived solely from the event list; identity by reference.
 *
 * Exported (export keyword only — scoring byte-identical) so the T16b Game-Detail timeline excludes the
 * SAME VAR-disallowed goals scoring excludes (a disallowed `goal/*` row is not rescinded — see above).
 */
export function overturnedGoals(events: readonly EventRow[]): ReadonlySet<EventRow> {
  const goals = events.filter((e) => !e.rescinded && isGoalEvent(e) && e.playerId != null);
  const overturned = new Set<EventRow>();
  for (const v of events) {
    if (v.rescinded || !isGoalNotAwarded(v) || v.playerId == null) continue;
    let best: EventRow | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const g of goals) {
      if (g.playerId !== v.playerId || overturned.has(g)) continue;
      const dist = Math.abs(effMinute(g) - effMinute(v));
      if (dist <= 3 && dist < bestDist) {
        best = g;
        bestDist = dist;
      }
    }
    if (best) overturned.add(best);
  }
  return overturned;
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

/**
 * Was the player's team one of the two that actually contested THIS match? The keystone invariant
 * behind the live MD1 incident: a player whose team is neither home nor away never took the pitch, so
 * they can be neither scored nor charged a conceded goal. Used by both the conceded derivation
 * (defense in depth) and the {@link playerAppearedInMatch} participant gate. A null team_id ⇒ we
 * cannot confirm participation ⇒ treat as NOT in the match (conservative).
 */
function teamInMatch(t: MatchTeamContext): boolean {
  return (
    t.playerTeamId != null && (t.playerTeamId === t.homeTeamId || t.playerTeamId === t.awayTeamId)
  );
}

/** Whole-match goals against the player's team — clean-sheet input, from the match score (§7).
 *  Off-match teams return 0 here (no opponent score to read) — but a non-participant never reaches
 *  scoring at all (see {@link playerAppearedInMatch}), so "0 against" never becomes a phantom clean sheet. */
function teamGoalsAgainst(t: MatchTeamContext): number {
  if (!teamInMatch(t)) return 0;
  if (t.playerTeamId === t.homeTeamId) return n(t.awayScore);
  if (t.playerTeamId === t.awayTeamId) return n(t.homeScore);
  return 0;
}

/**
 * Is this goal event conceded by the player's team? (opponent goal, or own-goal by own team).
 * GUARD: the player's team must be in the match — without it, an uninvolved team's `scorerTeam !==
 * playerTeam` is trivially true for EVERY goal, so a non-participant "concedes" the whole match (the
 * live MD1 −1 bug). Defense in depth: the participant gate already blocks non-participants upstream.
 */
function concededByPlayerTeam(e: EventRow, t: MatchTeamContext): boolean {
  if (!teamInMatch(t) || e.playerId == null) return false;
  const scorerTeam = t.teamByPlayerId[e.playerId];
  if (scorerTeam == null) return false;
  return isOwnGoalEvent(e) ? scorerTeam === t.playerTeamId : scorerTeam !== t.playerTeamId;
}

/**
 * Goals conceded WHILE the player was on the pitch — the −1 input, from event minutes (§7). Skips
 * rescinded rows AND VAR-overturned goals ({@link overturnedGoals}): a disallowed goal never
 * happened, so it concedes nothing (the VAR-conceded fix — DECISIONS.md).
 */
function goalsConcededWhileOn(b: ScoreInputBundle, window: OnPitch): number {
  const overturned = overturnedGoals(b.events);
  let count = 0;
  for (const e of b.events) {
    if (e.rescinded || overturned.has(e) || !isGoalEvent(e)) continue;
    if (!concededByPlayerTeam(e, b.team)) continue;
    const m = effMinute(e);
    if (m >= window.entry && m <= window.exit) count++;
  }
  return count;
}

/**
 * Whole-match count of non-overturned goal events conceded by the player's team — the event-derived
 * shadow of {@link teamGoalsAgainst} (which reads the authoritative, VAR-correct match score). Unlike
 * {@link goalsConcededWhileOn} this is NOT windowed: it counts every standing conceded goal in the
 * match, so the two can be reconciled (see {@link reconcileConceded}).
 */
function concededGoalEventCount(b: ScoreInputBundle): number {
  const overturned = overturnedGoals(b.events);
  return b.events.filter(
    (e) => !e.rescinded && !overturned.has(e) && isGoalEvent(e) && concededByPlayerTeam(e, b.team),
  ).length;
}

/**
 * Route-A reconciliation invariant (DECISIONS.md / ARCHITECTURE.md Appendix A): the event-derived
 * conceded count MUST equal the authoritative VAR-correct match score. Agreement means our goal /
 * overturn classification reproduced the real score; divergence means a VAR shape we did not model.
 * Pure — the caller decides what to do with `ok` (tests assert it; {@link buildScoreInput} warns).
 */
export function reconcileConceded(b: ScoreInputBundle): {
  eventCount: number;
  matchScore: number;
  ok: boolean;
} {
  const eventCount = concededGoalEventCount(b);
  const matchScore = teamGoalsAgainst(b.team);
  return { eventCount, matchScore, ok: eventCount === matchScore };
}

/**
 * Whether the reconciliation invariant can be MEANINGFULLY evaluated for this bundle — i.e. whether a
 * mismatch would signal a VAR shape we did not model rather than a mere data gap. It is valid only
 * when (a) the player's team is in the match, (b) the FINAL score is known (home/away are NULL during
 * early-live / pre-settle, where an event-derived count legitimately leads the not-yet-ingested
 * score), and (c) every standing conceded-eligible goal has a resolvable scorer team (`player.team_id`
 * is documented as patchy; an unresolved scorer drops out of BOTH the event count and the windowed
 * conceded, so the gap is a data issue, not VAR). When any fails we stay silent rather than cry wolf —
 * the warn runs per-player every sweep tick, so false alarms would flood. This gates ONLY the warn;
 * the conceded value (`goalsConcededWhileOn`) is never affected.
 */
function reconciliationApplies(b: ScoreInputBundle): boolean {
  const t = b.team;
  if (!teamInMatch(t) || t.homeScore == null || t.awayScore == null) return false;
  const overturned = overturnedGoals(b.events);
  for (const e of b.events) {
    if (e.rescinded || overturned.has(e) || !isGoalEvent(e)) continue;
    if (e.playerId == null || t.teamByPlayerId[e.playerId] == null) return false;
  }
  return true;
}

// ── participant gate (the live MD1 "only score players who appeared" invariant) ─────────────────

/** A real (non-stub) stat line has at least one populated field; the `markStatPlayerDirty` stub is all-null. */
function statHasData(s: StatRow | null): boolean {
  return s != null && Object.values(s).some((v) => v != null);
}

/** Is this player named in any (non-rescinded) match event — start subbed, came on, scored, booked? */
function namedInAnyEvent(events: readonly EventRow[], playerId: string): boolean {
  return events.some(
    (e) =>
      !e.rescinded &&
      (e.playerId === playerId ||
        e.assistPlayerId === playerId ||
        e.playerInId === playerId ||
        e.playerOutId === playerId),
  );
}

/** Did this player take a shot in the match? */
function tookAnyShot(shots: readonly ShotRow[], playerId: string): boolean {
  return shots.some((s) => s.playerId === playerId);
}

/**
 * Did this player ACTUALLY appear in this match? Only participants earn a `score_player_match` row —
 * the live MD1 incident minted rows for players who never took the pitch (cross-team contamination
 * via a bad player↔match join, and all-null dirty stubs from `markStatPlayerDirty`), and a GK/DEF
 * stub was charged −1 for the match's goals. Two conditions, BOTH required:
 *   1. team-in-match — their team contested the fixture (kills cross-team contamination, the keystone), AND
 *   2. an appearance signal — a real (non-stub) stat line, OR they are named in a match event
 *      (start/sub/goal/card), OR they took a shot.
 * A bare dirty stub for a squad member who never featured fails (2); a wrong-match row fails (1).
 */
export function playerAppearedInMatch(b: ScoreInputBundle): boolean {
  if (!teamInMatch(b.team)) return false;
  return (
    statHasData(b.stat) || namedInAnyEvent(b.events, b.playerId) || tookAnyShot(b.shots, b.playerId)
  );
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

/** Own goals (−4) charged to this player, from own-goal-flagged goal incidents. */
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

  // Route-A safety net: the windowed conceded count rides on the same goal / overturn classification
  // as the whole-match count, which must reconcile to the authoritative score. If it does not — once
  // the comparison is even computable (reconciliationApplies: final score known + scorers resolvable)
  // — a VAR shape slipped past our model: warn (matchId + both counts) but NEVER throw, so live
  // scoring still proceeds on the windowed non-overturned count, just flagged for a human to inspect.
  if (reconciliationApplies(b)) {
    const reconciliation = reconcileConceded(b);
    if (!reconciliation.ok) {
      console.warn(
        `[recompute] conceded reconciliation mismatch: match=${b.team.matchId ?? "unknown"} ` +
          `team=${b.team.playerTeamId ?? "unknown"} eventGoals=${reconciliation.eventCount} ` +
          `matchScore=${reconciliation.matchScore}`,
      );
    }
  }

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
    shotsOnTarget: n(s?.shotsOnTarget),
    ballRecoveries: n(s?.ballRecoveries),
    bigChancesCreated: n(s?.bigChancesCreated),
    crossesAccurate: n(s?.crossesAccurate),
    touches: n(s?.touches),

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
