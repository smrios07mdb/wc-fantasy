/**
 * Pure knockout ("The Cut") view-model projection — T15-CUT.
 *
 * `/vsfield` becomes the ONE knockout surface (design_reference/the_cut_knockout, Shape B hybrid):
 * the live all-play-all field keeps everything it has and gains the guillotine framing (marquee,
 * YOU band with margin-to-the-blade, cut line + ON THE BLOCK zone, "the fallen", the cutting
 * ceremony). This module derives ALL of that as a pure projection of two EXISTING view-models:
 *
 *   • `buildPlayoffsView` (@app/recompute, byte-untouched) — the authoritative ladder. The
 *     provisional zone comes from its live round (`ranked[].state === "zone"`), i.e. from the SAME
 *     `resolveRoundCut` the commissioner apply path calls — the displayed blade can never drift
 *     from the eventual cut, and an unbroken boundary tie shows the WHOLE tied set (ARCH §21).
 *     This projection NEVER re-derives the cut ("lowest N by round score" would be wrong on ties).
 *   • the PRE-filter `buildVsField` field (@app/vsfield, byte-untouched) — names/isMe/live counts.
 *     `filterEliminatedFromField` (§27) stays byte-identical for the alive ladder; the fallen are
 *     an ADDITIVE sibling composed here, resolving the old hides-vs-shows conflict as "one ladder,
 *     two sections".
 *
 * IO-free and clockless (the `pend` signal — round over, results not official — is threaded in by
 * the loader as `allMatchesCompleted`); unit-tested against the REAL `buildPlayoffsView` output in
 * `knockout.test.ts`. Group phase: the loader composes NO ko sibling at all (see the gate in
 * `loadVsField`); `buildKnockoutContext` also returns null defensively when the ladder is absent.
 */
import type { PlayoffsViewCore, RankedRow } from "@app/recompute";

/** The blade position in the DISPLAYED ladder = entrants − cutCount (count-based, order-stable). */
export function cutLineIndex(aliveCount: number, cutCount: number): number {
  return Math.max(1, aliveCount - cutCount);
}

/** Long display names for the canonical KNOCKOUT_ROUNDS labels (presentation only). */
const ROUND_NAMES: Record<string, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  Final: "The Final",
};
export function knockoutRoundName(label: string): string {
  return ROUND_NAMES[label] ?? label;
}

/** The minimal per-manager identity slice the projection needs from the PRE-filter vsfield field. */
export interface KnockoutFieldIdentity {
  managerId: string;
  displayName: string;
  isMe: boolean;
  /** Starters still to play (yet-to-play + no-match), for the block variant's "N to play" line. */
  stillToCome: number;
}

/** One fallen (eliminated) manager — struck below the ladder, still tappable (T11 lookup). */
export interface KnockoutFallen {
  managerId: string;
  displayName: string;
  isMe: boolean;
  /** Cut-round ladder label ("R32"…"Final"), or null = out in the group stage (no playoff_entry). */
  roundLabel: string | null;
  /** Ladder idx of the cut round; −1 for group-stage outs (they sort last). */
  roundIdx: number;
  /** Round score at the cut (that past round's ranked points); null for group-stage outs. */
  points: number | null;
}

/** The most recent SETTLED round — the cutting ceremony's content (client latch decides WHEN). */
export interface KnockoutSettled {
  roundLabel: string;
  cutCount: number;
  /** Survivor count after this round's cut. */
  aliveAfter: number;
  victims: { managerId: string; displayName: string; isMe: boolean; points: number }[];
  viewerOutcome: "survived" | "out" | "spectator";
  /** The viewer's rank in that round (null when spectating). */
  viewerRank: number | null;
  /** Entrants of that round (the "of N" for the verdict line). */
  viewerOf: number;
  /** Points clear of the top victim at settle (survived only). */
  viewerMargin: number | null;
}

export type KnockoutViewerState = "safe" | "block" | "pend" | "out" | "champion";

export interface KnockoutViewer {
  state: KnockoutViewerState;
  /** Rank among the current round's entrants (null when out / not a participant). */
  rank: number | null;
  /** Entrants of the current round (the "of N"). */
  of: number;
  /** The viewer's current-round points (null when out). */
  points: number | null;
  /** Signed points to the blade (reference math; null when out or no boundary). */
  margin: number | null;
  /** margin === 0 → "level — tiebreak applies". */
  marginLevel: boolean;
  /** Starters still to play (block variant's "N to play"); null when out. */
  stillToCome: number | null;
  /** For `out`: the round the viewer fell in (null = group stage). */
  outRoundLabel: string | null;
  /** Complete-arm overall placement (entry-holders only; null otherwise). */
  placement: { rank: number; of: number } | null;
}

