/**
 * Pure presentational/derivation helpers for the /playoffs guillotine theater (Phase 4, ARCHITECTURE §21).
 *
 * The screen is a thin client over the server-computed `PlayoffsView` (@app/recompute `buildPlayoffsView`,
 * which owns ALL classification: past|live|future, the per-row safe|zone|eliminated state, the seeds). The
 * browser holds no playoff logic — these helpers only turn the ranked rows + the reused reduced lineup into
 * render inputs. No IO, no DOM, no clock.
 *
 * Two things are DERIVED here rather than read from a field:
 *   • The cut margin. The view exposes no `margin`/`gap`; it is the difference between the lowest survivor's
 *     points and the highest cut row's points, recoverable from the ranked rows already in the snapshot (the
 *     §4 "recomputable from rows" principle). The live boundary-tie (the whole tied set marked `zone`) is
 *     handled so the derivation never crashes and reads sensibly ("at the line", gap 0).
 *   • The reduced pitch. The viewer's live playoff XI is the loader-threaded `reducedLineup`
 *     (`SetLineupState` from the @app/lineup playoff-mode loader); we map its starters/bench + the
 *     server-composed lock (`locks` ∪ `slotMeta.hasPlayed`) and live points (`slotMeta.pointsAtStake`) onto
 *     the pitch — never a browser-direct `score_player_match` / `lineup_slot` read (Theme F).
 */
import type { RankedRow } from "@app/recompute";
import type { Position } from "@app/shared";
import type { LineupPlayer, SetLineupState } from "../lineup/types";

/** A manager's display name for a row: "You" for the viewer, the names map otherwise, "—" when unknown. */
export function meName(
  names: Readonly<Record<string, string>>,
  viewerId: string,
  managerId: string,
): string {
  if (managerId === viewerId) return "You";
  return names[managerId] ?? "—";
}

/**
 * The index in a points-descending ranked list where the guillotine line is drawn: the first row whose
 * state is NOT "safe". All-safe → `ranked.length` (no blade). Robust to the live unbroken boundary tie,
 * where the WHOLE tied set is marked `zone` — the line lands before the first tied row, never inside it.
 */
export function cutBoundaryIndex(ranked: readonly RankedRow[]): number {
  const i = ranked.findIndex((r) => r.state !== "safe");
  return i === -1 ? ranked.length : i;
}

export interface MyMargin {
  /** True when the viewer is currently surviving (state === "safe"). */
  safe: boolean;
  /** Points clear of the first cut (safe) or short of the last survivor (cut). May be 0 ("at the line"). */
  gap: number;
  /** The rival defining the margin: the first cut row (when safe) or the last survivor (when in the zone). */
  rivalId: string;
}

/**
 * The viewer's distance to the blade in the given round's ranked rows, or null when there is no live cut
 * (everyone safe) or the viewer is not in the round (eliminated earlier / not a participant). Rows are
 * points-descending, so the lowest survivor is the last `safe` row and the first cut is the highest
 * non-`safe` row — exactly the two managers either side of the line.
 */
export function myMargin(ranked: readonly RankedRow[], viewerId: string): MyMargin | null {
  const safe = ranked.filter((r) => r.state === "safe");
  const cut = ranked.filter((r) => r.state !== "safe");
  if (safe.length === 0 || cut.length === 0) return null;
  const lastSafe = safe[safe.length - 1]!;
  const firstCut = cut[0]!;
  const me = ranked.find((r) => r.managerId === viewerId);
  if (!me) return null;
  if (me.state === "safe")
    return { safe: true, gap: me.points - firstCut.points, rivalId: firstCut.managerId };
  return { safe: false, gap: lastSafe.points - me.points, rivalId: lastSafe.managerId };
}

/** A single token on the reduced pitch (a starter or a bench player). */
export interface PitchNode {
  id: string;
  /** First-initial + surname, e.g. "K. Mbappe" (display name fallback). */
  name: string;
  position: Position;
  /** Locked-on-play: in `locks` OR a `score_player_match` row exists (`slotMeta.hasPlayed`). */
  locked: boolean;
  /** Live points already earned this period (`slotMeta.pointsAtStake`); 0 when movable / unplayed. */
  points: number;
  /** fifa_team name → flag/kit resolution (the loader sets this from the team join, not player.country). */
  country: string | null;
}

export interface ReducedPitch {
  /** Starters grouped into FWD→MID→DEF→GK lanes (empty lanes dropped). */
  lanes: { pos: Position; nodes: PitchNode[] }[];
  /** The squad players not in the starting set. */
  bench: PitchNode[];
  /** Starter count, and the movable/locked split over the starters (for the lock strip). */
  starters: number;
  locked: number;
  movable: number;
}

/** Lane order top→bottom on the pitch (attack first), mirroring the design + Set Lineup. */
const PITCH_LANES: readonly Position[] = ["FWD", "MID", "DEF", "GK"];

function nodeName(p: LineupPlayer): string {
  const surname = p.lastName ?? p.displayName;
  return p.firstName ? `${p.firstName[0]}. ${surname}` : surname;
}

/**
 * Map the viewer's reduced playoff XI (`SetLineupState`, threaded by `loadPlayoffs` from the @app/lineup
 * playoff-mode loader) onto the pitch model. Picks the active knockout-round period (else the first
 * knockout period); null when there is no reduced lineup or no knockout window. Lock + points are read
 * straight from the server-composed snapshot — never a browser-direct read.
 */
export function buildReducedPitch(state: SetLineupState | null): ReducedPitch | null {
  if (!state) return null;
  const period =
    state.periods.find((p) => p.periodId === state.activePeriodId && p.kind === "knockout_round") ??
    state.periods.find((p) => p.kind === "knockout_round") ??
    null;
  if (!period) return null;

  const squadById = new Map(state.squad.map((p) => [p.id, p] as const));
  const lockedIds = new Set(period.locks.map((l) => l.playerId));
  const toNode = (id: string): PitchNode | null => {
    const p = squadById.get(id);
    if (!p) return null;
    const meta = period.slotMeta[id];
    return {
      id,
      name: nodeName(p),
      position: p.position,
      locked: lockedIds.has(id) || (meta?.hasPlayed ?? false),
      points: meta?.pointsAtStake ?? 0,
      country: p.country,
    };
  };

  const starterSet = new Set(period.starterIds);
  const starters = period.starterIds.map(toNode).filter((n): n is PitchNode => n !== null);
  const bench = state.squad
    .filter((p) => !starterSet.has(p.id))
    .map((p) => toNode(p.id))
    .filter((n): n is PitchNode => n !== null);

  const lanes = PITCH_LANES.map((pos) => ({
    pos,
    nodes: starters.filter((n) => n.position === pos),
  })).filter((l) => l.nodes.length > 0);

  const locked = starters.filter((n) => n.locked).length;
  return { lanes, bench, starters: starters.length, locked, movable: starters.length - locked };
}
