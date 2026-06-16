/**
 * Playoff READ-side view-model assembly — PURE (DECISIONS.md → Theme C; ARCHITECTURE.md §21).
 *
 * The mirror image of the write-side glue {@link ./playoffRound resolveRoundCut}: where that resolves a
 * round's cut for APPLICATION, this assembles the §21 `loadPlayoffs` view-model for DISPLAY. Both are pure
 * and both sit ABOVE the (untouched) cut selector — this one assembles the whole guillotine ladder:
 *
 *   • `past`   — a round already cut (a `playoff_entry.eliminated_round` mark exists). Each row's
 *                safe/eliminated state is read STRAIGHT from `playoff_entry` (authoritative), never
 *                re-derived from the round score; the rank is display-order only.
 *   • `live`   — the first uncut round the field has reached. The provisional "facing-the-blade" zone is
 *                computed by {@link resolveRoundCut} — the SAME pure decision the apply orchestrator
 *                (`apps/worker/.../advance.runRoundAdvance`) calls — so the displayed zone is the eventual
 *                write BY CONSTRUCTION. An unbroken boundary tie (selector → `needsCommissioner`) surfaces
 *                the WHOLE tied set (∪ anyone strictly below the boundary) as "zone", never an arbitrary cut.
 *   • `future` — not yet reached: only the field/cut counts are known (a skeleton; `ranked` = null).
 *
 * No IO, no clock, no db: a pure function of stored inputs the thin loader (`apps/web/.../loadPlayoffs`)
 * gathers — so the displayed ladder is recomputable from rows exactly like a score (the §4 principle). The
 * loader attaches the reused `reducedLineup` / `reinforcement` reads; they are NOT this module's concern.
 */
import { computeStandings, type ManagerPeriodPoints, type PeriodScores } from "./standing";
import { resolveRoundCut } from "./playoffRound";

const cmpId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** `playoff_entry.status` (the three lifecycle states; local union keeps this module @app/db-free). */
export type PlayoffEntryStatus = "alive" | "eliminated" | "champion";

/** A row's state in a round. `past` → {safe, eliminated}; `live` → {safe, zone}. */
export type RankedState = "safe" | "zone" | "eliminated";

/** One manager's display row within a round. (Superset of §21's `me` shape: + `seed`.) */
export interface RankedRow {
  managerId: string;
  seed: number;
  points: number;
  rank: number;
  state: RankedState;
}

export type RoundStatus = "past" | "live" | "future";

export interface PlayoffRoundView {
  idx: number;
  /** The knockout-round label (KNOCKOUT_ROUNDS member), e.g. "R32" … "Final". */
  round: string;
  status: RoundStatus;
  /** Managers entering this round (threaded from the cut schedule). */
  fieldCount: number;
  /** `period.cut_count` (0 if unset). */
  cutCount: number;
  /** `fieldCount − cutCount`, clamped ≥ 0. */
  survives: number;
  /** Display rows (past/live), or null for a not-yet-reached future round. */
  ranked: RankedRow[] | null;
  /** Surviving managerIds in ranked order (past: actual; live: provisional safe set); null for future. */
  survivors: string[] | null;
  /** Cut managerIds in ranked order (past: actual; live: provisional zone); null for future. */
  eliminatedIds: string[] | null;
}

/** A seeded entrant + its final group-stage record (§21 `seeds[]`). */
export interface PlayoffSeed {
  managerId: string;
  seed: number;
  gW: number;
  gL: number;
  gPts: number;
}

/**
 * Per-manager SEASON aggregates surfaced for the complete-arm recap (the design's `RecapModule` podium
 * total points + `MyRecapModule` power record / total pts / best week). PURE aggregations of EXISTING
 * scores — no new write, no scoring-rule change:
 *   • `totalTitlePoints` — Σ `score_manager_period.points` over ALL periods (= the `cumulativeTotals`
 *     input the live boundary tiebreak already uses).
 *   • `powerW` / `powerL` — the group-stage all-play-all W-L (the regular-season "power record" =
 *     `seeds[].gW/gL` = `computeStandings(groupPeriods)`); NOT extended over the knockouts (guillotine
 *     rounds are not all-play-all), so it reads identically to the group dashboard's "season W-L".
 *   • `bestWeek` — the max single-period total across ALL periods (group_md ∪ knockout_round are the only
 *     two `period.kind`s, so `groupPeriods` + `roundScores` together cover every period). 0 when none.
 */
