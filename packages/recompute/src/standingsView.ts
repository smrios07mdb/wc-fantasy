/**
 * standingsView — the PURE view-model for the dedicated `/standings` page (T10; ARCHITECTURE §4 read
 * surface). It renders TWO tabs (Matchday + Cumulative) from ONE source — the `group_md` periods'
 * `score_manager_period` point-maps — so the two tabs can never disagree.
 *
 * It adds NO new W/L/D or seeding rule. It REUSES the locked all-play-all helpers:
 *   • `periodRecords` — the Prompt-04 pairwise record helper (`buildVsField` imports the same one):
 *     one period's `managerId → points` → per-manager `{w, l, d}` with a TIE recorded as a Draw
 *     (W + L + D = opponents compared; Theme C, the 2026-06-19 amendment). The matchday tab and the
 *     per-period form strip are built ON this — the W/L/D comparison is consumed, never re-derived.
 *   • `computeStandings` — the cumulative seeding (Σ per-period records; seed = total-W desc → total-
 *     points desc → managerId asc; draws never enter the sort). The cumulative tab is built ON this —
 *     the tiebreak is NOT forked.
 *
 * PURE: every input is injected; no IO, no clock, no env, no `@app/db` / `@app/feed`, no network
 * (see standingsView.test.ts). The loader edge (`apps/web/app/standings/loadStandings.ts`) reads the
 * rows and threads them in; this module is just arithmetic + ordering.
 *
 * Padding note — the loader threads the RAW `score_manager_period` rows per period (UNPADDED, exactly
 * as the recompute sweeper feeds `computeStandings` in `recomputeStanding`). So the cumulative tab is
 * byte-identical to the persisted `standing` (no drift vs the vsfield season view), and — because
 * `computeStandings` sums `periodRecords` over those same rows — the cumulative totals are exactly the
 * sum of the matchday tabs. A manager absent from a period simply isn't ranked that matchday; a manager
 * absent from EVERY period is still listed in the cumulative tab (a trailing 0–0–0 row, seed null), the
 * same display-completeness policy `buildVsField`'s season view uses.
 */
import {
  computeStandings,
  periodRecords,
  type ManagerPeriodPoints,
  type PeriodRecord,
  type PeriodScores,
  type StandingComputation,
} from "./standing";

/**
 * The provisional playoff field size shown during the group stage. Theme C is now LOCKED at 10
 * (commissioner-decided): the cut schedule `cutScheduleFor(10)` = {2,2,2,2,1} collapses the field
 * 10→8→6→4→2→champion, and is applied for real only at the group→playoff transition (via `--field 10`).
 * The cut line here is the same provisional 10-wide line surfaced on `/standings`. The loader may pass
 * an explicit `fieldSize`; absent that, this default is used.
 */
export const DEFAULT_PLAYOFF_FIELD_SIZE = 10;

/** Stable, deterministic id ordering — the seeding fallback / emitted-order tiebreak (mirrors standing.ts). */
const cmpId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** One league manager (the directory the tabs render — names + viewer marking). */
export interface StandingsManager {
  managerId: string;
  displayName: string;
}

/** One ordered `group_md` period. `name` is a longer display label; `live` = matches underway now. */
export interface StandingsPeriodInput {
  id: string;
  /** Short label, e.g. "MD1" — used for the form-strip chips. */
  label: string;
  /** Longer display name, e.g. "Matchday 1" — used for tooltips + the expandable detail. */
  name: string;
  /** True while this period's matches are underway (the loader decides; time-based). */
  live: boolean;
}

export interface StandingsViewInput {
  /** The league's `group_md` periods in CANONICAL tournament order (the loader sorts; treated as authoritative). */
  periods: StandingsPeriodInput[];
  /** periodId → that period's raw `score_manager_period` rows (UNPADDED — see the module padding note). */
  pointsByPeriod: Record<string, ManagerPeriodPoints[]>;
  /** The full league directory (every manager is listed, even one absent from all periods). */
  managers: StandingsManager[];
  /** The viewing manager — only marks `isMe`; the view is league-scoped (a member sees the whole field). */
  meId: string;
  /** Provisional playoff field size; defaults to {@link DEFAULT_PLAYOFF_FIELD_SIZE}. */
  fieldSize?: number;
}

/** One period's contribution to a manager's form strip / expandable detail. */
export interface PeriodFormCell {
  periodId: string;
  label: string;
  name: string;
  live: boolean;
  /** That period's points (0 if the manager has no row that period). */
  points: number;
  w: number;
  l: number;
  d: number;
}

/**
 * A ranked row — mirrors the design row model so `standings/components.jsx` ports cleanly. `seed`,
 * `perPeriod`, `move`, and `tiedWins` are CUMULATIVE-only (undefined/null on matchday rows).
 */
