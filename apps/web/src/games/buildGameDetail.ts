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
 * Card classification mirrors recompute's (private) `classifyCard` EXACTLY — incident_type "card" with
 * incident_class red/yellow. Two-yellow→red banding is OUT OF SCOPE (it needs cross-row pairing at the
 * aggregation layer); rows are shown as classified (a 2nd booking is a second yellow, never auto-folded).
 */
import { UNNAMED_OPPONENT } from "@/src/lineup/view";
import type { Position } from "@app/shared";
import type {
  BuildGameDetailInput,
  GameDetailView,
  GdEventInput,
  GdPlayerInput,
  GdStatInput,
  PlayerLine,
  PlayerRole,
  SquadSide,
  StatChip,
} from "./types";

// ─── card classification (mirrors recompute/src/adapter.ts classifyCard) ──────────

/** Lowercase + strip non-alphanumerics — the same `norm()` the engine applies before matching. */
function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

type CardKind = "yellow" | "red";

function classifyCard(e: GdEventInput): CardKind | null {
  if (norm(e.incidentType) !== "card") return null;
  const cls = norm(e.incidentClass);
  if (cls === "red") return "red";
  if (cls === "yellow") return "yellow";
  return null;
}

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

// ─── per-player derivation ──────────────────────────────────────────────────────

interface EventFacts {
  yellowCards: number;
  redCard: boolean;
  cameOnMinute: number | null;
  wentOffMinute: number | null;
  named: boolean;
}

/** Fold one player's events into card counts + sub on/off minutes + a "named in any event" signal. */
function eventFactsFor(playerId: string, events: readonly GdEventInput[]): EventFacts {
  let yellowCards = 0;
  let redCard = false;
  let cameOnMinute: number | null = null;
  let wentOffMinute: number | null = null;
  let named = false;

  for (const e of events) {
    if (e.rescinded) continue;
    if (e.playerInId === playerId) {
      named = true;
      // Came on; minute may be unknown (the boolean `cameOn()` still flags the role from the event).
      if (e.minute !== null)
        cameOnMinute = cameOnMinute === null ? e.minute : Math.min(cameOnMinute, e.minute);
    }
    if (e.playerOutId === playerId) {
      named = true;
      if (e.minute !== null)
        wentOffMinute = wentOffMinute === null ? e.minute : Math.min(wentOffMinute, e.minute);
    }
    if (e.playerId === playerId) {
      named = true;
      const kind = classifyCard(e);
      if (kind === "yellow") yellowCards += 1;
      else if (kind === "red") redCard = true;
    }
  }
  return { yellowCards, redCard, cameOnMinute, wentOffMinute, named };
}

/** "Came on" is true whenever the player is the playerIn side of any non-rescinded event. */
function cameOn(playerId: string, events: readonly GdEventInput[]): boolean {
  return events.some((e) => !e.rescinded && e.playerInId === playerId);
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

function roleFor(
  isStarterEntry: boolean | undefined,
  didCameOn: boolean,
  appeared: boolean,
): PlayerRole {
  if (isStarterEntry === true) return "starter";
  if (isStarterEntry === false) return didCameOn ? "sub" : "bench";
  // No official-sheet entry: infer from match signals.
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

// ─── main export ─────────────────────────────────────────────────────────────────

export function buildGameDetail(input: BuildGameDetailInput): GameDetailView {
  const {
    match,
    players,
    stats,
    scores,
    lineupEntries,
    events,
    ownerByPlayer,
    unresolvedFromPool,
  } = input;

  const statByPlayer = new Map(stats.map((s) => [s.playerId, s]));
  const scoreByPlayer = new Map(scores.map((s) => [s.playerId, s.points]));
  const lineupByPlayer = new Map(lineupEntries.map((e) => [e.playerId, e.isStarter]));

  const homeLines: PlayerLine[] = [];
  const awayLines: PlayerLine[] = [];
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
    const didCameOn = cameOn(p.id, events);

    const line: PlayerLine = {
      playerId: p.id,
      displayName: p.displayName,
      firstName: p.firstName,
      lastName: p.lastName,
      position: p.position,
      nation: p.nation,
      role: roleFor(lineupByPlayer.get(p.id), didCameOn, appeared),
      appeared,
      cameOnMinute: facts.cameOnMinute,
      wentOffMinute: facts.wentOffMinute,
      minutes: stat?.minutesPlayed ?? null,
      yellowCards: facts.yellowCards,
      redCard: facts.redCard,
      fantasyPoints: scoreByPlayer.get(p.id) ?? null,
      chips: chipsFor(p.position, stat),
      owner: ownerByPlayer[p.id] ?? null,
    };
    (side === "home" ? homeLines : awayLines).push(line);
  }

  const home = buildSide(match.homeTeamName, match.homeScore, homeLines);
  const away = buildSide(match.awayTeamName, match.awayScore, awayLines);

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
    empty: homeLines.length === 0 && awayLines.length === 0,
    periodId: match.periodId,
    unresolvedParticipants: unresolvedFromPool + unplaced,
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

function buildSide(teamName: string | null, score: number | null, lines: PlayerLine[]): SquadSide {
  return {
    // Never surface a raw team UUID: an unjoined/unnamed team falls back to the shared constant.
    teamName: teamName ?? UNNAMED_OPPONENT,
    teamCode: teamName ?? null,
    score,
    starters: lines.filter((l) => l.role === "starter").sort(byPositionThenName),
    subs: lines.filter((l) => l.role === "sub").sort(byEntryThenName),
    bench: lines.filter((l) => l.role === "bench").sort(byPositionThenName),
  };
}