export interface ManagerSeasonStats {
  totalTitlePoints: number;
  powerW: number;
  powerL: number;
  bestWeek: number;
}

/**
 * The §21 view-model CORE — everything classification/derivation. The loader spreads this and attaches the
 * reused `reducedLineup` / `reinforcement` reads to form the full `PlayoffsView`. `champion` / `complete`
 * are the read-derived "tournament over" signals (§21 under-specified them; added here — the loader reads,
 * never writes `league.status`).
 */
export interface PlayoffsViewCore {
  /** COUNT of present knockout rounds (≤ KNOCKOUT_ROUNDS.length — the field size fixes the ladder length). */
  totalRounds: number;
  /** The live round's idx, or the last round's idx once the tournament is complete. */
  currentRoundIdx: number;
  seeds: PlayoffSeed[];
  seedOf: Record<string, number>;
  rounds: PlayoffRoundView[];
  /** Alive count entering the current round. */
  aliveNow: number;
  /** Survivors after the current round's cut. */
  survivesNow: number;
  /** The viewer's row in the current round, or null (eliminated earlier / not a participant). */
  me: RankedRow | null;
  /** The champion managerId (a `champion` entry), or null. */
  champion: string | null;
  /** Derived "tournament over": every round cut AND a champion exists. The loader never reads league.status. */
  complete: boolean;
  /** managerId → SEASON aggregates for the complete-arm recap (total title pts / power record / best week).
   *  PURE: aggregates the SAME stored scores the builder already receives — no new input, no new IO. */
  seasonStats: Record<string, ManagerSeasonStats>;
}

export interface PlayoffEntryInput {
  managerId: string;
  seed: number;
  status: PlayoffEntryStatus;
  /** The round this manager was cut in (a present-ladder label), or null while alive / for the champion. */
  eliminatedRound: string | null;
}

export interface PlayoffRoundInput {
  /** KNOCKOUT_ROUNDS label. */
  label: string;
  /** `period.cut_count`. */
  cutCount: number | null;
}

export interface BuildPlayoffsViewInput {
  viewerManagerId: string;
  /** The knockout ladder, ORDERED by the caller (KNOCKOUT_ROUNDS index) — this order is authoritative. */
  rounds: PlayoffRoundInput[];
  /** All `playoff_entry` rows (the seeded field). */
  entries: PlayoffEntryInput[];
  /** roundLabel → managerId → this-round `score_manager_period.points` (missing → 0). */
  roundScores: Record<string, Record<string, number>>;
  /** managerId → Σ tournament points over ALL periods (the live boundary tiebreak; loader-derived,
   *  mirroring `advanceStore.loadRoundContext`'s cumulative derivation — not re-derived here). */
  cumulativeTotals: ReadonlyMap<string, number>;
  /** The group_md periods' scores → final group standings (`computeStandings`) for `seeds[].gW/gL/gPts`. */
  groupPeriods: PeriodScores[];
}