export interface StandingsRow {
  managerId: string;
  displayName: string;
  isMe: boolean;
  /** The DISPLAYED competition rank — joint when rows share the full sort key (standard "1224" ranking). */
  rank: number;
  /** True when this row shares its sort key (and thus `rank`) with an adjacent row. */
  tiedAtRank: boolean;
  /** Cumulative only: within the provisional playoff field (by deterministic seed position). False on matchday. */
  qualified: boolean;
  w: number;
  l: number;
  d: number;
  points: number;
  /** Cumulative: the deterministic `computeStandings` seed (null if absent from all periods). Matchday: null. */
  seed: number | null;
  /** w / (w + l), draws excluded — mirrors the vsfield win-rate convention (0 when no decisions). */
  winPct: number;
  /** Cumulative only: level on total wins with an adjacent row (drives the PF "tiebreak" underline). */
  tiedWins?: boolean;
  /** Cumulative only: the per-period form strip + expandable breakdown. */
  perPeriod?: PeriodFormCell[];
  /** Cumulative only: rank delta vs the standings through COMPLETED periods only (+ = climbed). */
  move?: number;
}

export interface StandingsView {
  meId: string;
  /** The provisional playoff field size in effect (echoes the input default). */
  fieldSize: number;
  /** The ordered periods (the period selector renders these). */
  periods: StandingsPeriodInput[];
  /** The matchday tab default: the live period if any, else the latest scored period, else null. */
  defaultMatchdayPeriodId: string | null;
  /** periodId → that period's within-period all-play-all ranking. */
  matchday: Record<string, StandingsRow[]>;
  /** The season standings (the ported power-record table). */
  cumulative: StandingsRow[];
}

/** w / (w + l) as a 0..1 fraction; draws are informational and excluded (matches buildVsField). */
function winPct(w: number, l: number): number {
  return w + l > 0 ? w / (w + l) : 0;
}

/**
 * Assign standard competition ranks ("1224"): rows already sorted by `rows`'s comparator share a joint
 * `rank` when they share the FULL sort key (`sameKey`), and the next distinct row's rank jumps to its
 * 1-based position. Sets `rank` + `tiedAtRank` in place. The deterministic position (i+1) is unaffected —
 * `seed` (for cumulative) still distinguishes co-ranked rows.
 */
function assignJointRanks(
  rows: StandingsRow[],
  sameKey: (a: StandingsRow, b: StandingsRow) => boolean,
): void {
  rows.forEach((row, i) => {
    const prev = i > 0 ? rows[i - 1] : undefined;
    const next = i < rows.length - 1 ? rows[i + 1] : undefined;
    row.rank = prev && sameKey(row, prev) ? prev.rank : i + 1;
    row.tiedAtRank = (!!prev && sameKey(row, prev)) || (!!next && sameKey(row, next));
  });
}

/** Build one period's within-period ranking: per-manager record → rank by W desc, points desc, id asc. */
function buildMatchdayRows(
  records: PeriodRecord[],
  directory: Map<string, StandingsManager>,
  meId: string,
): StandingsRow[] {
  const rows: StandingsRow[] = records.map((rec) => ({
    managerId: rec.managerId,
    displayName: directory.get(rec.managerId)?.displayName ?? rec.managerId,
    isMe: rec.managerId === meId,
    rank: 0,
    tiedAtRank: false,
    qualified: false, // qualification is a SEASON concept — never shown on a matchday row.
    w: rec.w,
    l: rec.l,
    d: rec.d,
    points: rec.points,
    seed: null,
    winPct: winPct(rec.w, rec.l),
  }));
  // Within-period order: the locked tiebreak scoped to one period — W desc → points desc → id asc.
  rows.sort((a, b) => b.w - a.w || b.points - a.points || cmpId(a.managerId, b.managerId));
  // Identical points ⇒ identical (w, l, d), so a points-tie shares the full (w, points) key → joint rank.
  assignJointRanks(rows, (a, b) => a.w === b.w && a.points === b.points);
  return rows;
}

/**
 * The cumulative ordering comparator — IDENTICAL to `buildVsField`'s season comparator: seed asc
 * (unseeded last), then the locked Theme-C tiebreak (W desc → points desc → id asc). Because `seed`
 * already encodes (W, points, id) from `computeStandings`, the trailing terms only ever order managers
 * absent from all periods (seed null). The tiebreak is REUSED, not forked.
 */
function seasonCmp(a: StandingsRow, b: StandingsRow): number {
  const sa = a.seed ?? Number.POSITIVE_INFINITY;
  const sb = b.seed ?? Number.POSITIVE_INFINITY;
  return sa - sb || b.w - a.w || b.points - a.points || cmpId(a.managerId, b.managerId);
}

/**
 * Order the directory into a season standing (no joint ranks / move / form strip yet) from a given set
 * of `computeStandings` rows — used for BOTH the current snapshot and the completed-only prior snapshot
 * (so `move` compares like-for-like). Absent managers get a 0–0–0 row, seed null, sorted last.
 */
function orderSeason(
  standings: StandingComputation[],
  directory: StandingsManager[],
  meId: string,
): StandingsRow[] {
  const byManager = new Map(standings.map((s) => [s.managerId, s] as const));
  const rows: StandingsRow[] = directory.map((m) => {
    const st = byManager.get(m.managerId);
    const w = st?.allPlayAllW ?? 0;
    const l = st?.allPlayAllL ?? 0;
    return {
      managerId: m.managerId,
      displayName: m.displayName,
      isMe: m.managerId === meId,
      rank: 0,
      tiedAtRank: false,
      qualified: false,
      w,
      l,
      d: st?.allPlayAllD ?? 0,
      points: st?.totalPoints ?? 0,
      seed: st?.seed ?? null,
      winPct: winPct(w, l),
    };
  });
  rows.sort(seasonCmp);
  return rows;
}

