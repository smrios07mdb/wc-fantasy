/**
 * @app/pool — the per-match pick'em POOL engine (Prompt 40; DECISIONS.md → Pool). PURE: no IO, no
 * clock, no database/feed imports — every function is a pure function of its arguments (mirrors
 * packages/recompute/src/standing.ts), so a pool result + leaderboard is recomputable from stored
 * picks + match rows exactly like a player score. `now` is always passed in.
 *
 * This is a SEPARATE scoring system from the §1–§8 player engine (SCORING.md addendum): flat +1 per
 * correct pick, with a weight seam. The group-vs-knockout phase is decided by `period.kind`, NEVER by
 * `fifa_match.round` (which carries raw feed text — non-null even for group games; see DECISIONS → Pool).
 */
import type { MatchStatus, PeriodKind, PoolPrediction } from "@app/shared";
import { drawNotAllowedKnockout, pickLocked, type PoolPickError } from "./errors";

export type { PoolPrediction } from "@app/shared";

/** The minimum a lock decision needs: lifecycle status + kickoff. */
export interface LockableMatch {
  status: MatchStatus;
  kickoffAt: Date;
}

/** What a submission decision needs: the lock inputs plus the resolved phase. */
export interface SubmittableMatch extends LockableMatch {
  /** Resolved by the IO loader from `fifa_match.periodId → period.kind`; null when the period is unseeded. */
  periodKind: PeriodKind | null;
}

/** A fixture as the pool engine reads it — a DB-free projection of `fifa_match` + its `period.kind`. */
export interface PoolMatch extends SubmittableMatch {
  homeScore: number | null;
  awayScore: number | null;
  homeScoreEt: number | null;
  awayScoreEt: number | null;
  homeScorePens: number | null;
  awayScorePens: number | null;
}

/** One manager's pick of one fixture. */
export interface PoolPick {
  managerId: string;
  matchId: string;
  prediction: PoolPrediction;
}

/** A match as the leaderboard reads it: the result-derivation projection + its id and canonical label. */
export interface LeaderboardMatch extends PoolMatch {
  matchId: string;
  /** Canonical `period.label` (R32/R16/QF/SF/Final or MD{n}); the future weight knob keys off it. */
  periodLabel: string | null;
}

/** One row of the pool leaderboard. */
export interface PoolLeaderboardRow {
  managerId: string;
  played: number;
  correct: number;
  points: number;
}

/** The per-match weight function (see {@link weightForPeriod}); injected so the knob is swappable. */
export type PoolWeightFn = (periodKind: PeriodKind | null, periodLabel: string | null) => number;

/** Stable, deterministic id ordering — the leaderboard tiebreak (mirrors standing.ts `cmpId`). */
const cmpId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A single decisive comparison: the higher side wins, null if a value is missing or the two are level. */
function decidedBy(home: number | null, away: number | null): PoolPrediction | null {
  if (home === null || away === null || home === away) return null;
  return home > away ? "HOME" : "AWAY";
}

/** The knockout advancer: full-time, then extra time, then penalties; never DRAW; null if no decider. */
function knockoutAdvancer(m: PoolMatch): PoolPrediction | null {
  return (
    decidedBy(m.homeScore, m.awayScore) ??
    decidedBy(m.homeScoreEt, m.awayScoreEt) ??
    decidedBy(m.homeScorePens, m.awayScorePens)
  );
}

/**
 * The settled 1X2 result of a fixture, or null when it cannot (yet) be scored.
 *  - status !== "completed" → null (pending).
 *  - group_md → HOME | DRAW | AWAY from the full-time goals (defensive null if a score is missing).
 *  - knockout_round → the advancer via FT → ET → pens (never DRAW; defensive null if no decider).
 *  - periodKind null (unseeded) → null (honest unscored; the loader flags it — we do NOT guess via `round`).
 */
export function derivePoolResult(m: PoolMatch): PoolPrediction | null {
  if (m.status !== "completed") return null;
  if (m.periodKind === "group_md") {
    if (m.homeScore === null || m.awayScore === null) return null;
    return m.homeScore > m.awayScore ? "HOME" : m.homeScore < m.awayScore ? "AWAY" : "DRAW";
  }
  if (m.periodKind === "knockout_round") return knockoutAdvancer(m);
  return null;
}

/**
 * +`weight` for a correct pick; 0 for a miss or a not-yet-settled match (`result` null). A DRAW pick on
 * a knockout scores 0 naturally — the knockout result is never DRAW (and DRAW is rejected at write time).
 */
export function scorePick(
  prediction: PoolPrediction,
  result: PoolPrediction | null,
  weight: number,
): number {
  if (result === null) return 0;
  return prediction === result ? weight : 0;
}

/**
 * The weight of a correct pick. Flat `1` for every match today. SEAM: escalating knockout weights
 * (e.g. R32→Final 1/2/3/5/8) are a future knob that will key off the canonical `periodLabel` when
 * `periodKind === "knockout_round"`; until then both inputs are intentionally ignored.
 */
export function weightForPeriod(periodKind: PeriodKind | null, periodLabel: string | null): number {
  void periodKind;
  void periodLabel;
  return 1;
}

/**
 * The pool leaderboard: one row per manager who has any pick — `{ played, correct, points }` — sorted
 * `points` desc → `managerId` asc (deterministic, like standing.ts). `played` counts only the manager's
 * picks whose match has a settled result; an unresolved or orphan pick leaves the manager on the board
 * with zeros (so a manager who has picked but whose matches haven't finished still appears).
 */
export function buildPoolLeaderboard(
  picks: PoolPick[],
  matches: LeaderboardMatch[],
  weightFn: PoolWeightFn,
): PoolLeaderboardRow[] {
  const matchById = new Map(matches.map((m) => [m.matchId, m] as const));
  const agg = new Map<string, { played: number; correct: number; points: number }>();
  const touch = (id: string): { played: number; correct: number; points: number } => {
    let a = agg.get(id);
    if (!a) {
      a = { played: 0, correct: 0, points: 0 };
      agg.set(id, a);
    }
    return a;
  };

  for (const pick of picks) {
    const row = touch(pick.managerId);
    const m = matchById.get(pick.matchId);
    if (!m) continue;
    const result = derivePoolResult(m);
    if (result === null) continue;
    row.played += 1;
    const pts = scorePick(pick.prediction, result, weightFn(m.periodKind, m.periodLabel));
    row.points += pts;
    if (pts > 0) row.correct += 1;
  }

  return [...agg.entries()]
    .map(([managerId, a]) => ({ managerId, ...a }))
    .sort((x, y) => y.points - x.points || cmpId(x.managerId, y.managerId));
}

/** A pick is locked once kickoff arrives or the match leaves `scheduled` (server time is authoritative). */
export function isPickLocked(m: LockableMatch, now: Date): boolean {
  return now.getTime() >= m.kickoffAt.getTime() || m.status !== "scheduled";
}

/**
 * Write-time guard for a submission: reject a locked match, and reject DRAW on a knockout. When the
 * period is unseeded (`periodKind` null) DRAW is PERMITTED (permissive write; the result simply scores
 * null until the period is linked). Returns the typed error, or null when the submission is allowed.
 */
export function validatePickSubmission(
  prediction: PoolPrediction,
  m: SubmittableMatch,
  now: Date,
): PoolPickError | null {
  if (isPickLocked(m, now)) return pickLocked();
  if (prediction === "DRAW" && m.periodKind === "knockout_round") return drawNotAllowedKnockout();
  return null;
}