/** Display ordering within a round: round score desc, then seed asc, then managerId asc (deterministic). */
function rankRows(
  entrants: readonly string[],
  pointsOf: (id: string) => number,
  seedOf: Record<string, number>,
): { managerId: string; seed: number; points: number; rank: number }[] {
  return [...entrants]
    .map((managerId) => ({
      managerId,
      seed: seedOf[managerId] ?? 0,
      points: pointsOf(managerId),
    }))
    .sort((a, b) => b.points - a.points || a.seed - b.seed || cmpId(a.managerId, b.managerId))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Each manager's best single-period total ("best week") = the max over their group-period scores
 * (`groupPeriods`) and their per-knockout-round scores (`roundScores`). Those two inputs cover EVERY
 * period (the only `period.kind`s are group_md + knockout_round), so this is the true season max. Pure;
 * a manager with no scored period is absent from the map (the caller defaults it to 0).
 */
export function bestWeekByManager(
  groupPeriods: readonly PeriodScores[],
  roundScores: Record<string, Record<string, number>>,
): ReadonlyMap<string, number> {
  const best = new Map<string, number>();
  const bump = (id: string, pts: number): void => {
    const cur = best.get(id);
    if (cur === undefined || pts > cur) best.set(id, pts);
  };
  for (const period of groupPeriods) for (const s of period.scores) bump(s.managerId, s.points);
  for (const byManager of Object.values(roundScores))
    for (const [id, pts] of Object.entries(byManager)) bump(id, pts);
  return best;
}

/**
 * The provisional cut "zone" for a live round — the set of managers facing the blade — computed via the
 * SAME {@link resolveRoundCut} the apply path uses (it reuses `selectGuillotineCuts` verbatim). On an
 * unbroken boundary tie the zone is the FULL provisional cut = (managers strictly below the boundary) ∪
 * (the whole tied set), recovered WITHOUT reimplementing any boundary math by re-running `resolveRoundCut`
 * with a valid adjudication (its own `--break-tie` machinery yields the determined cuts) and unioning the
 * tied set back in.
 */
function liveZone(
  aliveRoundScores: ManagerPeriodPoints[],
  cumulativeTotals: ReadonlyMap<string, number>,
  cutCount: number,
): Set<string> {
  const res = resolveRoundCut({ aliveRoundScores, cumulativeTotals, cutCount });
  if (res.kind === "determined") return new Set(res.eliminated);
  // needsCommissioner: adjudicate an arbitrary valid subset to recover the strictly-cut set, then add the
  // whole tied set — the honest "facing the blade" zone that the eventual write would draw from.
  const probe = resolveRoundCut({
    aliveRoundScores,
    cumulativeTotals,
    cutCount,
    breakTie: res.tied.slice(0, res.cutsRemaining),
  });
  const definitelyCut = probe.kind === "determined" ? probe.eliminated : [];
  return new Set([...definitelyCut, ...res.tied]);
}

export function buildPlayoffsView(input: BuildPlayoffsViewInput): PlayoffsViewCore {
  const { viewerManagerId, rounds, entries, roundScores, cumulativeTotals, groupPeriods } = input;
  const totalRounds = rounds.length;

  // ── seeds: playoff_entry.seed (authoritative) + gW/gL/gPts from final group standings ──
  const standBy = new Map(computeStandings(groupPeriods).map((s) => [s.managerId, s] as const));
  const seeds: PlayoffSeed[] = entries
    .map((e) => {
      const g = standBy.get(e.managerId);
      return {
        managerId: e.managerId,
        seed: e.seed,
        gW: g?.allPlayAllW ?? 0,
        gL: g?.allPlayAllL ?? 0,
        gPts: g?.totalPoints ?? 0,
      };
    })
    .sort((a, b) => a.seed - b.seed || cmpId(a.managerId, b.managerId));
  const seedOf: Record<string, number> = {};
  for (const s of seeds) seedOf[s.managerId] = s.seed;

  // ── season aggregates for the complete-arm recap (PURE — same stored scores, no new input/IO) ──
  // totalTitlePoints = the cumulative tournament total already threaded in; powerW/L = the group
  // all-play-all record (standBy, = seeds[].gW/gL); bestWeek = max single-period total over all periods.
  const bestWeek = bestWeekByManager(groupPeriods, roundScores);
  const seasonStats: Record<string, ManagerSeasonStats> = {};
  for (const e of entries) {
    const g = standBy.get(e.managerId);
    seasonStats[e.managerId] = {
      totalTitlePoints: cumulativeTotals.get(e.managerId) ?? 0,
      powerW: g?.allPlayAllW ?? 0,
      powerL: g?.allPlayAllL ?? 0,
      bestWeek: bestWeek.get(e.managerId) ?? 0,
    };
  }

  // ── per-round classification ──
  // A round is `past` iff some entry was cut in it. The `live` round is the first uncut one; everything
  // after it is `future`. All cut (no uncut round) ⇒ the tournament is complete.
  const cutRounds = new Set(
    entries.map((e) => e.eliminatedRound).filter((r): r is string => r !== null),
  );
  const liveIdx = rounds.findIndex((r) => !cutRounds.has(r.label));
  const isComplete = totalRounds > 0 && liveIdx === -1;
  const champion = entries.find((e) => e.status === "champion")?.managerId ?? null;
  const complete = isComplete && champion !== null;
  const currentRoundIdx = liveIdx === -1 ? Math.max(0, totalRounds - 1) : liveIdx;

  // Ladder position of a manager's elimination (−1 = uncut / not in this ladder).
  const ladderPos = (label: string | null): number =>
    label === null ? -1 : rounds.findIndex((r) => r.label === label);
  // Managers entering round `i` = those NOT cut in any earlier round.
  const entrantsOf = (i: number): string[] =>
    entries
      .filter((e) => e.eliminatedRound === null || ladderPos(e.eliminatedRound) >= i)
      .map((e) => e.managerId);

  const statusOf = (i: number): RoundStatus => {
    if (liveIdx === -1) return "past"; // complete: every round is cut
    if (i < liveIdx) return "past";
    if (i === liveIdx) return "live";
    return "future";
  };

  let fieldCount = entries.length; // round 0 entrants; threaded forward by the cut schedule
  const roundViews: PlayoffRoundView[] = rounds.map((r, i) => {
    const cutCount = r.cutCount ?? 0;
    const status = statusOf(i);
    const thisFieldCount = fieldCount;
    // `survives` is the SCHEDULE count (§21: fieldCount − cutCount = how many ultimately advance). On a
    // LIVE round with an unbroken boundary tie the provisional `survivors` list below is SHORTER than this
    // (the whole tied set is shown in the zone until the commissioner adjudicates) — that gap is intended,
    // not a contradiction: `survives` is the eventual count, `survivors` the current facing-the-blade split.
    const survives = Math.max(0, thisFieldCount - cutCount);
    fieldCount = survives; // entrants of the next round

    if (status === "future") {
      return {
        idx: i,
        round: r.label,
        status,
        fieldCount: thisFieldCount,
        cutCount,
        survives,
        ranked: null,
        survivors: null,
        eliminatedIds: null,
      };
    }

    const entrants = entrantsOf(i);
    const pointsOf = (id: string): number => roundScores[r.label]?.[id] ?? 0;

    // Which entrants are cut THIS round, and the per-row state.
    let cutSet: Set<string>;
    if (status === "past") {
      // Authoritative: read the cut straight from playoff_entry, never from the round score / rank.
      cutSet = new Set(
        entries.filter((e) => e.eliminatedRound === r.label).map((e) => e.managerId),
      );
    } else {
      // live: provisional cut via the same selector the apply path uses.
      cutSet = liveZone(
        entrants.map((id) => ({ managerId: id, points: pointsOf(id) })),
        cumulativeTotals,
        cutCount,
      );
    }

    const liveRound = status === "live";
    const ranked: RankedRow[] = rankRows(entrants, pointsOf, seedOf).map((row) => ({
      ...row,
      state: cutSet.has(row.managerId) ? (liveRound ? "zone" : "eliminated") : "safe",
    }));
    const survivors = ranked
      .filter((row) => !cutSet.has(row.managerId))
      .map((row) => row.managerId);
    const eliminatedIds = ranked
      .filter((row) => cutSet.has(row.managerId))
      .map((row) => row.managerId);

    return {
      idx: i,
      round: r.label,
      status,
      fieldCount: thisFieldCount,
      cutCount,
      survives,
      ranked,
      survivors,
      eliminatedIds,
    };
  });

  const current = roundViews[currentRoundIdx];
  const me = current?.ranked?.find((row) => row.managerId === viewerManagerId) ?? null;

  return {
    totalRounds,
    currentRoundIdx,
    seeds,
    seedOf,
    rounds: roundViews,
    aliveNow: current?.fieldCount ?? 0,
    survivesNow: current?.survives ?? 0,
    me,
    champion,
    complete,
    seasonStats,
  };
}
