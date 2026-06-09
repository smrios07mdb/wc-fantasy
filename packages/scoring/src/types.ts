import type { Position, RatingSource } from "@app/shared";

/**
 * Pure input to {@link scorePlayerMatch}: the resolved raw + manual + rating values for ONE
 * player in ONE match, plus the role actually played. Mirrors SCORING.md (the locked, amended
 * model). The recompute layer (later prompt) maps DB rows -> this shape; scoring stays decoupled
 * from the database so any score is recomputable from stored inputs (ARCHITECTURE.md §4).
 *
 * Counting fields are post-feed integers. The engine applies the "for every N, round down"
 * buckets, the threshold gates, the rating ladder, and the role-locked lines — nothing upstream
 * pre-scores anything (the derivation rules live HERE, per the prompt / ARCHITECTURE.md §7).
 */
export interface ScoreInput {
  /** Role ACTUALLY played (SCORING.md principle 2), not the listed draft position. Every
   *  role-weighted / role-locked line keys off this with no special-case branch. */
  role: Position;
  minutesPlayed: number;

  /** Resolved 0–10 match rating, or null if the player received no rating (SCORING.md §1 /
   *  principle 5: the rating line — and "did the player play" — keys off this being non-null). */
  rating: number | null;
  /** Which source the resolver used (audit trail only; surfaced in the rating line detail). */
  ratingSource: RatingSource | null;

  // §3 Attacking (position-weighted by `role`)
  goals: number;
  assists: number;

  // §4 Universal accumulators (buckets / threshold gates)
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
  /** §8 remap of "dispossessed" -> feed-native possession_lost (−1 per 3). */
  possessionLost: number;

  // §5 Goalkeeping (scored only when `role === 'GK'`)
  /** Total saves. The engine derives saves-outside-box = `saves − savesInsideBox` (§7). */
  saves: number;
  savesInsideBox: number;
  punches: number;
  highClaims: number;

  // §6 Role outcomes (scored only when `role ∈ {GK, DEF}`) — modelled as the two DERIVED inputs
  // §7 prescribes, so the engine (not upstream) owns the rule:
  /** Goals against the player's team over the WHOLE match. Clean sheet ⇔ this is 0 (+ 60' + role). */
  teamGoalsAgainst: number;
  /** Goals conceded by the team WHILE this player was on the pitch. Drives the −1/1 line. */
  goalsConcededWhileOn: number;

  // §7 Penalties (all). Won/committed are MANUAL (no feed field — operator-tagged).
  penaltyWon: number;
  penaltyCommitted: number;
  penaltyMissed: number;
  penaltySaved: number;

  // §8 Discipline & negatives (all)
  /** Was cautioned at least once. Stacks additively: a second-yellow dismissal sets BOTH this
   *  (−1, the first yellow) AND `secondYellowMinute` (its own bucket) — the engine never suppresses
   *  a yellow because a later card followed. */
  yellowCard: boolean;
  /** EFFECTIVE match minute of a second yellow (incl. added time, so 90+N is ≥ 90), or null. Drives
   *  the lower-bound-inclusive 0–29 / 30–59 / ≥60 bucket. Scored on its own row, NOT also as a red. */
  secondYellowMinute: number | null;
  /** EFFECTIVE match minute of a straight (direct) red (incl. added time), or null. Same
   *  0–29 / 30–59 / ≥60 banding; carries no −1 unless a separate earlier yellow also fired. */
  redCardMinute: number | null;
  ownGoals: number;
}

/**
 * Canonical, STABLE category keys for {@link ScoreLine.category}. The "vs the field" screen and
 * the `score_player_match.breakdown_json` audit trail read these, so they must not drift — both
 * the engine and the tests reference this map instead of bare strings.
 */
export const SCORE_CATEGORIES = {
  rating: "rating",
  appearance: "appearance",
  goals: "goals",
  assists: "assists",
  keyPasses: "key_passes",
  dribbles: "dribbles",
  duels: "duels",
  passing: "passing",
  longBalls: "long_balls",
  wasFouled: "was_fouled",
  clearances: "clearances",
  blockedShots: "blocked_shots",
  interceptions: "interceptions",
  tacklesWon: "tackles_won",
  saveInsideBox: "save_inside_box",
  saveOutsideBox: "save_outside_box",
  penaltySaved: "penalty_saved",
  punchesHighClaims: "punches_high_claims",
  cleanSheet: "clean_sheet",
  goalsConceded: "goals_conceded",
  penaltyWon: "penalty_won",
  penaltyCommitted: "penalty_committed",
  penaltyMissed: "penalty_missed",
  yellowCard: "yellow_card",
  secondYellow: "second_yellow",
  redCard: "red_card",
  ownGoal: "own_goal",
  possessionLost: "possession_lost",
} as const;

/** Union of the canonical category strings. */
export type ScoreCategory = (typeof SCORE_CATEGORIES)[keyof typeof SCORE_CATEGORIES];

/** One audited contribution to a player's match score. */
export interface ScoreLine {
  /** A {@link SCORE_CATEGORIES} value, e.g. "tackles_won" | "clean_sheet" | "second_yellow". */
  category: string;
  points: number;
  /** Human-readable derivation, e.g. "5 tackles ÷ 3 = +1" or "rating 7.3 (scrape) → +1". */
  detail?: string;
}

/**
 * Result of scoring a player-match: the integer total plus the per-category breakdown. Only
 * contributing lines are emitted (a category worth 0 is omitted), in SCORING.md §1→§8 order.
 * This is exactly what `score_player_match.breakdown_json` stores.
 */
export interface ScoreBreakdown {
  total: number;
  lines: ScoreLine[];
}

/**
 * One lineup slot fed to {@link scoreManagerPeriod}. The aggregation counts STARTERS only; a
 * slot whose `score` is null (an unplayed / not-yet-locked starter) contributes 0.
 */
export interface ManagerPeriodSlotInput {
  isStarter: boolean;
  /** The computed player-match score for this slot, or null when there is none yet. */
  score: ScoreBreakdown | null;
}

/** Pure input to {@link scoreManagerPeriod}: a manager's lineup slots for one period. */
export interface ManagerPeriodInput {
  slots: ManagerPeriodSlotInput[];
}

/** Result of aggregating a manager's period: total starter points + how many starters counted. */
export interface ManagerPeriodScore {
  total: number;
  /** Number of STARTER slots that actually contributed a (non-null) score. */
  countedStarters: number;
}
