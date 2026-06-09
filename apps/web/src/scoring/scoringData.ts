/**
 * Static scoring-reference content for the `/scoring` page (Prompt 28). PURE data — no IO, no React.
 * The rules tables in §1–§8 are authored as JSX in the page itself; this module holds the two pieces
 * worth unit-testing: the canonical list of section headings (so the page can't silently drop one) and
 * the four position example cards, whose row breakdowns must SUM to their stated totals.
 *
 * Mirrors SCORING.md exactly, including the Part-A §6 update (goals conceded −1/1). The example numbers
 * are the canonical figures hardcoded in the Prompt 28 spec.
 */

export type Position = "GK" | "DEF" | "MID" | "FWD";

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

/** One line of an example breakdown: the scoring line, the arithmetic shown, and the points it yields. */
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
  /** The canonical total from the spec; asserted equal to sum(lines.pts) in the test. */
  readonly total: number;
}

export const EXAMPLE_CARDS: readonly ExampleCard[] = [
  {
    position: "GK",
    title: "Clean sheet, busy night",
    scenario: "Win 1–0",
    meta: "90 min · Rating 8.2",
    lines: [
      { line: "Performance rating (8.2)", calc: "—", pts: 3 },
      { line: "Appearance (90 min)", calc: "—", pts: 2 },
      { line: "Clean sheet", calc: "—", pts: 4 },
      { line: "Saves inside box", calc: "6 → ÷2", pts: 3 },
      { line: "Saves outside box", calc: "3 → ÷3", pts: 1 },
      { line: "Punches + high claims", calc: "4 → ÷2", pts: 2 },
      { line: "Possession lost", calc: "3 → ÷3", pts: -1 },
    ],
    total: 14,
  },
  {
    position: "DEF",
    title: "Goal + clean sheet",
    scenario: "Win 2–0",
    meta: "90 min · Rating 8.6",
    lines: [
      { line: "Performance rating (8.6)", calc: "—", pts: 4 },
      { line: "Appearance (90 min)", calc: "—", pts: 2 },
      { line: "Goal", calc: "—", pts: 6 },
      { line: "Clean sheet", calc: "—", pts: 4 },
      { line: "Clearances", calc: "8 → ÷5", pts: 1 },
      { line: "Tackles won", calc: "5 → ÷3", pts: 1 },
      { line: "Interceptions", calc: "4 → ÷3", pts: 1 },
      { line: "Shots blocked", calc: "2 → ÷2", pts: 1 },
      { line: "Duels won (5/7 = 71%)", calc: "≥3 & ≥50%", pts: 1 },
      { line: "Possession lost", calc: "4 → ÷3", pts: -1 },
    ],
    total: 20,
  },
  {
    position: "MID",
    title: "Creative assist, yellow",
    scenario: "Win 2–1",
    meta: "90 min · Rating 7.8",
    lines: [
      { line: "Performance rating (7.8)", calc: "—", pts: 2 },
      { line: "Appearance (90 min)", calc: "—", pts: 2 },
      { line: "Assist", calc: "—", pts: 3 },
      { line: "Key passes", calc: "6 → ÷2", pts: 3 },
      { line: "Passing (58 att, 93%)", calc: "≥40 & ≥90%", pts: 1 },
      { line: "Long balls (4 acc, 67%)", calc: "≥3 & ≥60%", pts: 1 },
      { line: "Dribbles (4 comp, 80%)", calc: "≥3 & ≥60%", pts: 1 },
      { line: "Was fouled", calc: "4 → ÷3", pts: 1 },
      { line: "Tackles won", calc: "3 → ÷3", pts: 1 },
      { line: "Possession lost", calc: "5 → ÷3", pts: -1 },
      { line: "Yellow card", calc: "—", pts: -1 },
    ],
    total: 13,
  },
  {
    position: "FWD",
    title: "Brace, monster game",
    scenario: "Win 3–1",
    meta: "90 min · Rating 9.2",
    lines: [
      { line: "Performance rating (9.2)", calc: "—", pts: 5 },
      { line: "Appearance (90 min)", calc: "—", pts: 2 },
      { line: "Goals (×2)", calc: "2 × 4", pts: 8 },
      { line: "Assist", calc: "—", pts: 3 },
      { line: "Key passes", calc: "3 → ÷2", pts: 1 },
      { line: "Dribbles (5 comp, 83%)", calc: "≥3 & ≥60%", pts: 1 },
      { line: "Duels won (4/5 = 80%)", calc: "≥3 & ≥50%", pts: 1 },
      { line: "Was fouled", calc: "5 → ÷3", pts: 1 },
      { line: "Possession lost", calc: "6 → ÷3", pts: -2 },
    ],
    total: 20,
  },
];
