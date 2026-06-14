/**
 * Pure presentation logic for the set-lineup screen — the formation/bench model + the live legality
 * feedback + the swap helpers. All of it is a pure function of the authoritative {@link SetLineupState}
 * and the injected clock, so the screen's behaviour is unit-tested here (Node, no DOM) exactly as the
 * draft room tests `countdown`/`reducer`. The legality check delegates to `@app/lineup`'s `validateLineup`
 * — the SAME function the server enforces — so the "save disabled + why" the manager sees is precisely
 * what the route will allow. The UI freeze is presentation; the server is the real latch.
 */
import {
  validateLineup,
  type SquadPlayer,
  type SlotState,
  type LineupValidation,
} from "@app/lineup";
import { POSITIONS, type Position } from "@app/shared";
import type { LineupPlayer, OpponentInfo, PeriodLineup, PeriodLock, StarterStatus } from "./types";

export interface PitchSlot {
  player: LineupPlayer;
  /** False when the player is locked by play — the UI must NOT let him be dragged/swapped. */
  movable: boolean;
  /** C2: the full forfeit-model classification for this slot (visual + interaction). */
  slotKind: SlotKind;
  /** C2: points earned this period — shown on played-starter tokens and in the forfeit confirm sheet.
   *  Zero for unplayed players or when the score row hasn't landed yet. */
  pointsAtStake: number;
  kickoffAt: string | null;
  /** Opponent fixture for this player's period: team name + nation (for flag) + home/away. Null when
   *  the player's team has no fixture this period or the opponent side is TBD (knockout not decided). */
  opponent: OpponentInfo | null;
  /** Pre-kickoff availability badge state ("starting" / "not_starting"), or null when the lineup hasn't
   *  been announced for his match yet (no badge). Resolved against the SAME fixture as kickoff/opponent. */
  starterStatus: StarterStatus | null;
}

export interface PitchView {
  /** Starters grouped by position (the UI renders lanes FWD→GK top-to-bottom). */
  lanes: Record<Position, PitchSlot[]>;
  bench: PitchSlot[];
  counts: Record<Position, number>;
  /** The outfield shape, e.g. "4-4-2" (the single GK is implied). */
  formationLabel: string;
}

/** Is this player still movable in the period? (Not locked by play.) */
export function isMovable(period: PeriodLineup, playerId: string): boolean {
  return !period.locks.some((l) => l.playerId === playerId);
}

/**
 * How a slot reads to the C2 forfeit UI — determines the visual state and which interactions apply.
 * The five kinds map the full intersection of lock state × play state × position (starter/bench):
 *
 *   movable        — unplayed, freely swappable
 *   played-starter — played, unvoided, in the XI: forfeit affordance (tappable; confirm required)
 *   played-bench   — played, unvoided, on bench: padlock; IN-direction blocked by the engine
 *   voided         — forfeit already stamped (one-way): Forfeited pill + strikethrough
 *   locked         — frozen-period or otherwise immovable for reasons outside the play state
 */
export type SlotKind = "movable" | "played-starter" | "played-bench" | "voided" | "locked";

/**
 * Classify a slot for C2 rendering: pure function of the authoritative period data + current role.
 * The `isStarter` parameter reflects the WORKING starter set (not necessarily the saved set), so
 * the classification is live during edits.
 */
export function classifySlot(period: PeriodLineup, playerId: string, isStarter: boolean): SlotKind {
  const meta = period.slotMeta[playerId];
  if (meta?.voided) return "voided";
  if (meta?.hasPlayed) {
    // Forfeit affordance: played starter, period not frozen, not yet voided.
    if (isStarter && meta.movable) return "played-starter";
    // Played starter in frozen period → fully locked; played bench → IN-direction blocked.
    return isStarter ? "locked" : "played-bench";
  }
  if (!isMovable(period, playerId)) return "locked";
  return "movable";
}

/**
 * The bench players eligible to FILL the XI slot vacated by a forfeit: unplayed + same position
 * group as the forfeited player (GK ↔ GK or outfield ↔ outfield, matching `canSwap`'s rule).
 * Used for two purposes: the pre-flight check (block confirm when count = 0) and the eligibles
 * highlight shown during the fill step after confirm.
 */
