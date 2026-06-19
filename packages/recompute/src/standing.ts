/**
 * Standings math — PURE (DECISIONS.md → Theme C; ARCHITECTURE.md §4 `standing`).
 *
 * No IO, no clock, no env, no database/feed imports: every function here is a pure function of its
 * arguments, so a standing is recomputable from stored inputs exactly like a score (the §4
 * load-bearing principle). The IO writer (recomputeStanding, in the orchestration module) gathers the
 * `score_manager_period` rows and persists the result; the cross-manager arithmetic lives here.
 *
 * Regular season = "all-play-all power record": each `group_md` period, a manager's points are
 * compared against EVERY other manager; they bank a W for each one they STRICTLY outscore, an L for
 * each one that STRICTLY outscores them, and a D (Draw) for each tie. A tie is still NEITHER a W nor an
 * L — it is now RECORDED as a Draw, so `W + L + D = N−1` (every comparison is accounted for). Cumulative
 * across the periods, then seeded by `W` desc, `total_points` desc. DRAWS ARE INFORMATIONAL — they are
 * summed for display but NEVER affect the seed (DECISIONS.md → Theme C amendment; this aligns the
 * backend with design/design_reference/standings/data.jsx, which already models W/L/D, games = W+L+D).
 */

/** One manager's points in one period — the `score_manager_period` row as the store hands it over. */
export interface ManagerPeriodPoints {
  managerId: string;
  points: number;
}

export type PairResult = "win" | "loss" | "tie";

/** One DIRECTED pairwise comparison within a period (manager vs one opponent). */
export interface PairwiseOutcome {
  managerId: string;
  opponentId: string;
  result: PairResult;
  /** This manager's period points (carried so the UI can show the H2H margin). */
  points: number;
  opponentPoints: number;
}

/**
 * Per-manager all-play-all record for ONE period. A tie is NEITHER a `w` nor an `l` — it is recorded
 * as a Draw in `d`. Invariant for every manager: `w + l + d` = opponents compared (`N−1`).
 */
export interface PeriodRecord {
  managerId: string;
  w: number;
  l: number;
  /** Draws (ties) this period — informational; never folded into `w`/`l`, never affects the seed. */
  d: number;
  points: number;
}

export interface PeriodScores {
  periodId: string;
  scores: ManagerPeriodPoints[];
}

/** Cumulative all-play-all standing for one manager, with its assigned seed. */
export interface StandingComputation {
  managerId: string;
  allPlayAllW: number;
  allPlayAllL: number;
  /** Cumulative Draws (ties) across periods — informational; does NOT affect the seed. */
  allPlayAllD: number;
  totalPoints: number;
  seed: number;
}

/** Stable, deterministic id ordering — the seeding fallback and every emitted-order tiebreak. */
const cmpId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Directed pairwise comparison of one period's manager→points: `N*(N−1)` outcomes, deterministically
 * ordered by `(managerId, opponentId)`. Exposed as the single source of truth for both the W/L record
 * ({@link periodRecords}) and the future "vs the field" per-opponent H2H view (ARCHITECTURE.md §5) —
 * the UI filters these by `managerId` rather than re-deriving comparisons.
 */
export function comparePeriodPairwise(scores: ManagerPeriodPoints[]): PairwiseOutcome[] {
  const sorted = [...scores].sort((a, b) => cmpId(a.managerId, b.managerId));
  const out: PairwiseOutcome[] = [];
  for (const a of sorted) {
    for (const b of sorted) {
      if (a.managerId === b.managerId) continue;
      const result: PairResult = a.points > b.points ? "win" : a.points < b.points ? "loss" : "tie";
      out.push({
        managerId: a.managerId,
        opponentId: b.managerId,
        result,
        points: a.points,
        opponentPoints: b.points,
      });
    }
  }
  return out;
}

/**
 * Per-manager W/L/D for one period, derived FROM {@link comparePeriodPairwise} so the record and the
 * H2H view can never drift. `W` = #strictly-below, `L` = #strictly-above, `D` = #ties. A tie is never
 * folded into `w`/`l` (we do NOT compute `L` as `N−1−W`, which would charge both tied managers a loss)
 * — it is counted in `d` instead, so `w + l + d` = opponents compared.
 */
export function periodRecords(scores: ManagerPeriodPoints[]): PeriodRecord[] {
  const pointsById = new Map(scores.map((s) => [s.managerId, s.points] as const));
  const w = new Map<string, number>();
  const l = new Map<string, number>();
  const d = new Map<string, number>();
  for (const o of comparePeriodPairwise(scores)) {
    if (o.result === "win") w.set(o.managerId, (w.get(o.managerId) ?? 0) + 1);
    else if (o.result === "loss") l.set(o.managerId, (l.get(o.managerId) ?? 0) + 1);
    else d.set(o.managerId, (d.get(o.managerId) ?? 0) + 1); // "tie" → a recorded Draw
  }
  return [...pointsById.entries()]
    .map(([managerId, points]) => ({
      managerId,
      w: w.get(managerId) ?? 0,
      l: l.get(managerId) ?? 0,
      d: d.get(managerId) ?? 0,
      points,
    }))
    .sort((a, b) => cmpId(a.managerId, b.managerId));
}

/**
 * Cumulative all-play-all standing + seeding across the given periods (the caller passes ONLY the
 * completed/in-progress `group_md` periods; standings are always current-state — provisional while a
 * wave plays out, final once the period freezes, with no separate "provisional" mode). Within each
 * period the comparison is over exactly the managers present in that period's `scores` (an inactive
 * manager appears with a `0` row and is a free win for everyone strictly above — no special case).
 *
 * Seed order: `all_play_all_W` desc → `total_points` desc (the locked Theme-C tiebreak) → `managerId`
 * asc. `all_play_all_D` is summed across periods but is INFORMATIONAL — it never enters the comparator.
 * TODO(confirm): Theme C defines no further regular-season tiebreak beyond total points; the
 * `managerId` fallback only guarantees determinism — a true remaining tie is the commissioner's call.
 */
export function computeStandings(periods: PeriodScores[]): StandingComputation[] {
  const agg = new Map<string, { w: number; l: number; d: number; points: number }>();
  const touch = (id: string): { w: number; l: number; d: number; points: number } => {
    let a = agg.get(id);
    if (!a) {
      a = { w: 0, l: 0, d: 0, points: 0 };
      agg.set(id, a);
    }
    return a;
  };

  for (const period of periods) {
    for (const rec of periodRecords(period.scores)) {
      const a = touch(rec.managerId);
      a.w += rec.w;
      a.l += rec.l;
      a.d += rec.d;
      a.points += rec.points;
    }
  }

  const rows: StandingComputation[] = [...agg.entries()].map(([managerId, a]) => ({
    managerId,
    allPlayAllW: a.w,
    allPlayAllL: a.l,
    allPlayAllD: a.d,
    totalPoints: a.points,
    seed: 0,
  }));
  // Seed comparator UNCHANGED — `allPlayAllD` is summed for display but never enters the sort.
  rows.sort(
    (x, y) =>
      y.allPlayAllW - x.allPlayAllW ||
      y.totalPoints - x.totalPoints ||
      cmpId(x.managerId, y.managerId),
  );
  rows.forEach((r, i) => {
    r.seed = i + 1;
  });
  return rows;
}
