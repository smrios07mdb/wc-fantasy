/**
 * @app/scoring — the scoring engine.
 *
 * PURE + DETERMINISTIC + NO IO. Every function here is a pure function of its arguments: no
 * imports of `@app/db` / `@app/feed`, no network, no `Date`/clock, no env reads. That is the
 * load-bearing property from ARCHITECTURE.md §4 — "scores are a pure function of stored inputs" —
 * which is what makes recompute safe. The recompute layer (a later prompt) maps DB rows to these
 * inputs and persists the results; it never lives here.
 *
 * The model is SCORING.md §1–§8 with the locked Theme-A amendments applied. Where SCORING.md and
 * any summary disagree, SCORING.md wins.
 */
import type { Position } from "@app/shared";
import {
  SCORE_CATEGORIES as C,
  type ScoreInput,
  type ScoreBreakdown,
  type ScoreLine,
  type ManagerPeriodInput,
  type ManagerPeriodScore,
} from "./types";

export * from "./types";

// --- small pure helpers ----------------------------------------------------------------------

/** "For every N, round DOWN" bucket (SCORING.md principle 3): e.g. 5 ÷ 3 = 1. */
const floorPer = (count: number, per: number): number => Math.floor(count / per);

/** Signed label for breakdown details, e.g. +2 / −1 (real minus sign, not hyphen). */
const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${-n}`);

/**
 * §1 rating ladder — lower-bound inclusive (the table's bands share endpoints, e.g. 6.5 sits in
 * both "6.0–6.5" and "6.5–7.0"; we resolve each rating to exactly one band, lower inclusive). The
 * top band is 9.0–10. Only ever called with a non-null rating (a player who played).
 */
function ratingPoints(rating: number): number {
  if (rating < 6.0) return -2;
  if (rating < 6.5) return -1;
  if (rating < 7.0) return 0;
  if (rating < 7.5) return 1;
  if (rating < 8.0) return 2;
  if (rating < 8.5) return 3;
  if (rating < 9.0) return 4;
  return 5;
}

/**
 * §8 second-yellow ladder by EFFECTIVE minute (incl. added time): 0–29 / 30–59 / ≥60. Lower-bound
 * inclusive; the top band is a ≥60 catch-all so a stoppage-time dismissal (90+N) lands at −1, not 0.
 * Scored on its own row and stacks with the first yellow's −1 (the engine never suppresses).
 */
function secondYellowPoints(minute: number): number {
  if (minute < 30) return -3;
  if (minute < 60) return -2;
  return -1;
}

/** §8 straight-red ladder by EFFECTIVE minute: 0–29 / 30–59 / ≥60 (catch-all, incl. stoppage). */
function redCardPoints(minute: number): number {
  if (minute < 30) return -4;
  if (minute < 60) return -3;
  return -2;
}

/** §3 position weights by ROLE PLAYED (rarer for a position ⇒ worth more). */
const GOAL_WEIGHT: Record<Position, number> = { GK: 6, DEF: 6, MID: 5, FWD: 4 };
// updated: GK assist +4 → +5 per Prompt 29.
const ASSIST_WEIGHT: Record<Position, number> = { GK: 5, DEF: 4, MID: 3, FWD: 3 };

// --- the engine ------------------------------------------------------------------------------

/**
 * Score one player's match from its resolved inputs (pure function — same inputs, same output).
 *
 * Lines are emitted in SCORING.md §1→§8 order; a category worth 0 is omitted (the breakdown lists
 * only contributing lines). `total` is the integer sum of the line points.
 */
export function scorePlayerMatch(input: ScoreInput): ScoreBreakdown {
  const lines: ScoreLine[] = [];
  const add = (category: string, points: number, detail?: string): void => {
    if (points !== 0) lines.push({ category, points, detail });
  };

  const { role } = input;
  // Role-played eligibility (SCORING.md principle 2 — no special-case branch, just read `role`).
  const isOutfield = role !== "GK";
  const isKeeper = role === "GK";
  const isKeeperOrDef = role === "GK" || role === "DEF";

  // §1 Performance rating — only for a player who received a rating (i.e. who played).
  if (input.rating !== null) {
    const pts = ratingPoints(input.rating);
    const src = input.ratingSource ? ` (${input.ratingSource})` : "";
    add(C.rating, pts, `rating ${input.rating}${src} → ${signed(pts)}`);
  }

  // §2 Appearance — driven by minutes (SCORING.md §2: "1–59" ⇒ played ≥ 1 minute).
  if (input.minutesPlayed >= 1) {
    const pts = input.minutesPlayed >= 60 ? 2 : 1;
    add(C.appearance, pts, `${input.minutesPlayed} min → ${signed(pts)}`);
  }

  // §3 Attacking — position-weighted by role played.
  if (input.goals > 0) {
    const w = GOAL_WEIGHT[role];
    add(C.goals, input.goals * w, `${input.goals} goal(s) × ${w} = ${signed(input.goals * w)}`);
  }
  if (input.assists > 0) {
    const w = ASSIST_WEIGHT[role];
    add(
      C.assists,
      input.assists * w,
      `${input.assists} assist(s) × ${w} = ${signed(input.assists * w)}`,
    );
  }

  // §4 Universal accumulators — per-N buckets (round down), any player.
  add(C.keyPasses, floorPer(input.keyPasses, 2), `${input.keyPasses} key passes ÷ 2`);
  add(C.wasFouled, floorPer(input.wasFouled, 3), `${input.wasFouled} fouls won ÷ 3`);

  // §4 Universal accumulators — per-N buckets (round down); updated per Prompt 29
  // (threshold-gated sub-table removed; all four stats converted to floor-division).
  add(
    C.dribbles,
    floorPer(input.dribblesCompleted, 2),
    `${input.dribblesCompleted} ÷ 2 dribbles completed`,
  ); // updated: ÷2 dribbles completed per Prompt 29
  add(C.duels, floorPer(input.duelsWon, 3), `${input.duelsWon} ÷ 3 duels won`); // updated: ÷3 duels won per Prompt 29
  add(
    C.passing,
    floorPer(input.passesAccurate, 15),
    `${input.passesAccurate} ÷ 15 accurate passes`,
  ); // updated: ÷15 accurate passes per Prompt 29
  add(
    C.longBalls,
    floorPer(input.longBallsAccurate, 2),
    `${input.longBallsAccurate} ÷ 2 accurate long balls`,
  ); // updated: ÷2 accurate long balls per Prompt 29

  // §4 Universal accumulators — OUTFIELD-only defensive buckets (role played ≠ GK).
  if (isOutfield) {
    add(C.clearances, floorPer(input.clearances, 5), `${input.clearances} clearances ÷ 5`);
    add(C.blockedShots, floorPer(input.blockedShots, 2), `${input.blockedShots} blocks ÷ 2`);
    add(
      C.interceptions,
      floorPer(input.interceptions, 3),
      `${input.interceptions} interceptions ÷ 3`,
    );
    add(C.tacklesWon, floorPer(input.tacklesWon, 3), `${input.tacklesWon} tackles won ÷ 3`);
  }

  // §5 Goalkeeping — role played === GK.
  if (isKeeper) {
    add(
      C.saveInsideBox,
      floorPer(input.savesInsideBox, 2),
      `${input.savesInsideBox} saves inside box ÷ 2`,
    );
    // Save outside box is DERIVED here (§7): saves − saves_inside_box, clamped at 0.
    const outside = Math.max(0, input.saves - input.savesInsideBox);
    add(C.saveOutsideBox, floorPer(outside, 3), `${outside} saves outside box ÷ 3`);
    add(C.penaltySaved, input.penaltySaved * 5, `${input.penaltySaved} penalty saved × 5`);
    const reach = input.punches + input.highClaims;
    add(
      C.punchesHighClaims,
      floorPer(reach, 2),
      `${input.punches}+${input.highClaims} punches/high claims ÷ 2`,
    );
  }

  // §6 Role outcomes — clean sheet & goals conceded, role played ∈ {GK, DEF}.
  if (isKeeperOrDef) {
    // Clean sheet keys off WHOLE-MATCH team goals against + the 60-minute gate (derived here).
    if (input.minutesPlayed >= 60 && input.teamGoalsAgainst === 0) {
      add(C.cleanSheet, 4, `clean sheet (${input.minutesPlayed}′, 0 against) → +4`);
    }
    // Goals conceded keys off goals while the player was ON the pitch.
    // updated: goals conceded now −1/1 per Prompt 28 (was −1/2; floor(n/1) = n).
    add(
      C.goalsConceded,
      -floorPer(input.goalsConcededWhileOn, 1),
      `${input.goalsConcededWhileOn} conceded ÷ 1`,
    );
  }

  // §7 Penalties — all positions. Won/committed are MANUAL inputs (no feed field).
  add(C.penaltyWon, input.penaltyWon * 2, `${input.penaltyWon} penalty won × 2`);
  add(
    C.penaltyCommitted,
    input.penaltyCommitted * -2,
    `${input.penaltyCommitted} penalty committed × −2`,
  );
  add(C.penaltyMissed, input.penaltyMissed * -3, `${input.penaltyMissed} penalty missed × −3`);

  // §8 Discipline & negatives — all positions.
  if (input.yellowCard) add(C.yellowCard, -1, "yellow card → −1");
  if (input.secondYellowMinute !== null) {
    const pts = secondYellowPoints(input.secondYellowMinute);
    add(C.secondYellow, pts, `second yellow (${input.secondYellowMinute}′) → ${signed(pts)}`);
  }
  if (input.redCardMinute !== null) {
    const pts = redCardPoints(input.redCardMinute);
    add(C.redCard, pts, `red card (${input.redCardMinute}′) → ${signed(pts)}`);
  }
  // updated: own goal −2 → −4 per Prompt 29.
  add(C.ownGoal, input.ownGoals * -4, `${input.ownGoals} own goal(s) × −4`);
  // §8 remap: dispossessed → possession_lost (−1/3).
  add(
    C.possessionLost,
    -floorPer(input.possessionLost, 3),
    `${input.possessionLost} possession lost ÷ 3`,
  );

  const total = lines.reduce((sum, line) => sum + line.points, 0);
  return { total, lines };
}

/**
 * Aggregate a manager's period: sum the player-match points of the manager's STARTER slots
 * (bench excluded; an unplayed / not-yet-locked starter has a null score and contributes 0).
 *
 * Trivial today, but it lives here so the later recompute sweeper just calls it — the period
 * score stays a pure function of the per-player scores, same as the player score is a pure
 * function of its inputs.
 */
export function scoreManagerPeriod(input: ManagerPeriodInput): ManagerPeriodScore {
  let total = 0;
  let countedStarters = 0;
  for (const slot of input.slots) {
    if (!slot.isStarter || slot.score === null) continue;
    total += slot.score.total;
    countedStarters += 1;
  }
  return { total, countedStarters };
}