export interface KnockoutContext {
  /** The current (live, or last once complete) round. */
  roundLabel: string;
  roundName: string;
  roundIdx: number;
  totalRounds: number;
  cutCount: number;
  /** Entrants of the current round. */
  aliveCount: number;
  /** Schedule survivors of the current round (aliveCount − cutCount, clamped). */
  advanceCount: number;
  /** Round locked at full time, order provisional through the corrections window. */
  pend: boolean;
  complete: boolean;
  champion: { managerId: string; displayName: string; isMe: boolean } | null;
  /**
   * The current round's entrants in the AUTHORITATIVE order (points desc → seed asc → id), with
   * identity + round points carried so the client can render a ladder row even when the live-filtered
   * vsfield field lacks the manager (the complete-arm medal rows: the Final's cuts are eliminated).
   * The client PREFERS the joined `FieldEntry` (live counts, W/L-vs-you) when present.
   */
  ladder: { managerId: string; displayName: string; isMe: boolean; points: number; rank: number }[];
  /** Where the cut line inserts in `ladderOrder` (count-based — see cutLineIndex). */
  cutIndex: number;
  /** The provisional facing-the-blade set (tie-widened on a boundary tie; actual cut when past). */
  zoneIds: string[];
  viewer: KnockoutViewer;
  /** Ordered most-recent cut round first; group-stage outs last. */
  fallen: KnockoutFallen[];
  /** The most recent settled round (ceremony content), or null before the first cut. */
  settled: KnockoutSettled | null;
  /** Per-round statuses (idx-stable) — the client's ceremony transition latch input. */
  roundStatuses: ("past" | "live" | "future")[];
}

export interface BuildKnockoutContextInput {
  /** The pure playoffs core (`buildPlayoffsView` output) — byte-untouched upstream. */
  core: PlayoffsViewCore;
  viewerManagerId: string;
  /** PRE-filter vsfield field identities (every league manager, eliminated included). */
  field: KnockoutFieldIdentity[];
  /** Every displayed-period match is `completed` (the loader's clockless pend signal). */
  allMatchesCompleted: boolean;
}

/** Reference margin math: safe → me − first-on-the-block; block → me − last-safe (negative). */
function bladeMargin(
  ranked: readonly RankedRow[],
  meRank: number,
  cutIndex: number,
): number | null {
  const me = ranked[meRank - 1];
  if (!me) return null;
  const boundary = meRank - 1 >= cutIndex ? ranked[cutIndex - 1] : ranked[cutIndex];
  if (!boundary) return null;
  return me.points - boundary.points;
}