export function fillEligibleIds(
  period: PeriodLineup,
  squad: readonly LineupPlayer[],
  starterIds: readonly string[],
  forfeitPlayerId: string,
): Set<string> {
  const set = new Set<string>();
  const forfeitIsGK = squad.find((p) => p.id === forfeitPlayerId)?.position === "GK";
  for (const p of squad) {
    if (starterIds.includes(p.id)) continue; // must be a bench player
    if (period.locks.some((l) => l.playerId === p.id)) continue; // must be unplayed
    if ((p.position === "GK") !== forfeitIsGK) continue; // same side of the GK line
    set.add(p.id);
  }
  return set;
}

/** One of a period's fixtures, reduced to what the per-player kickoff + opponent resolution needs. */
export interface PeriodMatch {
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** ISO kickoff instant. */
  kickoffAt: string;
  /** Home team display name (fifa_team.name) — for the opponent label when the player is away. */
  homeTeamName?: string | null;
  /** Away team display name (fifa_team.name) — for the opponent label when the player is home. */
  awayTeamName?: string | null;
  /** This fixture's pre-kickoff official-lineup snapshot (the `match_lineup_entry` rows): playerId →
   *  is_starter. Absent/empty ⇒ the lineup hasn't been peeked yet (no entries) → players resolve to a
   *  null badge. A NON-empty map ⇒ the match was peeked, so a player absent from it resolves "not_starting". */
  starterByPlayer?: Record<string, boolean>;
}

/**
 * Earliest kickoff per team within a period's fixtures. A team can appear at most once in a knockout
 * round and once per group matchday, but if the data ever links a team to two fixtures in one period we
 * take the EARLIER kickoff — that is the binding lock/sub deadline. Null team ids (TBD knockout sides)
 * are skipped.
 */
export function kickoffByTeam(matches: readonly PeriodMatch[]): Map<string, string> {
  const byTeam = new Map<string, string>();
  for (const m of matches) {
    for (const teamId of [m.homeTeamId, m.awayTeamId]) {
      if (!teamId) continue;
      const existing = byTeam.get(teamId);
      if (existing === undefined || m.kickoffAt < existing) byTeam.set(teamId, m.kickoffAt);
    }
  }
  return byTeam;
}

/**
 * Resolve each squad player's fixture kickoff for the period being viewed: player.teamId → the period
 * fixture his team plays in → that match's kickoff (ISO). A player whose team isn't playing this period
 * (knockout TBD) or has no linked team resolves to `null` — the UI renders "TBD"/"—", never a crash.
 */
export function resolveKickoffByPlayer(
  squad: readonly { id: string; teamId: string | null }[],
  matches: readonly PeriodMatch[],
): Record<string, string | null> {
  const byTeam = kickoffByTeam(matches);
  const out: Record<string, string | null> = {};
  for (const p of squad) out[p.id] = (p.teamId && byTeam.get(p.teamId)) || null;
  return out;
}

/**
 * Resolve each squad player's opponent for the period being viewed: player.teamId → the period fixture
 * his team plays in → the OTHER side of that match. Uses the same earliest-kickoff tie-break as
 * `kickoffByTeam` so kickoff and opponent always reference the same match row and can never diverge.
 * Null when: the player has no teamId, his team has no fixture this period, or either side of his
 * fixture is TBD (knockout bracket not yet determined). The UI renders null as "TBD" (no flag).
 */
export function resolveOpponentByPlayer(
  squad: readonly { id: string; teamId: string | null }[],
  matches: readonly PeriodMatch[],
): Record<string, OpponentInfo | null> {
  const byTeam = new Map<string, { kickoffAt: string; info: OpponentInfo }>();
  for (const m of matches) {
    // If either side is TBD (null teamId), the opponent is unresolvable for both sides.
    if (!m.homeTeamId || !m.awayTeamId) continue;
    const homeEntry = {
      kickoffAt: m.kickoffAt,
      info: {
        opponentName: m.awayTeamName ?? m.awayTeamId,
        opponentNation: m.awayTeamName ?? null,
        isHome: true,
      } satisfies OpponentInfo,
    };
    const awayEntry = {
      kickoffAt: m.kickoffAt,
      info: {
        opponentName: m.homeTeamName ?? m.homeTeamId,
        opponentNation: m.homeTeamName ?? null,
        isHome: false,
      } satisfies OpponentInfo,
    };
    const existingHome = byTeam.get(m.homeTeamId);
    if (!existingHome || m.kickoffAt < existingHome.kickoffAt) byTeam.set(m.homeTeamId, homeEntry);
    const existingAway = byTeam.get(m.awayTeamId);
    if (!existingAway || m.kickoffAt < existingAway.kickoffAt) byTeam.set(m.awayTeamId, awayEntry);
  }
  const out: Record<string, OpponentInfo | null> = {};
  for (const p of squad) out[p.id] = (p.teamId && byTeam.get(p.teamId)?.info) || null;
  return out;
}

