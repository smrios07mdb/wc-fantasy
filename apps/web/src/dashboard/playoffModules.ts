/**
 * Pure module-data derivations for the dashboard's KNOCKOUT phases (playoff + complete). IO-free,
 * unit-tested. The dashboard's server modules (Dashboard.tsx) render these shapes; everything is
 * sourced READ-ONLY from `PlayoffsView` (loadPlayoffs) — `@app/recompute` is byte-untouched and no
 * field is invented. A figure the read-model does not expose (e.g. cumulative title points) is NOT
 * derived here; it is flagged at the recap site (see TODO(confirm) in Dashboard.tsx).
 *
 * These helpers take the minimal slices of `PlayoffsView` they need (each input interface is a subset
 * of `PlayoffsView`, so the component passes the whole view) and stay name-free EXCEPT the podium,
 * which resolves names via the loader-attached `managerNames` map (Theme F — the browser never reads
 * `manager`). They key everything by managerId otherwise.
 */
import type { RankedRow, RankedState, PlayoffRoundView } from "@app/recompute";

// ─── survival (playoff arm — the live guillotine round) ─────────────────────────────────────

export interface SurvivalInput {
  readonly managerId: string;
  readonly rounds: readonly PlayoffRoundView[];
  readonly currentRoundIdx: number;
  readonly me: RankedRow | null;
  readonly aliveNow: number;
  readonly survivesNow: number;
}

export interface SurvivalRow {
  readonly managerId: string;
  readonly seed: number;
  readonly points: number;
  readonly rank: number;
  readonly state: RankedState;
  readonly isMe: boolean;
}

export interface SurvivalView {
  readonly roundLabel: string | null;
  readonly status: PlayoffRoundView["status"] | "none";
  readonly rows: readonly SurvivalRow[];
  readonly aliveNow: number;
  readonly survivesNow: number;
  readonly cutCount: number;
  /** Provisional count facing the blade this round (live: the zone; past: the actual cut). */
  readonly zoneCount: number;
  /** True only when the viewer holds a row in this round (i.e. still alive). */
  readonly meSafe: boolean | null;
  /**
   * Signed cut margin in points, or null when underivable (no boundary row / viewer not in the round):
   *   me safe  → me.points − (first cut row's points)   ≥ 0  "this many clear of the blade"
   *   me zone  → me.points − (last safe row's points)    ≤ 0  "this many short of safety"
   */
  readonly marginPoints: number | null;
}

/**
 * The live-round survival summary the BracketModule renders: the current round's rank-ordered field
 * with each row's safe/zone state (authoritative, straight from `PlayoffsView.rounds[].ranked`), the
 * viewer marked, and the viewer's signed margin to the guillotine line. Robust to a live boundary tie
 * (where the provisional zone is the whole tied set): safe/zone come per-row from `state`, never from
 * indexing by `survivesNow`.
 */
export function selectSurvivalView(input: SurvivalInput): SurvivalView {
  const { managerId, rounds, currentRoundIdx, me, aliveNow, survivesNow } = input;
  const current = rounds[currentRoundIdx];

  if (!current || !current.ranked) {
    return {
      roundLabel: current?.round ?? null,
      status: current?.status ?? "none",
      rows: [],
      aliveNow,
      survivesNow,
      cutCount: current?.cutCount ?? 0,
      zoneCount: 0,
      meSafe: null,
      marginPoints: null,
    };
  }

  const ranked = current.ranked; // already rank-ordered
  const rows: SurvivalRow[] = ranked.map((r) => ({
    managerId: r.managerId,
    seed: r.seed,
    points: r.points,
    rank: r.rank,
    state: r.state,
    isMe: r.managerId === managerId,
  }));

  // Boundary between the last surviving row and the first cut row — read from per-row state so a
  // live boundary tie (whole tied set shown as zone) doesn't skew the margin.
  const firstCut = ranked.find((r) => r.state !== "safe") ?? null;
  const lastSafe = [...ranked].reverse().find((r) => r.state === "safe") ?? null;

  let marginPoints: number | null = null;
  let meSafe: boolean | null = null;
  if (me) {
    meSafe = me.state === "safe";
    if (meSafe) {
      marginPoints = firstCut ? me.points - firstCut.points : null;
    } else {
      marginPoints = lastSafe ? me.points - lastSafe.points : null;
    }
  }

  return {
    roundLabel: current.round,
    status: current.status,
    rows,
    aliveNow,
    survivesNow,
    cutCount: current.cutCount,
    zoneCount: current.eliminatedIds?.length ?? rows.filter((r) => r.state !== "safe").length,
    meSafe,
    marginPoints,
  };
}