export function buildKnockoutContext(input: BuildKnockoutContextInput): KnockoutContext | null {
  const { core, viewerManagerId, field, allMatchesCompleted } = input;
  if (core.totalRounds === 0) return null;
  const current = core.rounds[core.currentRoundIdx];
  if (!current || !current.ranked) return null; // pre-live ladder (all-future) — no knockout surface yet

  const identity = new Map(field.map((f) => [f.managerId, f] as const));
  const nameOf = (id: string): string => identity.get(id)?.displayName ?? id;
  const isMe = (id: string): boolean => identity.get(id)?.isMe ?? id === viewerManagerId;

  const cutCount = current.cutCount;
  const aliveCount = current.fieldCount;
  const cutIndex = cutLineIndex(aliveCount, cutCount);
  const zoneIds = current.eliminatedIds ?? [];
  const zoneSet = new Set(zoneIds);
  const ladder = current.ranked.map((r) => ({
    managerId: r.managerId,
    displayName: nameOf(r.managerId),
    isMe: isMe(r.managerId),
    points: r.points,
    rank: r.rank,
  }));
  const pend = allMatchesCompleted && current.status === "live" && !core.complete;

  const champion =
    core.champion !== null
      ? { managerId: core.champion, displayName: nameOf(core.champion), isMe: isMe(core.champion) }
      : null;

  // ── the fallen: everyone cut BEFORE the current round (+ group-stage non-participants). When the
  // tournament is complete the LAST round's cuts stay in the ladder (medal/rtag rows, mock state e),
  // so the fallen still exclude the current (= last) round's eliminatedIds in every arm.
  const participantIds = new Set(core.seeds.map((s) => s.managerId));
  const pointsAtCut = new Map<string, number>();
  const cutRoundOf = new Map<string, { label: string; idx: number }>();
  for (const round of core.rounds) {
    if (round.status !== "past" || round.idx === current.idx || !round.ranked) continue;
    const cut = new Set(round.eliminatedIds ?? []);
    for (const row of round.ranked) {
      if (!cut.has(row.managerId)) continue;
      cutRoundOf.set(row.managerId, { label: round.round, idx: round.idx });
      pointsAtCut.set(row.managerId, row.points);
    }
  }
  const fallen: KnockoutFallen[] = [];
  for (const f of field) {
    const cut = cutRoundOf.get(f.managerId);
    if (cut) {
      fallen.push({
        managerId: f.managerId,
        displayName: f.displayName,
        isMe: f.isMe,
        roundLabel: cut.label,
        roundIdx: cut.idx,
        points: pointsAtCut.get(f.managerId) ?? null,
      });
    } else if (!participantIds.has(f.managerId)) {
      // No playoff_entry row = a group-phase non-advancer (§27's data-existence contract).
      fallen.push({
        managerId: f.managerId,
        displayName: f.displayName,
        isMe: f.isMe,
        roundLabel: null,
        roundIdx: -1,
        points: null,
      });
    }
  }
  fallen.sort(
    (a, b) =>
      b.roundIdx - a.roundIdx ||
      (b.points ?? -1) - (a.points ?? -1) ||
      a.displayName.localeCompare(b.displayName),
  );

  // ── the most recent settled round (ceremony content) ──
  let settled: KnockoutSettled | null = null;
  for (let i = core.rounds.length - 1; i >= 0; i--) {
    const round = core.rounds[i];
    if (!round || round.status !== "past" || !round.ranked) continue;
    const cutSet = new Set(round.eliminatedIds ?? []);
    const victims = round.ranked
      .filter((r) => cutSet.has(r.managerId))
      .map((r) => ({
        managerId: r.managerId,
        displayName: nameOf(r.managerId),
        isMe: isMe(r.managerId),
        points: r.points,
      }));
    const meRow = round.ranked.find((r) => r.managerId === viewerManagerId) ?? null;
    const topVictim = victims.length ? Math.max(...victims.map((v) => v.points)) : null;
    const outcome: KnockoutSettled["viewerOutcome"] = !meRow
      ? "spectator"
      : cutSet.has(viewerManagerId)
        ? "out"
        : "survived";
    settled = {
      roundLabel: round.round,
      cutCount: round.cutCount,
      aliveAfter: round.ranked.length - victims.length,
      victims,
      viewerOutcome: outcome,
      viewerRank: meRow?.rank ?? null,
      viewerOf: round.ranked.length,
      viewerMargin:
        outcome === "survived" && meRow && topVictim !== null ? meRow.points - topVictim : null,
    };
    break;
  }

  // ── the viewer ──
  const meRow = current.ranked.find((r) => r.managerId === viewerManagerId) ?? null;
  const meIdentity = identity.get(viewerManagerId) ?? null;
  let viewer: KnockoutViewer;
  if (champion?.isMe && core.complete) {
    viewer = {
      state: "champion",
      rank: meRow?.rank ?? 1,
      of: aliveCount,
      points: meRow?.points ?? null,
      margin: null,
      marginLevel: false,
      stillToCome: null,
      outRoundLabel: null,
      placement: { rank: 1, of: field.length },
    };
  } else if (meRow) {
    const margin = bladeMargin(current.ranked, meRow.rank, cutIndex);
    const inZone = zoneSet.has(viewerManagerId);
    viewer = {
      // pend + zone stays the BLOCK treatment (danger — you are provisionally cut); pend + safe is
      // the ytp "provisionally safe" variant. Never color alone; the client adds icon + words.
      state: inZone ? "block" : pend ? "pend" : "safe",
      rank: meRow.rank,
      of: aliveCount,
      points: meRow.points,
      margin,
      marginLevel: margin === 0,
      stillToCome: meIdentity?.stillToCome ?? null,
      outRoundLabel: null,
      placement: null,
    };
  } else {
    // Out: cut in an earlier round, or a group-stage non-advancer (roundLabel null).
    const mine = fallen.find((f) => f.managerId === viewerManagerId) ?? null;
    viewer = {
      state: "out",
      rank: null,
      of: aliveCount,
      points: null,
      margin: null,
      marginLevel: false,
      stillToCome: null,
      outRoundLabel: mine?.roundLabel ?? null,
      placement: core.complete ? placementOf(core, viewerManagerId, field.length) : null,
    };
  }

  return {
    roundLabel: current.round,
    roundName: knockoutRoundName(current.round),
    roundIdx: current.idx,
    totalRounds: core.totalRounds,
    cutCount,
    aliveCount,
    advanceCount: current.survives,
    pend,
    complete: core.complete,
    champion,
    ladder,
    cutIndex,
    zoneIds,
    viewer,
    fallen,
    settled,
    roundStatuses: core.rounds.map((r) => r.status),
  };
}

/**
 * Complete-arm overall placement (mock state e: "Placement = round survived, then pts"): champion
 * first, then by cut round DESC, then by that round's score DESC. Entry-holders only — a group-stage
 * non-advancer has no ladder placement (the caller renders wording without an ordinal).
 */
function placementOf(
  core: PlayoffsViewCore,
  managerId: string,
  totalManagers: number,
): { rank: number; of: number } | null {
  if (!core.seeds.some((s) => s.managerId === managerId)) return null;
  const order: { managerId: string; roundIdx: number; points: number }[] = [];
  for (const round of core.rounds) {
    if (!round.ranked) continue;
    const cutSet = new Set(round.eliminatedIds ?? []);
    for (const row of round.ranked) {
      if (cutSet.has(row.managerId))
        order.push({ managerId: row.managerId, roundIdx: round.idx, points: row.points });
    }
  }
  order.sort((a, b) => b.roundIdx - a.roundIdx || b.points - a.points);
  const ranked = [
    ...(core.champion ? [core.champion] : []),
    ...order.map((o) => o.managerId).filter((id) => id !== core.champion),
  ];
  const idx = ranked.indexOf(managerId);
  return idx === -1 ? null : { rank: idx + 1, of: totalManagers };
}
