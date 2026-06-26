/**
 * Pure view-model builder for the single-match Game Detail screen (T5/T6). Transforms already-fetched,
 * side-agnostic DB rows into the display model the screen renders. NO IO, NO DB, NO clock — every input
 * is injected. Read-only over already-SCORED data: it never re-runs the engine.
 *
 * The fantasy points + raw stats it folds in exist for EVERY match participant (both XIs + the subs who
 * featured), not only rostered players — recompute writes a `score_player_match` row per participant via
 * the `playerAppearedInMatch` gate, with NO roster join (see DECISIONS → Game Detail). So a full 22+ box
 * score is fully backed by stored data; the owner overlay is the only piece that needs a fantasy period.
 *
 * Card classification REUSES recompute's shared `classifyCard` (@app/recompute) — the single source of
 * truth (T-CARD1): incident_type "card" with incident_class red/yellow. Two-yellow→red banding is OUT OF
 * SCOPE (it needs cross-row pairing at the aggregation layer); rows are shown as classified (a 2nd booking
 * is a second yellow, never auto-folded).
 *
 * The formation PITCH is the reconciled KICKOFF XI, NOT the raw `is_starter` sheet: the feed over-marks
 * `is_starter` on some completed matches (a side can carry 12+ flagged starters). The kickoff XI is a
 * deterministic cascade over the injected sheet + substitution events + minutes (see {@link keptOnPitch});
 * `side.starters` === `side.pitch` on a sheet side. The root cause is feed over-marking — this fixes it at
 * READ time only; ingest and the stored `is_starter` data are untouched. A side that can't resolve to 11
 * renders the kept set as-is (never padded/trimmed) and surfaces a {@link LineupAnomaly}.
 */
import { UNNAMED_OPPONENT } from "@/src/lineup/view";
import {
  classifyCard,
  isGoalEvent,
  isOwnGoalEvent,
  overturnedGoals,
  resolveRating,
  type RatingRow,
} from "@app/recompute";
import type { Position } from "@app/shared";
import type {
  BuildGameDetailInput,
  EventScoreAnomaly,
  GameDetailView,
  GameEvent,
  GameStatGroup,
  GameStatistics,
  GameStatRow,
  GdEventInput,
  GdPlayerInput,
  GdRatingInput,
  GdStandingInput,
  GdStatInput,
  GdTeamStatInput,
  GameStandingRow,
  GameStandings,
  LineupAnomaly,
  PlayerLine,
  PlayerRole,
  SquadSide,
  StatChip,
  StatFormat,
} from "./types";

// ─── ordering ─────────────────────────────────────────────────────────────────────

const POSITION_ORDER: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

/** Team-sheet order: by position (GK→FWD), then name. Used within each role group. */
function byPositionThenName(a: PlayerLine, b: PlayerLine): number {
  const d = POSITION_ORDER[a.position] - POSITION_ORDER[b.position];
  return d !== 0 ? d : a.displayName.localeCompare(b.displayName);
}

/** Subs who came on: earliest entry first (nulls last), then name. */
function byEntryThenName(a: PlayerLine, b: PlayerLine): number {
  const am = a.cameOnMinute ?? Number.POSITIVE_INFINITY;
  const bm = b.cameOnMinute ?? Number.POSITIVE_INFINITY;
  return am !== bm ? am - bm : a.displayName.localeCompare(b.displayName);
}

/**
 * Effective match minute = `time_minute` + `added_time` (e.g. 45+2 → 47); null when the feed omits the
 * base minute. Mirrors the engine's `effMinute`, applied to the raw columns now carried on `GdEventInput`.
 */
function effMin(e: GdEventInput): number | null {
  return e.timeMinute === null ? null : e.timeMinute + (e.addedTime ?? 0);
}

// ─── per-player derivation ──────────────────────────────────────────────────────

interface EventFacts {
  yellowCards: number;
  redCard: boolean;
  /** Player is the playerIn side of a non-rescinded substitution → he came ON after kickoff (a Sub). */
  cameOn: boolean;
  /** Player is the playerOut side of a non-rescinded substitution → he was ON at kickoff, withdrawn. */
  wentOff: boolean;
  /**
   * Player is the subject (playerId) of a non-rescinded NON-substitution event (a card / goal / VAR row;
   * substitution rows carry no playerId). Proof he was physically on the pitch, independent of whether
   * minutes were ingested — keeps a null-minute red-carded starter from being dropped as a phantom.
   */
  onFieldEvent: boolean;
  cameOnMinute: number | null;
  wentOffMinute: number | null;
  named: boolean;
}

