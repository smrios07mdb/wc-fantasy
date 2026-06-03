import type { Position, RatingSource } from "@app/shared";

/**
 * Pure input to the scoring function: the resolved raw + manual + rating values for ONE
 * player in ONE match, plus the role actually played. Mirrors SCORING.md (the locked, amended
 * model). The recompute layer (later prompt) maps DB rows -> this shape; scoring stays decoupled
 * from the database so any score is recomputable from stored inputs.
 *
 * Counting fields are post-feed integers (already filtered for the bucket thresholds' raw inputs).
 * The scoring function applies the "for every N, round down" buckets and the rating ladder.
 */
export interface ScoreInput {
  /** Role ACTUALLY played (SCORING.md principle 2), not the listed draft position. */
  role: Position;
  minutesPlayed: number;

  /** Resolved 0–10 match rating, or null if the player received no rating (did not play). */
  rating: number | null;
  /** Which source the resolver used (for the breakdown/audit trail). */
  ratingSource: RatingSource | null;

  // Attacking
  goals: number;
  assists: number;

  // Universal accumulators (buckets)
  keyPasses: number;
  dribblesAttempted: number;
  dribblesCompleted: number;
  duelsWon: number;
  duelsLost: number;
  passesTotal: number;
  passesAccurate: number;
  longBallsTotal: number;
  longBallsAccurate: number;
  wasFouled: number;
  clearances: number;
  blockedShots: number;
  interceptions: number;
  tacklesWon: number;
  possessionLost: number;

  // Goalkeeping (role played)
  saves: number;
  savesInsideBox: number;
  punches: number;
  highClaims: number;

  // Role outcomes (GK/DEF role played)
  cleanSheet: boolean;
  goalsConceded: number;

  // Penalties
  penaltyWon: number;
  penaltyCommitted: number;
  penaltyMissed: number;
  penaltySaved: number;

  // Discipline & negatives
  yellowCard: boolean;
  /** Minute of a second yellow (drives the 0–29 / 30–59 / 60–90 bucket), or null. */
  secondYellowMinute: number | null;
  /** Minute of a straight red, or null. */
  redCardMinute: number | null;
  ownGoals: number;
}

/** One audited contribution to a player's match score. */
export interface ScoreLine {
  /** SCORING.md category, e.g. "rating" | "appearance" | "goal" | "clearances" | "yellow_card". */
  category: string;
  /** Human-readable detail, e.g. "5 tackles ÷ 3 = +1". */
  detail?: string;
  points: number;
}

/** The result of scoring a player-match: total + the per-category breakdown for the audit trail. */
export interface ScoreBreakdown {
  total: number;
  lines: ScoreLine[];
}
