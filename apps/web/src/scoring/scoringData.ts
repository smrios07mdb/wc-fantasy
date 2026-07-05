/**
 * Static scoring-reference content for the `/scoring` page. PURE data — no IO, no React.
 *
 * This module is the SINGLE SOURCE for every number the page renders, so the page can never again
 * silently drift from the engine (the T15-7 bug: hand-authored tables diverged from packages/scoring —
 * §1 ladder mislabelled, §4 possession-lost at ÷3 instead of ÷10 plus five missing categories, §8 red
 * values wrong, §9 totals stale). Two mechanisms make that drift structurally impossible:
 *
 *   • §1 rating ladder, §4 accumulators and §8 discipline bands are STRUCTURED DATA that the page
 *     renders AND that `scoringData.test.ts` probes against `scorePlayerMatch`. A page value that
 *     disagrees with the engine now fails CI instead of reaching production.
 *   • §9 example cards are DERIVED: each is a `ScoreInput` fixture pushed through `scorePlayerMatch`,
 *     so its rows and total ARE the engine's own output. Nothing is hand-totalled; a future rule
 *     change flows into the examples on the next build.
 *
 * `scorePlayerMatch` is pure + deterministic + IO-free (ARCHITECTURE.md §4), so importing it here keeps
 * this module pure and the /scoring page fully static. packages/scoring is byte-untouched.
 */
import { scorePlayerMatch, SCORE_CATEGORIES as C, type ScoreInput } from "@app/scoring";

export type Position = "GK" | "DEF" | "MID" | "FWD";

/** The `ScoreInput` count fields (number-typed only) — the stats §4 accumulates. */
export type NumericStatField = {
  [K in keyof ScoreInput]: ScoreInput[K] extends number ? K : never;
}[keyof ScoreInput];