/** Fold one player's events into card counts + sub on/off minutes/booleans + on-field / "named" signals. */
function eventFactsFor(playerId: string, events: readonly GdEventInput[]): EventFacts {
  let yellowCards = 0;
  let redCard = false;
  let cameOn = false;
  let wentOff = false;
  let onFieldEvent = false;
  let cameOnMinute: number | null = null;
  let wentOffMinute: number | null = null;
  let named = false;

  for (const e of events) {
    if (e.rescinded) continue;
    if (e.playerInId === playerId) {
      named = true;
      cameOn = true; // came on; the minute may be unknown but the boolean still flags the role
      const m = effMin(e);
      if (m !== null) cameOnMinute = cameOnMinute === null ? m : Math.min(cameOnMinute, m);
    }
    if (e.playerOutId === playerId) {
      named = true;
      wentOff = true;
      const m = effMin(e);
      if (m !== null) wentOffMinute = wentOffMinute === null ? m : Math.min(wentOffMinute, m);
    }
    if (e.playerId === playerId) {
      named = true;
      onFieldEvent = true;
      const kind = classifyCard(e);
      if (kind === "yellow") yellowCards += 1;
      else if (kind === "red") redCard = true;
    }
  }
  return {
    yellowCards,
    redCard,
    cameOn,
    wentOff,
    onFieldEvent,
    cameOnMinute,
    wentOffMinute,
    named,
  };
}

/**
 * Pair each substitution (player_out ↔ player_in) so a lineup row can name its counterpart: who came on
 * for a withdrawn starter, and who a come-on sub replaced. Only events carrying BOTH ids are paired (a
 * come-on whose player_in id is missing yields no pairing). Names are resolved against the player union.
 */
function subPairings(events: readonly GdEventInput[]): {
  replacementOf: Map<string, string>; // player_out id → the player_in who came on for him
  replacedOf: Map<string, string>; // player_in id → the player_out he replaced
} {
  const replacementOf = new Map<string, string>();
  const replacedOf = new Map<string, string>();
  for (const e of events) {
    if (e.rescinded) continue;
    if (e.playerInId !== null && e.playerOutId !== null) {
      replacementOf.set(e.playerOutId, e.playerInId);
      replacedOf.set(e.playerInId, e.playerOutId);
    }
  }
  return { replacementOf, replacedOf };
}

/**
 * Group source-tagged rating rows by player into the `RatingRow[]` the shared resolver consumes. The
 * actual pick (manual > balldontlie) is delegated to `resolveRating` so the displayed rating is the
 * same number scoring would read — no second priority table here.
 */
function groupRatingRows(ratings: readonly GdRatingInput[]): Map<string, RatingRow[]> {
  const byPlayer = new Map<string, RatingRow[]>();
  for (const r of ratings) {
    const row: RatingRow = { source: r.source, rating: r.rating };
    const rows = byPlayer.get(r.playerId);
    if (rows) rows.push(row);
    else byPlayer.set(r.playerId, [row]);
  }
  return byPlayer;
}

function chipsFor(position: Position, stat: GdStatInput | undefined): StatChip[] {
  const chips: StatChip[] = [];
  if (!stat) return chips;
  if (stat.goals && stat.goals > 0) chips.push({ label: "G", value: String(stat.goals) });
  if (stat.assists && stat.assists > 0) chips.push({ label: "A", value: String(stat.assists) });
  if (position === "GK" && stat.saves && stat.saves > 0)
    chips.push({ label: "SV", value: String(stat.saves) });
  return chips;
}

/**
 * The kickoff-XI cascade decision for a CANDIDATE on a side WITH a sheet (candidates = `is_starter` rows
 * ∪ any `player_out`). A candidate is on the kickoff pitch iff:
 *   (a) he did NOT come on after kickoff — a `player_in` is a Sub; came-on WINS even if he later went off
 *       (so this gate is evaluated first, not subsumed by (b)), AND
 *   (b) there is evidence he was on AT kickoff: he was withdrawn (`player_out`), OR logged minutes > 0,
 *       OR is named in an on-field event (a card/goal proves presence — this keeps a null-minute
 *       red-carded starter). A flagged starter with NO minutes AND no events is a feed mislabel →
 *       dropped, but ONLY when `phantomDropEnabled` (the match is TERMINAL — completed/abandoned — AND
 *       has minute data). This guard is the difference between "didn't play" and "data not in yet": a
 *       LIVE match ingests minutes per-player incrementally, so a genuine starter may legitimately have
 *       null minutes mid-match — dropping him would collapse the live XI. So before the match ends (pre-
 *       kickoff OR in-progress) the sheet is kept as-is; a terminal match with no minute data at all is
 *       likewise left untouched (a drop can't be justified). The came-on removal (a) and the player_out
 *       add-back are event-driven and ALWAYS apply, so a live pitch still updates as substitutions land.
 */
function keptOnPitch(
  facts: EventFacts,
  minutes: number | null,
  phantomDropEnabled: boolean,
): boolean {
  if (facts.cameOn) return false; // (a) came on after kickoff → a Sub, never the kickoff XI
  if (facts.wentOff) return true; // (b) withdrawn ⇒ was on at kickoff
  if (minutes !== null && minutes > 0) return true; // (b) logged minutes
  if (facts.onFieldEvent) return true; // (b) a card / goal ⇒ on the pitch (null-minute red card)
  return !phantomDropEnabled; // no evidence: drop a flagged starter ONLY when the drop is enabled
}