export function buildStandingsView(input: StandingsViewInput): StandingsView {
  const fieldSize = input.fieldSize ?? DEFAULT_PLAYOFF_FIELD_SIZE;
  const directory = new Map(input.managers.map((m) => [m.managerId, m] as const));
  const meId = input.meId;

  // Assemble the per-period scores in the given (canonical) period order — the single source both tabs
  // derive from. Each period's rows are RAW (unpadded), exactly as the sweeper feeds computeStandings.
  const periodScores: PeriodScores[] = input.periods.map((p) => ({
    periodId: p.id,
    scores: input.pointsByPeriod[p.id] ?? [],
  }));

  // Per-period records (the pairwise helper, reused) — one Map per period, keyed by managerId.
  const recordsByPeriod = new Map<string, Map<string, PeriodRecord>>();
  for (const ps of periodScores) {
    recordsByPeriod.set(
      ps.periodId,
      new Map(periodRecords(ps.scores).map((r) => [r.managerId, r])),
    );
  }

  // ── Matchday tab ── each period's within-period ranking, built from that period's records.
  const matchday: Record<string, StandingsRow[]> = {};
  for (const p of input.periods) {
    const recs = [...(recordsByPeriod.get(p.id)?.values() ?? [])];
    matchday[p.id] = buildMatchdayRows(recs, directory, meId);
  }

  // Default-selected matchday: the live period (latest in canonical order if several), else the latest
  // period that has any scores, else the latest period overall, else null.
  const livePeriods = input.periods.filter((p) => p.live);
  const hasScores = (id: string): boolean => (input.pointsByPeriod[id]?.length ?? 0) > 0;
  const lastLive = livePeriods.at(-1);
  let defaultMatchdayPeriodId: string | null = lastLive ? lastLive.id : null;
  if (defaultMatchdayPeriodId === null) {
    for (let i = input.periods.length - 1; i >= 0; i--) {
      const p = input.periods[i];
      if (p && hasScores(p.id)) {
        defaultMatchdayPeriodId = p.id;
        break;
      }
    }
    const lastPeriod = input.periods.at(-1);
    if (defaultMatchdayPeriodId === null && lastPeriod) {
      defaultMatchdayPeriodId = lastPeriod.id;
    }
  }

  // ── Cumulative tab ── computeStandings over ALL periods (the authoritative seed, no fork), ordered
  // into the directory, then enriched with joint rank, the form strip, move, and the provisional cut.
  const cumulative = orderSeason(computeStandings(periodScores), input.managers, meId);

  // Provisional cut: exactly `fieldSize` managers qualify, by deterministic seed POSITION (the sorted
  // order index), so a boundary tie doesn't over-admit — the real transition seeds the same way.
  cumulative.forEach((row, i) => {
    row.qualified = i < fieldSize;
  });

  // Joint rank (display) on the full (W, points) key; `tiedWins` = level on W with a neighbour (the PF
  // tiebreak underline). Both computed on the already-sorted rows.
  assignJointRanks(cumulative, (a, b) => a.w === b.w && a.points === b.points);
  cumulative.forEach((row, i) => {
    const prev = i > 0 ? cumulative[i - 1] : undefined;
    const next = i < cumulative.length - 1 ? cumulative[i + 1] : undefined;
    row.tiedWins = (!!prev && prev.w === row.w) || (!!next && next.w === row.w);
  });

  // Form strip / expandable detail: one cell per period (0–0–0 / 0 pts where the manager has no row).
  for (const row of cumulative) {
    row.perPeriod = input.periods.map((p) => {
      const rec = recordsByPeriod.get(p.id)?.get(row.managerId);
      return {
        periodId: p.id,
        label: p.label,
        name: p.name,
        live: p.live,
        points: rec?.points ?? 0,
        w: rec?.w ?? 0,
        l: rec?.l ?? 0,
        d: rec?.d ?? 0,
      };
    });
  }

  // Movement vs COMPLETED periods only: rank the same directory through the non-live periods, then
  // compare deterministic positions (prior − current). The live period is excluded from the prior snapshot.
  const completedScores = periodScores.filter((ps) => {
    const period = input.periods.find((p) => p.id === ps.periodId);
    return period ? !period.live : false;
  });
  const priorOrder = orderSeason(computeStandings(completedScores), input.managers, meId);
  const priorPos = new Map(priorOrder.map((r, i) => [r.managerId, i + 1] as const));
  cumulative.forEach((row, i) => {
    const prior = priorPos.get(row.managerId) ?? i + 1;
    row.move = prior - (i + 1);
  });

  return {
    meId,
    fieldSize,
    periods: input.periods,
    defaultMatchdayPeriodId,
    matchday,
    cumulative,
  };
}