/** Signed label with a real minus sign (U+2212), matching the ds points convention (never a hyphen). */
const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${-n}`);

/** The eight rule sections, in render order. Drives the page's section list and the smoke test. */
export const SECTION_HEADINGS = [
  "Performance Rating",
  "Appearance",
  "Goals & Assists",
  "Universal Accumulators",
  "Goalkeeping",
  "Role Outcomes: GK & DEF",
  "Penalties",
  "Discipline",
] as const;

// --- §1 Performance-rating ladder ------------------------------------------------------------

/**
 * The eight rating bands, top → bottom. Lower-bound inclusive, mirroring `ratingPoints` in the engine
 * (index.ts). `probe` is a sample rating INSIDE the band; the drift test feeds it through the engine
 * and asserts the emitted rating line equals `pts`. The 6.5–6.9 band scores 0 and is ALWAYS shown —
 * the engine renders the rating line even at 0 (feat/scoring-show-zero-rating-line) so a 6.8-rated
 * player doesn't read as "un-rated".
 */
export interface RatingBand {
  readonly band: string;
  readonly pts: number;
  readonly probe: number;
}

export const RATING_LADDER: readonly RatingBand[] = [
  { band: "9.0+", pts: 5, probe: 9.2 },
  { band: "8.5 – 8.9", pts: 4, probe: 8.6 },
  { band: "8.0 – 8.4", pts: 3, probe: 8.2 },
  { band: "7.5 – 7.9", pts: 2, probe: 7.8 },
  { band: "7.0 – 7.4", pts: 1, probe: 7.2 },
  { band: "6.5 – 6.9", pts: 0, probe: 6.8 },
  { band: "6.0 – 6.4", pts: -1, probe: 6.2 },
  { band: "Below 6.0", pts: -2, probe: 5.5 },
];

// --- §4 Universal accumulators ---------------------------------------------------------------

/**
 * Per-N floor buckets. `field` is the `ScoreInput` count that drives the line; `per` the divisor;
 * `sign` +1 (reward) or −1 (possession lost, the only negative). `sample` is a display/probe count.
 * `eligible: "Outfield"` rows are gated exactly like the engine's `isOutfield` block (role ≠ GK). The
 * rate and example strings are DERIVED from `per`/`sign`/`sample`, so they cannot disagree.
 */
export interface Accumulator {
  readonly category: string;
  readonly field: NumericStatField;
  readonly stat: string;
  readonly eligible: "All" | "Outfield";
  readonly per: number;
  readonly sign: 1 | -1;
  readonly sample: number;
}

export const ACCUMULATORS: readonly Accumulator[] = [
  // All-player buckets.
  {
    category: C.keyPasses,
    field: "keyPasses",
    stat: "Key passes",
    eligible: "All",
    per: 2,
    sign: 1,
    sample: 6,
  },
  {
    category: C.wasFouled,
    field: "wasFouled",
    stat: "Was fouled",
    eligible: "All",
    per: 3,
    sign: 1,
    sample: 4,
  },
  {
    category: C.dribbles,
    field: "dribblesCompleted",
    stat: "Dribbles completed",
    eligible: "All",
    per: 2,
    sign: 1,
    sample: 4,
  },
  {
    category: C.duels,
    field: "duelsWon",
    stat: "Duels won",
    eligible: "All",
    per: 3,
    sign: 1,
    sample: 4,
  },
  {
    category: C.passing,
    field: "passesAccurate",
    stat: "Accurate passes",
    eligible: "All",
    per: 15,
    sign: 1,
    sample: 54,
  },
  {
    category: C.longBalls,
    field: "longBallsAccurate",
    stat: "Accurate long balls",
    eligible: "All",
    per: 2,
    sign: 1,
    sample: 4,
  },
  {
    category: C.shotsOnTarget,
    field: "shotsOnTarget",
    stat: "Shots on target",
    eligible: "All",
    per: 3,
    sign: 1,
    sample: 3,
  },
  {
    category: C.bigChancesCreated,
    field: "bigChancesCreated",
    stat: "Big chances created",
    eligible: "All",
    per: 1,
    sign: 1,
    sample: 2,
  },
  {
    category: C.crossesAccurate,
    field: "crossesAccurate",
    stat: "Accurate crosses",
    eligible: "All",
    per: 4,
    sign: 1,
    sample: 8,
  },
  {
    category: C.touches,
    field: "touches",
    stat: "Touches",
    eligible: "All",
    per: 25,
    sign: 1,
    sample: 75,
  },
  {
    category: C.possessionLost,
    field: "possessionLost",
    stat: "Possession lost",
    eligible: "All",
    per: 10,
    sign: -1,
    sample: 12,
  },
  // Outfield-only defensive buckets (role played ≠ GK).
  {
    category: C.clearances,
    field: "clearances",
    stat: "Clearances",
    eligible: "Outfield",
    per: 5,
    sign: 1,
    sample: 8,
  },
  {
    category: C.blockedShots,
    field: "blockedShots",
    stat: "Shots blocked",
    eligible: "Outfield",
    per: 2,
    sign: 1,
    sample: 2,
  },
  {
    category: C.interceptions,
    field: "interceptions",
    stat: "Interceptions",
    eligible: "Outfield",
    per: 3,
    sign: 1,
    sample: 4,
  },
  {
    category: C.tacklesWon,
    field: "tacklesWon",
    stat: "Tackles won",
    eligible: "Outfield",
    per: 3,
    sign: 1,
    sample: 5,
  },
  {
    category: C.ballRecoveries,
    field: "ballRecoveries",
    stat: "Ball recoveries",
    eligible: "Outfield",
    per: 5,
    sign: 1,
    sample: 10,
  },
];

/** Derived display for the Rate column, e.g. "+1 / 2" or "−1 / 10". */
export function accumulatorRate(a: Accumulator): string {
  return `${signed(a.sign)} / ${a.per}`;
}

/** Derived display for the Example column, e.g. "6 → floor(6/2) = +3". */
export function accumulatorExample(a: Accumulator): string {
  const buckets = Math.floor(a.sample / a.per);
  return `${a.sample} → floor(${a.sample}/${a.per}) = ${signed(a.sign * buckets)}`;
}

// --- §8 Discipline bands ---------------------------------------------------------------------

/** A dismissal minute-band probe: a card at effective minute `minute` scores `pts`. */
export interface MinuteBand {
  readonly minute: number;
  readonly pts: number;
}

/** Straight red by effective minute (0–29 / 30–59 / ≥60), mirroring `redCardPoints` in the engine. */
export const RED_CARD_BANDS: readonly MinuteBand[] = [
  { minute: 15, pts: -4 },
  { minute: 45, pts: -3 },
  { minute: 75, pts: -2 },
];

/** Second yellow by effective minute (0–29 / 30–59 / ≥60), mirroring `secondYellowPoints`. */
export const SECOND_YELLOW_BANDS: readonly MinuteBand[] = [
  { minute: 15, pts: -3 },
  { minute: 45, pts: -2 },
  { minute: 75, pts: -1 },
];

/** First-yellow caution (§8) and own goal (§8) scalars — probed directly against the engine. */
export const YELLOW_CARD_PTS = -1;
export const OWN_GOAL_PTS = -4;

/** "−4 / −3 / −2" from a band list (display order matches the "min 0–29 / 30–59 / ≥60" header). */
export function bandPtsLabel(bands: readonly MinuteBand[]): string {
  return bands.map((b) => signed(b.pts)).join(" / ");
}

// --- §9 Worked examples (derived from engine fixtures) ---------------------------------------

/** One line of an example breakdown: the scoring line, the arithmetic shown, and the points. */
export interface ExampleLine {
  readonly line: string;
  readonly calc: string;
  readonly pts: number;
}

export interface ExampleCard {
  readonly position: Position;
  readonly title: string;
  readonly scenario: string;
  /** Result · minutes · rating summary line. */
  readonly meta: string;
  readonly lines: readonly ExampleLine[];
  /** Engine total for the fixture (sum of the emitted line points). */
  readonly total: number;
}

/** A fully-zeroed `ScoreInput`; each fixture overrides only the fields its scenario exercises. */
export function zeroScoreInput(role: Position): ScoreInput {
  return {
    role,
    minutesPlayed: 0,
    rating: null,
    ratingSource: null,
    goals: 0,
    assists: 0,
    keyPasses: 0,
    dribblesAttempted: 0,
    dribblesCompleted: 0,
    duelsWon: 0,
    duelsLost: 0,
    passesTotal: 0,
    passesAccurate: 0,
    longBallsTotal: 0,
    longBallsAccurate: 0,
    wasFouled: 0,
    clearances: 0,
    blockedShots: 0,
    interceptions: 0,
    tacklesWon: 0,
    shotsOnTarget: 0,
    ballRecoveries: 0,
    bigChancesCreated: 0,
    crossesAccurate: 0,
    touches: 0,
    possessionLost: 0,
    saves: 0,
    savesInsideBox: 0,
    punches: 0,
    highClaims: 0,
    teamGoalsAgainst: 0,
    goalsConcededWhileOn: 0,
    penaltyWon: 0,
    penaltyCommitted: 0,
    penaltyMissed: 0,
    penaltySaved: 0,
    yellowCard: false,
    secondYellowMinute: null,
    redCardMinute: null,
    ownGoals: 0,
  };
}

export interface ExampleFixture {
  readonly position: Position;
  readonly title: string;
  readonly scenario: string;
  readonly meta: string;
  readonly input: ScoreInput;
}

/**
 * The four §9 scenarios as engine inputs. Possession lost is set ≥10 on every card so the −1 line
 * renders (the "teach the ÷10 penalty" decision, T15-7 fix thread) — none of the reward counts is
 * contrived, and the engine recomputes each total from these numbers.
 */
export const EXAMPLE_FIXTURES: readonly ExampleFixture[] = [
  {
    position: "GK",
    title: "Clean sheet, busy night",
    scenario: "Win 1–0",
    meta: "90 min · Rating 8.2",
    input: {
      ...zeroScoreInput("GK"),
      minutesPlayed: 90,
      rating: 8.2,
      saves: 9, // 6 inside box + 3 outside (engine derives outside = saves − savesInsideBox)
      savesInsideBox: 6,
      punches: 2,
      highClaims: 2,
      possessionLost: 12,
    },
  },
  {
    position: "DEF",
    title: "Goal + clean sheet",
    scenario: "Win 2–0",
    meta: "90 min · Rating 8.6",
    input: {
      ...zeroScoreInput("DEF"),
      minutesPlayed: 90,
      rating: 8.6,
      goals: 1,
      duelsWon: 5,
      clearances: 8,
      blockedShots: 2,
      interceptions: 4,
      tacklesWon: 5,
      possessionLost: 14,
    },
  },
  {
    position: "MID",
    title: "Creative assist, yellow",
    scenario: "Win 2–1",
    meta: "90 min · Rating 7.8",
    input: {
      ...zeroScoreInput("MID"),
      minutesPlayed: 90,
      rating: 7.8,
      assists: 1,
      keyPasses: 6,
      wasFouled: 4,
      dribblesCompleted: 4,
      passesAccurate: 54,
      longBallsAccurate: 4,
      tacklesWon: 3,
      yellowCard: true,
      possessionLost: 17,
    },
  },
  {
    position: "FWD",
    title: "Brace, monster game",
    scenario: "Win 3–1",
    meta: "90 min · Rating 9.2",
    input: {
      ...zeroScoreInput("FWD"),
      minutesPlayed: 90,
      rating: 9.2,
      goals: 2,
      assists: 1,
      keyPasses: 3,
      wasFouled: 5,
      dribblesCompleted: 5,
      duelsWon: 4,
      possessionLost: 13,
    },
  },
];

/** Human labels for the §9 "Line" column, keyed by the engine's canonical category. */
const CATEGORY_LABEL: Record<string, string> = {
  [C.rating]: "Performance rating",
  [C.appearance]: "Appearance",
  [C.goals]: "Goals",
  [C.assists]: "Assists",
  [C.keyPasses]: "Key passes",
  [C.dribbles]: "Dribbles completed",
  [C.duels]: "Duels won",
  [C.passing]: "Accurate passes",
  [C.longBalls]: "Accurate long balls",
  [C.wasFouled]: "Was fouled",
  [C.clearances]: "Clearances",
  [C.blockedShots]: "Shots blocked",
  [C.interceptions]: "Interceptions",
  [C.tacklesWon]: "Tackles won",
  [C.shotsOnTarget]: "Shots on target",
  [C.ballRecoveries]: "Ball recoveries",
  [C.bigChancesCreated]: "Big chances created",
  [C.crossesAccurate]: "Accurate crosses",
  [C.touches]: "Touches",
  [C.saveInsideBox]: "Saves inside box",
  [C.saveOutsideBox]: "Saves outside box",
  [C.penaltySaved]: "Penalty saved",
  [C.punchesHighClaims]: "Punches + high claims",
  [C.cleanSheet]: "Clean sheet",
  [C.goalsConceded]: "Goals conceded",
  [C.penaltyWon]: "Penalty won",
  [C.penaltyCommitted]: "Penalty committed",
  [C.penaltyMissed]: "Penalty missed",
  [C.yellowCard]: "Yellow card",
  [C.secondYellow]: "Second yellow",
  [C.redCard]: "Red card",
  [C.ownGoal]: "Own goal",
  [C.possessionLost]: "Possession lost",
};

/** Push a fixture through the engine and shape its breakdown into display rows. */
function toCard(f: ExampleFixture): ExampleCard {
  const { total, lines } = scorePlayerMatch(f.input);
  return {
    position: f.position,
    title: f.title,
    scenario: f.scenario,
    meta: f.meta,
    lines: lines.map((l) => ({
      line: CATEGORY_LABEL[l.category] ?? l.category,
      calc: l.detail ?? "",
      pts: l.points,
    })),
    total,
  };
}

/** The four §9 cards — the engine's own output for {@link EXAMPLE_FIXTURES}. */
export const EXAMPLE_CARDS: readonly ExampleCard[] = EXAMPLE_FIXTURES.map(toCard);