/**
 * Resolve each squad player's pre-kickoff availability for the period being viewed: player.teamId → the
 * period fixture his team plays in → that fixture's official-lineup snapshot (`starterByPlayer`). Uses
 * the SAME earliest-kickoff tie-break as `kickoffByTeam`, so kickoff, opponent, and starter-status always
 * reference the SAME `fifa_match` row and can never diverge. Returns, per player:
 *   - the resolved match has entries AND he is a starter (`is_starter:true`)        → "starting"
 *   - the resolved match has entries AND he is NOT (an `is_starter:false` row OR absent) → "not_starting"
 *   - no fixture for his team this period, or the match has NO entries (not announced)   → null (no badge)
 *
 * The "match has entries" signal is the non-emptiness of `starterByPlayer` — the peek only writes when the
 * sheet is up (≥1 entry), so a populated map ⇔ the lineup was announced. This makes the resolver robust
 * whether the feed lists the full squad or only the XI (an absent bench player still resolves
 * "not_starting" once the match has any entry).
 */
export function resolveStarterStatusByPlayer(
  squad: readonly { id: string; teamId: string | null }[],
  matches: readonly PeriodMatch[],
): Record<string, StarterStatus | null> {
  // Each team → its earliest-kickoff fixture this period, carrying THAT fixture's lineup snapshot (the
  // identical tie-break `kickoffByTeam` uses, so the row matches kickoff/opponent exactly).
  const byTeam = new Map<string, { kickoffAt: string; starterByPlayer: Record<string, boolean> }>();
  for (const m of matches) {
    const snapshot = m.starterByPlayer ?? {};
    for (const teamId of [m.homeTeamId, m.awayTeamId]) {
      if (!teamId) continue;
      const existing = byTeam.get(teamId);
      if (existing === undefined || m.kickoffAt < existing.kickoffAt) {
        byTeam.set(teamId, { kickoffAt: m.kickoffAt, starterByPlayer: snapshot });
      }
    }
  }
  const out: Record<string, StarterStatus | null> = {};
  for (const p of squad) {
    const match = p.teamId ? byTeam.get(p.teamId) : undefined;
    // No fixture, or the match has no entries yet (lineup not announced) → no badge.
    if (!match || Object.keys(match.starterByPlayer).length === 0) {
      out[p.id] = null;
      continue;
    }
    out[p.id] = match.starterByPlayer[p.id] === true ? "starting" : "not_starting";
  }
  return out;
}

export function positionOf(squad: readonly LineupPlayer[], playerId: string): Position | undefined {
  return squad.find((p) => p.id === playerId)?.position;
}

/** Build the formation lanes + bench for the period's saved XI, with per-player lock state. */
export function buildPitch(squad: readonly LineupPlayer[], period: PeriodLineup): PitchView {
  const starters = new Set(period.starterIds);
  const lanes: Record<Position, PitchSlot[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  const bench: PitchSlot[] = [];
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };

  for (const p of squad) {
    const inXI = starters.has(p.id);
    const slot: PitchSlot = {
      player: p,
      movable: isMovable(period, p.id),
      slotKind: classifySlot(period, p.id, inXI),
      pointsAtStake: period.slotMeta[p.id]?.pointsAtStake ?? 0,
      kickoffAt: period.kickoffByPlayer[p.id] ?? null,
      opponent: period.opponentByPlayer[p.id] ?? null,
      starterStatus: period.starterStatusByPlayer?.[p.id] ?? null,
    };
    if (inXI) {
      lanes[p.position].push(slot);
      counts[p.position] += 1;
    } else {
      bench.push(slot);
    }
  }

  return {
    lanes,
    bench,
    counts,
    formationLabel: `${counts.DEF}-${counts.MID}-${counts.FWD}`,
  };
}

/**
 * Run the legality check for a proposed XI — the same one the server enforces. C2 adds two wires:
 *  - `voided` is now sourced from `slotMeta` so an already-forfeited player can't be re-started;
 *  - `forfeitConfirmed` is threaded through so the Save button enables after the confirm sheet fires.
 * Both default to their safe C1 values when omitted so callers that haven't migrated yet still work.
 */