/**
 * Final role from the kickoff-XI membership. On a side WITH a sheet, `role: "starter"` ⟺ `onPitch`, so
 * the Starting XI list and the formation pitch carry the IDENTICAL set (the §25 invariant). A side with
 * NO sheet keeps the appearance-inference fallback (graceful: show a squad) with the pitch left empty.
 */
function roleFor(
  onPitch: boolean,
  isStarterEntry: boolean | undefined,
  didCameOn: boolean,
  appeared: boolean,
  sideHasSheet: boolean,
): PlayerRole {
  if (onPitch) return "starter";
  if (sideHasSheet) {
    // Not on the kickoff pitch. A come-on is a Sub; so is an off-sheet appearance (a come-on whose
    // player_in event lacked an id). A sheet bench, a dropped feed-phantom starter, or an off-sheet
    // non-appearance is Bench — listed (named, did not feature), never silently dropped.
    if (didCameOn) return "sub";
    if (isStarterEntry === undefined && appeared) return "sub";
    return "bench";
  }
  // No official sheet for the side at all → infer from match signals (graceful: show a squad).
  if (didCameOn) return "sub";
  if (appeared) return "starter"; // appeared, not subbed on, no sheet → treat as a starter
  return "bench";
}

// ─── kickoff label (deterministic UTC — no clock, no locale) ──────────────────────

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function kickoffLabelUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const wd = WEEKDAYS[d.getUTCDay()];
  const day = d.getUTCDate();
  const mon = MONTHS[d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${wd} ${day} ${mon} · ${hh}:${mm}`;
}

// ─── events timeline (T16b) ──────────────────────────────────────────────────────────

/** Lowercase + strip non-alphanumerics (mirrors the engine's `norm`) — for period / incident matching. */
const norm = (s: string | null | undefined): string =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Combined incident label (mirrors the engine's private `label`) — used only to flag penalties here. */
const eventLabel = (e: GdEventInput): string => `${norm(e.incidentType)} ${norm(e.incidentClass)}`;

function otherSide(s: "home" | "away" | null): "home" | "away" | null {
  return s === "home" ? "away" : s === "away" ? "home" : null;
}

/** Resolve an event participant id to its match side (null when absent/unplaceable). */
function sideOfId(
  id: string | null,
  sideById: ReadonlyMap<string, "home" | "away" | null>,
): "home" | "away" | null {
  return id === null ? null : (sideById.get(id) ?? null);
}

/**
 * Coarse chronological rank from `event_match.period` (1H/2H/ET/PEN → 1/2/3/4); the HT marker rides the
 * 1→2 boundary. Falls back to the effective minute when the feed omits `period` (defensive — the feed
 * normally sets it). Drives the PRIMARY sort key so extra-time / penalties never sort before regulation.
 */
function periodRank(e: GdEventInput): number {
  const p = norm(e.period);
  if (p === "1h" || p === "firsthalf") return 1;
  if (p === "2h" || p === "secondhalf") return 2;
  if (p.startsWith("et") || p === "extratime" || p === "aet") return 3;
  if (p.startsWith("pen") || p === "p") return 4;
  const m = effMin(e);
  if (m === null || m <= 45) return 1;
  if (m <= 90) return 2;
  if (m <= 120) return 3;
  return 4;
}

/**
 * A substitution row — matched leniently (`includes("substitut")`) to mirror ingestion's `isSubstitution`
 * (`packages/ingest/src/ingest.ts`, the de-facto feed contract), so a wording drift like "substitute" can't
 * silently drop a sub from the timeline while ingestion still pairs/locks it.
 */
function isSubEvent(e: GdEventInput): boolean {
  return norm(e.incidentType).includes("substitut");
}

/** Same-minute ordering: goal → card → sub, then anything else (a fixed, deterministic kind order). */
function kindRank(e: GdEventInput): number {
  if (isGoalEvent(e)) return 0;
  if (classifyCard(e) !== null) return 1;
  if (isSubEvent(e)) return 2;
  return 3;
}

/**
 * Final deterministic tiebreak from row CONTENT (not input order) so two same-(period, effMinute, kind) rows
 * order stably. Includes the raw `time_minute`/`added_time` split so a "45+2'" and a "47'" row (same effMinute)
 * never tie — making the sort strictly total regardless of input order, even on that (real-feed-impossible) edge.
 */
function tieKey(e: GdEventInput): string {
  return [
    e.playerId ?? "",
    e.playerInId ?? "",
    e.playerOutId ?? "",
    e.assistPlayerId ?? "",
    norm(e.incidentClass),
    String(e.timeMinute ?? ""),
    String(e.addedTime ?? ""),
  ].join("|");
}

/** "45+2'" when there is added time, else "73'"; null when the feed omits the base minute. */
function minuteLabelOf(e: GdEventInput): string | null {
  if (e.timeMinute === null) return null;
  const added = e.addedTime ?? 0;
  return added > 0 ? `${e.timeMinute}+${added}'` : `${e.timeMinute}'`;
}

function marker(label: string, homeScore: number, awayScore: number): GameEvent {
  return {
    kind: "marker",
    side: null,
    minute: null,
    minuteLabel: null,
    period: null,
    label,
    homeScore,
    awayScore,
    playerId: null,
    playerName: null,
    assistName: null,
    secondaryName: null,
    cardKind: null,
    isPenalty: false,
    isOwnGoal: false,
  };
}

/**
 * Pure ordered events timeline + the terminal score-reconciliation flag (T16b). Goals, subs, and cards are
 * classified on the SHARED engine predicates (`isGoalEvent` / `isOwnGoalEvent` / `overturnedGoals` /
 * `classifyCard`) so the timeline keys EXACTLY as scoring does: an own goal credits the OPPOSING side, a
 * VAR-overturned goal (its `goal/*` row is not rescinded — paired void only) is excluded, and every
 * `varDecision` row is dropped (the VAR theme is closed — no VAR display). The running score is replayed by
 * accumulating goals in chronological order. A goal whose scorer can't be placed on a side is counted but
 * NEVER silently credited; a terminal computed-vs-stored mismatch is surfaced (mirrors {@link LineupAnomaly}).
 */
function buildEvents(
  events: readonly GdEventInput[],
  sideById: ReadonlyMap<string, "home" | "away" | null>,
  fullNameById: ReadonlyMap<string, string>,
  isTerminal: boolean,
  finalHome: number | null,
  finalAway: number | null,
): { events: GameEvent[]; anomaly: EventScoreAnomaly | null } {
  const overturned = overturnedGoals(events);
  const timeline = events.filter(
    (e) =>
      !e.rescinded &&
      norm(e.incidentType) !== "vardecision" && // VAR rows DROPPED (closed theme — no VAR display)
      !(isGoalEvent(e) && overturned.has(e)), // VAR-disallowed goal excluded (mirrors scoring exactly)
  );

  const ranked = timeline.slice().sort((a, b) => {
    const pr = periodRank(a) - periodRank(b);
    if (pr !== 0) return pr;
    const ma = effMin(a) ?? 0;
    const mb = effMin(b) ?? 0;
    if (ma !== mb) return ma - mb;
    const kr = kindRank(a) - kindRank(b);
    if (kr !== 0) return kr;
    return tieKey(a).localeCompare(tieKey(b));
  });

  const nameOf = (id: string | null): string | null =>
    id === null ? null : (fullNameById.get(id) ?? null);

  const out: GameEvent[] = [];
  let hs = 0;
  let as = 0;
  let unresolvedGoals = 0;
  let htInserted = false;

  out.push(marker("Kick-off", hs, as)); // synthetic KO — always first, 0–0

  for (const e of ranked) {
    // Half-time = the 1H → (2H/ET/PEN) boundary, inserted once, carrying the 1H running score.
    if (!htInserted && periodRank(e) >= 2) {
      out.push(marker("Half-time", hs, as));
      htInserted = true;
    }
    if (isGoalEvent(e)) {
      const scorerSide = sideOfId(e.playerId, sideById);
      const benefit = isOwnGoalEvent(e) ? otherSide(scorerSide) : scorerSide;
      if (benefit === "home") hs += 1;
      else if (benefit === "away") as += 1;
      else unresolvedGoals += 1; // scorer not placeable → count, never silently credit a side
      out.push({
        kind: "goal",
        side: benefit,
        minute: effMin(e),
        minuteLabel: minuteLabelOf(e),
        period: e.period,
        label: null,
        homeScore: hs,
        awayScore: as,
        playerId: e.playerId,
        playerName: nameOf(e.playerId),
        assistName: nameOf(e.assistPlayerId),
        secondaryName: null,
        cardKind: null,
        // Full word "penalty" (the feed's goal class), NOT the substring "pen" — "openPlay" → "openplay"
        // contains "pen" and would false-flag an open-play goal.
        isPenalty: eventLabel(e).includes("penalty"),
        isOwnGoal: isOwnGoalEvent(e),
      });
    } else if (isSubEvent(e)) {
      out.push({
        kind: "sub",
        side: sideOfId(e.playerInId, sideById) ?? sideOfId(e.playerOutId, sideById),
        minute: effMin(e),
        minuteLabel: minuteLabelOf(e),
        period: e.period,
        label: null,
        homeScore: hs,
        awayScore: as,
        playerId: e.playerInId, // the player coming ON is the headline
        playerName: nameOf(e.playerInId),
        assistName: null,
        secondaryName: nameOf(e.playerOutId), // the player going OFF
        cardKind: null,
        isPenalty: false,
        isOwnGoal: false,
      });
    } else {
      const card = classifyCard(e);
      if (card === null) continue; // unknown incident type → not on the timeline
      out.push({
        kind: "card",
        side: sideOfId(e.playerId, sideById),
        minute: effMin(e),
        minuteLabel: minuteLabelOf(e),
        period: e.period,
        label: null,
        homeScore: hs,
        awayScore: as,
        playerId: e.playerId,
        playerName: nameOf(e.playerId),
        assistName: null,
        secondaryName: null,
        // A 2nd-yellow dismissal renders as a red (addition #2); the feed also posts a real `card/red` row
        // for it, which classifyCard maps to "red" directly (no `second_yellow` token on live data today).
        cardKind: card === "second_yellow" ? "red" : card,
        isPenalty: false,
        isOwnGoal: false,
      });
    }
  }

  if (isTerminal) out.push(marker("Full-time", hs, as)); // live-safe: no FT mid-match

  const finalKnown = finalHome !== null && finalAway !== null;
  const scoreMismatch = isTerminal && finalKnown && (hs !== finalHome || as !== finalAway);
  const anomaly: EventScoreAnomaly | null =
    scoreMismatch || unresolvedGoals > 0
      ? { computedHome: hs, computedAway: as, finalHome, finalAway, unresolvedGoals }
      : null;

  return { events: out, anomaly };
}

// ─── main export ─────────────────────────────────────────────────────────────────

export function buildGameDetail(input: BuildGameDetailInput): GameDetailView {
  const {
    match,
    players,
    stats,
    scores,
    ratings,
    teamStats,
    standings = [],
    lineupEntries,
    events,
    ownerByPlayer,
    unresolvedFromPool,
  } = input;

  const statByPlayer = new Map(stats.map((s) => [s.playerId, s]));
  const scoreByPlayer = new Map(scores.map((s) => [s.playerId, s.points]));
  const ratingRowsByPlayer = groupRatingRows(ratings);
  const lineupByPlayer = new Map(lineupEntries.map((e) => [e.playerId, e.isStarter]));
  const { replacementOf, replacedOf } = subPairings(events);
  // Short label (surname, else display name) for the sub-pairing badges, resolved from the player union.
  const nameById = new Map(players.map((p) => [p.id, p.lastName ?? p.displayName]));
  // The "no-minute phantom" drop is enabled ONLY for a TERMINAL match (completed/abandoned) that also
  // has minute data. The bug this reconciles is the FEED over-marking `is_starter` on COMPLETED matches,
  // fixed here at READ time only. The terminal gate is essential: a LIVE match ingests minutes per-player
  // incrementally, so a genuine starter can momentarily have null minutes mid-match — without the gate the
  // first posted minute would flip the whole match into "drop" mode and collapse the live XI. Pre-kickoff
  // (no status, no minutes) and a terminal-but-no-minutes match both fall through to the sheet as-is. The
  // came-on removal / player_out add-back are event-driven and apply regardless, so a live pitch still
  // tracks substitutions.
  const matchIsTerminal = match.status === "completed" || match.status === "abandoned";
  const matchHasMinutes = stats.some((s) => s.minutesPlayed !== null && s.minutesPlayed > 0);
  const phantomDropEnabled = matchIsTerminal && matchHasMinutes;
  // Whether each SIDE has an official sheet at all (any `match_lineup_entry` row for a player on that
  // side). When present the sheet anchors the kickoff-XI cascade; a side with no sheet keeps the
  // appearance-inference fallback (graceful) and an empty pitch. Sides are independent.
  let homeHasSheet = false;
  let awayHasSheet = false;
  for (const p of players) {
    if (!lineupByPlayer.has(p.id)) continue;
    const s = sideOf(p, match.homeTeamId, match.awayTeamId);
    if (s === "home") homeHasSheet = true;
    else if (s === "away") awayHasSheet = true;
  }

  const homeLines: PlayerLine[] = [];
  const awayLines: PlayerLine[] = [];
  // Kickoff-XI candidate ids per side (is_starter sheet rows ∪ withdrawn player_outs) — used to report
  // the kept/removed split when a side's computed XI ≠ 11 (the safety net).
  const homeCandidates: string[] = [];
  const awayCandidates: string[] = [];
  let unplaced = 0; // resolved player, but team is neither side of the match

  for (const p of players) {
    const side = sideOf(p, match.homeTeamId, match.awayTeamId);
    if (side === null) {
      unplaced += 1;
      continue;
    }

    const stat = statByPlayer.get(p.id);
    const hasScore = scoreByPlayer.has(p.id);
    const facts = eventFactsFor(p.id, events);
    const appeared = stat !== undefined || hasScore || facts.named;
    const minutes = stat?.minutesPlayed ?? null;
    const isStarterEntry = lineupByPlayer.get(p.id);
    const sideHasSheet = side === "home" ? homeHasSheet : awayHasSheet;

    // A kickoff-XI candidate is an official starter OR anyone withdrawn (a player_out was on at kickoff,
    // even if the feed left him off the sheet — Croatia's re-added Modrić). The cascade then decides who
    // is actually kept on the pitch.
    const isCandidate = isStarterEntry === true || facts.wentOff;
    const onPitch = sideHasSheet && isCandidate && keptOnPitch(facts, minutes, phantomDropEnabled);
    if (sideHasSheet && isCandidate) {
      (side === "home" ? homeCandidates : awayCandidates).push(p.id);
    }

    const line: PlayerLine = {
      playerId: p.id,
      displayName: p.displayName,
      firstName: p.firstName,
      lastName: p.lastName,
      position: p.position,
      nation: p.nation,
      role: roleFor(onPitch, isStarterEntry, facts.cameOn, appeared, sideHasSheet),
      appeared,
      cameOnMinute: facts.cameOnMinute,
      wentOffMinute: facts.wentOffMinute,
      // Sub-pairing labels: who came on for him (when withdrawn) / who he replaced (when he came on).
      subbedOffForName: nameById.get(replacementOf.get(p.id) ?? "") ?? null,
      subbedOnForName: nameById.get(replacedOf.get(p.id) ?? "") ?? null,
      minutes,
      yellowCards: facts.yellowCards,
      redCard: facts.redCard,
      rating: resolveRating(ratingRowsByPlayer.get(p.id) ?? []),
      fantasyPoints: scoreByPlayer.get(p.id) ?? null,
      chips: chipsFor(p.position, stat),
      owner: ownerByPlayer[p.id] ?? null,
    };
    (side === "home" ? homeLines : awayLines).push(line);
  }

  const home = buildSide(match.homeTeamName, match.homeScore, homeLines, homeHasSheet);
  const away = buildSide(match.awayTeamName, match.awayScore, awayLines, awayHasSheet);
  // Safety net: surface (don't swallow) any side whose reconciled XI ≠ 11 so the loader can log it.
  const lineupAnomalies = [
    anomalyFor("home", match.homeTeamId, homeHasSheet, homeCandidates, home.pitch),
    anomalyFor("away", match.awayTeamId, awayHasSheet, awayCandidates, away.pitch),
  ].filter((a): a is LineupAnomaly => a !== null);

  // Events timeline (T16b): side + full names resolve off the SAME player union; the running score is
  // replayed via the shared engine goal/own-goal/VAR predicates (see buildEvents). Terminal score
  // reconciliation rides the SAME `matchIsTerminal` gate as the kickoff-XI phantom drop above.
  const sideById = new Map(
    players.map((p) => [p.id, sideOf(p, match.homeTeamId, match.awayTeamId)]),
  );
  const fullNameById = new Map(
    players.map((p) => [
      p.id,
      p.firstName && p.lastName ? `${p.firstName} ${p.lastName}` : p.displayName,
    ]),
  );
  const { events: timeline, anomaly: eventScoreAnomaly } = buildEvents(
    events,
    sideById,
    fullNameById,
    matchIsTerminal,
    match.homeScore,
    match.awayScore,
  );

  return {
    header: {
      matchId: match.matchId,
      status: match.status,
      kickoffIso: match.kickoffIso,
      kickoffLabel: kickoffLabelUtc(match.kickoffIso),
      matchdayLabel: match.periodLabel ?? match.round ?? null,
      periodKind: match.periodKind,
      hasFantasyOverlay: match.periodId !== null,
    },
    home,
    away,
    statistics: buildTeamStatistics(teamStats, match.homeTeamId, match.awayTeamId),
    standings: buildGroupStandings(standings, match.homeTeamId, match.awayTeamId),
    events: timeline,
    eventScoreAnomaly,
    empty: homeLines.length === 0 && awayLines.length === 0,
    periodId: match.periodId,
    unresolvedParticipants: unresolvedFromPool + unplaced,
    lineupAnomalies,
  };
}

/**
 * A side's reconciled kickoff XI must be 11. When it isn't (a feed contradiction the cascade can't
 * resolve), surface the mismatch rather than padding or silently dropping — the builder renders exactly
 * the kept set and the loader logs this (match_id / team_id / count / kept / removed). Only fires for a
 * side WITH a sheet (a no-sheet side has an empty pitch BY DESIGN, not an anomaly).
 */
function anomalyFor(
  side: "home" | "away",
  teamId: string | null,
  hasSheet: boolean,
  candidateIds: readonly string[],
  pitch: readonly PlayerLine[],
): LineupAnomaly | null {
  if (!hasSheet) return null;
  if (pitch.length === 11) return null;
  const keptSet = new Set(pitch.map((l) => l.playerId));
  return {
    side,
    teamId,
    count: pitch.length,
    keptPlayerIds: pitch.map((l) => l.playerId),
    removedPlayerIds: candidateIds.filter((id) => !keptSet.has(id)),
  };
}

/** Which side of the match a player belongs to, by team id. null = neither (unplaceable). */
function sideOf(
  p: GdPlayerInput,
  homeTeamId: string | null,
  awayTeamId: string | null,
): "home" | "away" | null {
  if (p.teamId === null) return null;
  if (homeTeamId !== null && p.teamId === homeTeamId) return "home";
  if (awayTeamId !== null && p.teamId === awayTeamId) return "away";
  return null;
}

function buildSide(
  teamName: string | null,
  score: number | null,
  lines: PlayerLine[],
  hasSheet: boolean,
): SquadSide {
  const starters = lines.filter((l) => l.role === "starter").sort(byPositionThenName);
  return {
    // Never surface a raw team UUID: an unjoined/unnamed team falls back to the shared constant.
    teamName: teamName ?? UNNAMED_OPPONENT,
    teamCode: teamName ?? null,
    score,
    starters,
    // PITCH = the reconciled kickoff XI, IDENTICAL to `starters` on a side with a sheet (`role: "starter"`
    // ⟺ on the kickoff pitch — see `keptOnPitch`). A side with no sheet has no formation to draw → empty
    // pitch (its lists still render via the appearance-inference fallback).
    pitch: hasSheet ? starters : [],
    subs: lines.filter((l) => l.role === "sub").sort(byEntryThenName),
    bench: lines.filter((l) => l.role === "bench").sort(byPositionThenName),
  };
}

// ─── team statistics (T17) ────────────────────────────────────────────────────────
//
// Display-only home-vs-away team aggregates for the Statistics tab. Sourced from the three typed
// stat_team_match columns (possession / offsides / shotsBlocked) + the retained `extra` jsonb
// (everything else the feed sent). NO scoring read — stat_team_match is feed→ingest→DB display data
// (grep-confirmed in ARCHITECTURE). Pure + deterministic; a metric the feed omits resolves to null
// (the UI renders "–"). Row order, labels and the neutral set mirror design/design_reference/match_detail.

/** Read a finite number from a team row's `extra` jsonb; null when the row, key, or value is absent. */
function teamExtraNum(row: GdTeamStatInput | undefined, key: string): number | null {
  if (row === undefined || row.extra === null) return null;
  const v = row.extra[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Percentage = numer/denom × 100, rounded; null when either side is missing or denom is 0. */
function statPct(numer: number | null, denom: number | null): number | null {
  if (numer === null || denom === null || denom === 0) return null;
  return Math.round((numer / denom) * 100);
}

/** Sum of two nullable values; null only when BOTH are null (a present 0 counts). */
function sumNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

type TeamStatKey =
  | "poss"
  | "xg"
  | "bigCh"
  | "shots"
  | "sot"
  | "blocked"
  | "woodwork"
  | "corners"
  | "offsides"
  | "passes"
  | "accPct"
  | "tackles"
  | "interc"
  | "clear"
  | "duelPct"
  | "saves"
  | "fouls"
  | "yellow";

interface TeamStatSpec {
  readonly label: string;
  readonly format: StatFormat;
  readonly neutral: boolean;
  readonly pick: (row: GdTeamStatInput | undefined) => number | null;
}

/** Per-key metadata + resolver. Accuracy/duels are derived percentages (own rate, like the design). */
const TEAM_STAT_SPECS: Record<TeamStatKey, TeamStatSpec> = {
  poss: {
    label: "Ball possession",
    format: "pct",
    neutral: false,
    pick: (r) => r?.possession ?? null,
  },
  xg: {
    label: "Expected goals (xG)",
    format: "dec",
    neutral: false,
    pick: (r) => teamExtraNum(r, "expected_goals"),
  },
  bigCh: {
    label: "Big chances",
    format: "int",
    neutral: false,
    pick: (r) => teamExtraNum(r, "big_chances"),
  },
  shots: {
    label: "Total shots",
    format: "int",
    neutral: false,
    pick: (r) => teamExtraNum(r, "shots_total"),
  },
  sot: {
    label: "Shots on target",
    format: "int",
    neutral: false,
    pick: (r) => teamExtraNum(r, "shots_on_target"),
  },
  blocked: {
    label: "Blocked shots",
    format: "int",
    neutral: false,
    pick: (r) => r?.shotsBlocked ?? null,
  },
  woodwork: {
    label: "Hit woodwork",
    format: "int",
    neutral: false,
    pick: (r) => teamExtraNum(r, "hit_woodwork"),
  },
  corners: {
    label: "Corner kicks",
    format: "int",
    neutral: false,
    pick: (r) => teamExtraNum(r, "corners"),
  },
  offsides: { label: "Offsides", format: "int", neutral: true, pick: (r) => r?.offsides ?? null },
  passes: {
    label: "Passes",
    format: "int",
    neutral: false,
    pick: (r) => teamExtraNum(r, "passes_total"),
  },
  accPct: {
    label: "Accurate passes",
    format: "pct",
    neutral: false,
    pick: (r) => statPct(teamExtraNum(r, "passes_accurate"), teamExtraNum(r, "passes_total")),
  },
  tackles: {
    label: "Tackles",
    format: "int",
    neutral: false,
    pick: (r) => teamExtraNum(r, "tackles"),
  },
  interc: {
    label: "Interceptions",
    format: "int",
    neutral: false,
    pick: (r) => teamExtraNum(r, "interceptions"),
  },
  clear: {
    label: "Clearances",
    format: "int",
    neutral: false,
    pick: (r) => teamExtraNum(r, "clearances"),
  },
  duelPct: {
    label: "Duels won",
    format: "pct",
    neutral: false,
    pick: (r) =>
      statPct(
        sumNullable(teamExtraNum(r, "ground_duels_won"), teamExtraNum(r, "aerial_duels_won")),
        sumNullable(teamExtraNum(r, "ground_duels_total"), teamExtraNum(r, "aerial_duels_total")),
      ),
  },
  saves: {
    label: "Goalkeeper saves",
    format: "int",
    neutral: true,
    pick: (r) => teamExtraNum(r, "saves"),
  },
  fouls: { label: "Fouls", format: "int", neutral: true, pick: (r) => teamExtraNum(r, "fouls") },
  yellow: {
    label: "Yellow cards",
    format: "int",
    neutral: true,
    pick: (r) => teamExtraNum(r, "yellow_cards"),
  },
};

/** Row groups, in design order. Overview (the first) has no title. */
const TEAM_STAT_GROUPS: readonly {
  readonly title: string | null;
  readonly keys: readonly TeamStatKey[];
}[] = [
  { title: null, keys: ["poss", "xg", "bigCh"] },
  { title: "Shots", keys: ["shots", "sot", "blocked", "woodwork"] },
  { title: "Attacking", keys: ["corners", "offsides"] },
  { title: "Passing", keys: ["passes", "accPct"] },
  { title: "Defending", keys: ["tackles", "interc", "clear", "duelPct", "saves"] },
  { title: "Discipline", keys: ["fouls", "yellow"] },
];

/**
 * Build the home-vs-away Statistics view-model. Returns null when neither side has a stat_team_match row
 * OR every resolved value is null (nothing to show) — the tab is hidden in that case.
 */
function buildTeamStatistics(
  teamStats: readonly GdTeamStatInput[],
  homeTeamId: string | null,
  awayTeamId: string | null,
): GameStatistics | null {
  const homeRow = homeTeamId === null ? undefined : teamStats.find((t) => t.teamId === homeTeamId);
  const awayRow = awayTeamId === null ? undefined : teamStats.find((t) => t.teamId === awayTeamId);
  if (homeRow === undefined && awayRow === undefined) return null;

  let anyValue = false;
  const groups: GameStatGroup[] = TEAM_STAT_GROUPS.map((g) => ({
    title: g.title,
    rows: g.keys.map((key): GameStatRow => {
      const spec = TEAM_STAT_SPECS[key];
      const home = spec.pick(homeRow);
      const away = spec.pick(awayRow);
      if (home !== null || away !== null) anyValue = true;
      return { key, label: spec.label, format: spec.format, neutral: spec.neutral, home, away };
    }),
  }));
  return anyValue ? { groups } : null;
}

/** Static footnotes for the Standings tab (T18). The tie-break list is FIFA's published group order. */
const STANDINGS_ADVANCE_NOTE = "Top 2 advance · 3rd may advance (best 8)";
const STANDINGS_TIEBREAK_NOTE =
  "Tie-breakers — head-to-head points · goal difference · goals scored · disciplinary · FIFA ranking.";

/**
 * Build the Standings tab view-model — the match's WC group table (T18). PURE.
 *
 * Returns null (tab HIDDEN, A1) when:
 *   - either side is null/TBD; OR
 *   - either in-match team has no `group_standing` row in `standings` (standings not ingested yet, or a
 *     knockout-stage team with no group); OR
 *   - the two in-match teams are NOT in the same group (`bdlGroupId` differs — e.g. a knockout fixture).
 *
 * Otherwise: keep only that single group's rows, sort by the feed's authoritative `position` ascending,
 * and flag each row `isQualifying` (top-2 cutline) + `inMatch` (one of the two teams in this match).
 */
function buildGroupStandings(
  standings: readonly GdStandingInput[],
  homeTeamId: string | null,
  awayTeamId: string | null,
): GameStandings | null {
  if (homeTeamId === null || awayTeamId === null) return null;
  const homeRow = standings.find((s) => s.teamId === homeTeamId);
  const awayRow = standings.find((s) => s.teamId === awayTeamId);
  if (homeRow === undefined || awayRow === undefined) return null;
  if (homeRow.bdlGroupId !== awayRow.bdlGroupId) return null;

  const groupId = homeRow.bdlGroupId;
  const inMatch = new Set([homeTeamId, awayTeamId]);
  const rows: GameStandingRow[] = standings
    .filter((s) => s.bdlGroupId === groupId)
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      teamId: s.teamId,
      teamName: s.teamName ?? UNNAMED_OPPONENT,
      position: s.position,
      played: s.played,
      won: s.won,
      drawn: s.drawn,
      lost: s.lost,
      goalsFor: s.goalsFor,
      goalsAgainst: s.goalsAgainst,
      goalDifference: s.goalDifference,
      points: s.points,
      isQualifying: s.position <= 2, // top-2 cutline
      inMatch: inMatch.has(s.teamId),
    }));

  return {
    groupName: homeRow.groupName,
    rows,
    advanceNote: STANDINGS_ADVANCE_NOTE,
    tiebreakNote: STANDINGS_TIEBREAK_NOTE,
  };
}
