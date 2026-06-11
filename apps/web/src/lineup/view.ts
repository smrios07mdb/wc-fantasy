/**
 * Pure presentation logic for the set-lineup screen — the formation/bench model + the live legality
 * feedback + the swap helpers. All of it is a pure function of the authoritative {@link SetLineupState}
 * and the injected clock, so the screen's behaviour is unit-tested here (Node, no DOM) exactly as the
 * draft room tests `countdown`/`reducer`. The legality check delegates to `@app/lineup`'s `validateLineup`
 * — the SAME function the server enforces — so the "save disabled + why" the manager sees is precisely
 * what the route will allow. The UI freeze is presentation; the server is the real latch.
 */
import { validateLineup, type SquadPlayer, type LineupValidation } from "@app/lineup";
import type { Position } from "@app/shared";
import type { LineupPlayer, PeriodLineup } from "./types";

export interface PitchSlot {
  player: LineupPlayer;
  /** False when the player is locked by play — the UI must NOT let him be dragged/swapped. */
  movable: boolean;
  kickoffAt: string | null;
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

/** One of a period's fixtures, reduced to what the per-player kickoff resolution needs. */
export interface PeriodMatch {
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** ISO kickoff instant. */
  kickoffAt: string;
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
    const slot: PitchSlot = {
      player: p,
      movable: isMovable(period, p.id),
      kickoffAt: period.kickoffByPlayer[p.id] ?? null,
    };
    if (starters.has(p.id)) {
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

/** Run the lock-respecting legality check for a proposed XI — the same one the server enforces. */
export function evaluateProposal(
  squad: readonly LineupPlayer[],
  period: PeriodLineup,
  starterIds: readonly string[],
  now: Date,
): LineupValidation {
  const squadPlayers: SquadPlayer[] = squad.map((p) => ({ playerId: p.id, position: p.position }));
  return validateLineup(
    squadPlayers,
    starterIds,
    period.locks,
    {
      id: period.periodId,
      status: period.status,
      closesAt: period.closesAt ? new Date(period.closesAt) : null,
    },
    now,
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

/** The seeded default formation for a manager who hasn't set this period yet (a legal 4-4-2). */
const DEFAULT_FORMATION: Record<Position, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };

/** A legal default XI for a 2/5/5/3 squad (1 GK + 4 DEF + 4 MID + 2 FWD), taking squad order. */
export function defaultStarterIds(squad: readonly LineupPlayer[]): string[] {
  const remaining: Record<Position, number> = { ...DEFAULT_FORMATION };
  const out: string[] = [];
  for (const p of squad) {
    if (remaining[p.position] > 0) {
      out.push(p.id);
      remaining[p.position] -= 1;
    }
  }
  return out;
}