export function evaluateProposal(
  squad: readonly LineupPlayer[],
  period: PeriodLineup,
  starterIds: readonly string[],
  now: Date,
  forfeitConfirmed: ReadonlySet<string> = new Set(),
): LineupValidation {
  const squadPlayers: SquadPlayer[] = squad.map((p) => ({ playerId: p.id, position: p.position }));
  const slotStates: SlotState[] = period.locks.map((l) => ({
    playerId: l.playerId,
    isStarter: l.isStarter,
    hasPlayed: true, // a lock IS a played player
    voided: period.slotMeta[l.playerId]?.voided ?? false, // C2: pull voided from slotMeta
  }));
  return validateLineup(
    squadPlayers,
    starterIds,
    slotStates,
    {
      id: period.periodId,
      status: period.status,
      closesAt: period.closesAt ? new Date(period.closesAt) : null,
    },
    now,
    forfeitConfirmed,
  );
}

/**
 * Two players may swap their start/bench roles iff: both are movable, exactly one is currently a starter
 * (a real start↔bench swap, not a no-op), and they're on the same side of the GK line (GK↔GK or
 * outfield↔outfield). Keeping GK separate preserves the exactly-1-GK rule, while the outfield reshapes
 * freely (4-4-2 → 3-4-3 / 4-3-3 / 5-3-2 / …). An outfield reshape that breaks a Theme B bound is NOT
 * hidden here — it is surfaced by `evaluateProposal` as live "save disabled + why" (the server then
 * re-enforces it). So formation changes happen through swaps, with the validator as the legality gate.
 */
export function canSwap(
  period: PeriodLineup,
  squad: readonly LineupPlayer[],
  starterIds: readonly string[],
  aId: string,
  bId: string,
): boolean {
  if (aId === bId) return false;
  if (!isMovable(period, aId) || !isMovable(period, bId)) return false;
  if (starterIds.includes(aId) === starterIds.includes(bId)) return false; // need one starter + one bench
  return (positionOf(squad, aId) === "GK") === (positionOf(squad, bId) === "GK");
}

/** Replace `outId` (a current starter) with `inId` (a bench player) in the starter list. */
export function swapStarters(starterIds: readonly string[], outId: string, inId: string): string[] {
  return starterIds.map((id) => (id === outId ? inId : id));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Formation selection + roster-fillability filter (Prompt 44 cap-lift consequence; closes the carried
// FormationPicker/reshape TODO). The live model has no stored `formation` — it's emergent from the
// starter set — so these pure helpers map the discrete shape vocabulary onto `starterIds`. The
// validator (@app/lineup) stays the sole legality gate; nothing here writes or re-derives the bounds.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export type FormationCounts = Record<Position, number>;

/**
 * The curated group-stage formation vocabulary (DECISIONS.md → Theme B "standard set"; the design's
 * `modeConf().forms`). GK is always 1; the key is the outfield "DEF-MID-FWD" shape. Declaration order
 * is canonical — it drives the first-fillable default fall-through and the picker's left-to-right order.
 * The validator accepts any in-bounds XI; this is the discrete set the picker OFFERS, not a new bound.
 */
export const GROUP_FORMATIONS = {
  "3-4-3": { GK: 1, DEF: 3, MID: 4, FWD: 3 },
  "3-5-2": { GK: 1, DEF: 3, MID: 5, FWD: 2 },
  "4-3-3": { GK: 1, DEF: 4, MID: 3, FWD: 3 },
  "4-4-2": { GK: 1, DEF: 4, MID: 4, FWD: 2 },
  "4-5-1": { GK: 1, DEF: 4, MID: 5, FWD: 1 },
  "5-3-2": { GK: 1, DEF: 5, MID: 3, FWD: 2 },
  "5-4-1": { GK: 1, DEF: 5, MID: 4, FWD: 1 },
} as const satisfies Record<string, FormationCounts>;

export type FormationKey = keyof typeof GROUP_FORMATIONS;

/** The canonical group default (the design's `modeConf().def`) — used whenever the squad can field it. */
export const DEFAULT_FORMATION_KEY: FormationKey = "4-3-3";

/** Tally a squad by playing position — the roster supply each formation is checked against. */
export function rosterCounts(squad: readonly LineupPlayer[]): Record<Position, number> {
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of squad) counts[p.position] += 1;
  return counts;
}

/**
 * Can the squad SUPPLY this formation? True iff it owns >= the formation's count in every position
 * (GK >= 1 plus the three outfield lanes). This is the gap `validateLineup` does NOT cover: the
 * validator checks a *proposed XI* against the bounds, but never that the roster has the bodies to
 * build one — so a 3-DEF squad silently fell one short of a 4-DEF default and capped at 10 starters.
 */
export function formationFillable(
  counts: Record<Position, number>,
  formation: FormationCounts,
): boolean {
  return POSITIONS.every((pos) => counts[pos] >= formation[pos]);
}

/**
 * Is the formation reachable WITHOUT benching a locked (played) starter? The live mirror of the
 * design's `formationLegal`: a position whose count drops below the number of frozen starters there
 * would force a played man off the pitch — illegal. Derived purely from the lock latch (a played
 * starter is, by the latch, an `isStarter` lock), so it needs no current starter list.
 */
export function formationLockLegal(
  formation: FormationCounts,
  locks: readonly PeriodLock[],
  squad: readonly LineupPlayer[],
): boolean {
  const posOf = new Map(squad.map((p) => [p.id, p.position]));
  const lockedCounts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const lock of locks) {
    if (!lock.isStarter) continue;
    const pos = posOf.get(lock.playerId);
    if (pos) lockedCounts[pos] += 1;
  }
  return POSITIONS.every((pos) => formation[pos] >= lockedCounts[pos]);
}