// ─── champion podium (complete arm) ─────────────────────────────────────────────────────────

export interface PodiumInput {
  readonly managerId: string;
  readonly champion: string | null;
  readonly totalRounds: number;
  readonly rounds: readonly PlayoffRoundView[];
  readonly managerNames: Record<string, string>;
}

export interface PodiumEntry {
  readonly managerId: string;
  readonly name: string;
  readonly isMe: boolean;
}

export interface ChampionPodium {
  readonly champion: PodiumEntry | null;
  /** The manager cut in the Final round (a guillotine "final" has 2 entrants → 1 champion + 1 cut). */
  readonly runnerUp: PodiumEntry | null;
}

/**
 * Champion + runner-up for the complete arm's podium, with names resolved from `managerNames`. The
 * runner-up is whoever was cut in the Final round (`rounds[last].eliminatedIds[0]`). NOTE: this is the
 * PlayoffsView-faithful podium — it carries NO cumulative title points (the read-model does not expose
 * them; flagged for a separate read-model pass). Returns nulls when there is no champion yet.
 */
export function selectChampionPodium(input: PodiumInput): ChampionPodium {
  const { managerId, champion, totalRounds, rounds, managerNames } = input;
  if (!champion) return { champion: null, runnerUp: null };

  const nameOf = (id: string): string => managerNames[id] ?? id;
  const finalRound = totalRounds > 0 ? rounds[totalRounds - 1] : undefined;
  const runnerUpId = finalRound?.eliminatedIds?.[0] ?? null;

  return {
    champion: { managerId: champion, name: nameOf(champion), isMe: champion === managerId },
    runnerUp: runnerUpId
      ? { managerId: runnerUpId, name: nameOf(runnerUpId), isMe: runnerUpId === managerId }
      : null,
  };
}

// ─── viewer finish (complete arm) ───────────────────────────────────────────────────────────

export interface ViewerFinishInput {
  readonly managerId: string;
  readonly champion: string | null;
  readonly totalRounds: number;
  readonly rounds: readonly PlayoffRoundView[];
  readonly seedOf: Record<string, number>;
}

export interface ViewerFinish {
  readonly outcome: "champion" | "runner-up" | "eliminated" | "unknown";
  readonly seed: number | null;
  /** The round in which the viewer's run ended (the Final for the champion), or null when unknown. */
  readonly roundLabel: string | null;
  readonly rank: number | null;
  readonly points: number | null;
}

/**
 * The viewer's KNOCKOUT finish for the complete arm's "Your run" module — derived purely from the
 * ladder: champion, runner-up (cut in the Final), or eliminated in round X (+ that round's rank/points).
 * "unknown" only when the viewer is neither champion nor found in any round's `eliminatedIds` (e.g. a
 * non-participant). The viewer's SEASON stats (power record, total title pts, best week) are a
 * read-model gap and intentionally NOT derived here.
 */
export function selectViewerFinish(input: ViewerFinishInput): ViewerFinish {
  const { managerId, champion, totalRounds, rounds, seedOf } = input;
  const seed = seedOf[managerId] ?? null;

  // Champion short-circuit (load-bearing — do NOT drop in a future simplify): the champion appears in
  // no round's eliminatedIds, so without this branch the scan below would fall through to "unknown".
  // It also reads the Final round's rank/points for the champion's finish row.
  if (champion === managerId) {
    const finalRound = totalRounds > 0 ? rounds[totalRounds - 1] : undefined;
    const row = finalRound?.ranked?.find((r) => r.managerId === managerId) ?? null;
    return {
      outcome: "champion",
      seed,
      roundLabel: finalRound?.round ?? null,
      rank: row?.rank ?? null,
      points: row?.points ?? null,
    };
  }

  const elimIdx = rounds.findIndex((r) => r.eliminatedIds?.includes(managerId) ?? false);
  if (elimIdx >= 0) {
    const round = rounds[elimIdx]!;
    const row = round.ranked?.find((r) => r.managerId === managerId) ?? null;
    return {
      outcome: elimIdx === totalRounds - 1 ? "runner-up" : "eliminated",
      seed,
      roundLabel: round.round,
      rank: row?.rank ?? null,
      points: row?.points ?? null,
    };
  }

  return { outcome: "unknown", seed, roundLabel: null, rank: null, points: null };
}