/** The shapes the picker surfaces = fillable ∩ lock-legal, in canonical order. */
export function offeredFormations(
  squad: readonly LineupPlayer[],
  locks: readonly PeriodLock[],
): FormationKey[] {
  const counts = rosterCounts(squad);
  return (Object.keys(GROUP_FORMATIONS) as FormationKey[]).filter(
    (key) =>
      formationFillable(counts, GROUP_FORMATIONS[key]) &&
      formationLockLegal(GROUP_FORMATIONS[key], locks, squad),
  );
}

/** The current outfield shape ("DEF-MID-FWD") of a starter set — matches `buildPitch`'s formationLabel. */
export function formationKeyOf(
  squad: readonly LineupPlayer[],
  starterIds: readonly string[],
): string {
  const posOf = new Map(squad.map((p) => [p.id, p.position]));
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const id of starterIds) {
    const pos = posOf.get(id);
    if (pos) counts[pos] += 1;
  }
  return `${counts.DEF}-${counts.MID}-${counts.FWD}`;
}

/** First fillable formation, canonical 4-3-3 preferred, else the first fillable in canonical order. */
export function defaultFormationKey(counts: Record<Position, number>): FormationKey {
  if (formationFillable(counts, GROUP_FORMATIONS[DEFAULT_FORMATION_KEY]))
    return DEFAULT_FORMATION_KEY;
  return (
    (Object.keys(GROUP_FORMATIONS) as FormationKey[]).find((key) =>
      formationFillable(counts, GROUP_FORMATIONS[key]),
    ) ?? DEFAULT_FORMATION_KEY
  );
}

/**
 * Re-shape a starter set to a target formation, returning the new starter ids. Locked starters are
 * kept first (a played man can't be benched), then the remaining current starters, then MOVABLE
 * reserves are promoted to fill the shape — locked bench players are never promoted (no hindsight
 * upside, per lock-on-play). For a fillable ∩ lock-legal target this always yields a complete XI.
 */
export function reshapeToFormation(
  squad: readonly LineupPlayer[],
  starterIds: readonly string[],
  locks: readonly PeriodLock[],
  formation: FormationCounts,
): string[] {
  const starterSet = new Set(starterIds);
  const lockedSet = new Set(locks.map((l) => l.playerId));
  const byPos: Record<Position, LineupPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of squad) byPos[p.position].push(p);

  const next: string[] = [];
  for (const pos of POSITIONS) {
    const pool = byPos[pos];
    const lockedStarters = pool.filter((p) => starterSet.has(p.id) && lockedSet.has(p.id));
    const movableStarters = pool.filter((p) => starterSet.has(p.id) && !lockedSet.has(p.id));
    const movableBench = pool.filter((p) => !starterSet.has(p.id) && !lockedSet.has(p.id));
    const ordered = [...lockedStarters, ...movableStarters, ...movableBench];
    for (const p of ordered.slice(0, formation[pos])) next.push(p.id);
  }
  return next;
}

/**
 * The seeded starting XI for a manager who hasn't set this period yet: the first FILLABLE formation
 * (canonical 4-3-3 preferred), built in squad order. A 3-DEF squad opens on 3-4-3 — savable
 * immediately — instead of a blind 4-DEF default it can't fill (which capped it at 10 starters).
 */
export function defaultStarterIds(squad: readonly LineupPlayer[]): string[] {
  const key = defaultFormationKey(rosterCounts(squad));
  return reshapeToFormation(squad, [], [], GROUP_FORMATIONS[key]);
}
