/**
 * Guards the /scoring reference against engine drift — the root cause of T15-7, where the page's
 * hand-authored tables silently diverged from packages/scoring. The old test only checked that each
 * card's rows summed to a hand-written total (internal consistency); a wrong rate + matching wrong
 * total passed green. These tests instead pin the page's values to `scorePlayerMatch` itself:
 *   • §9 cards ARE the engine's output for their fixtures (derivation is the fix; this re-proves it).
 *   • §1 / §4 / §8 displayed values are each probed through the engine — a divergence fails CI.
 */
import { describe, it, expect } from "vitest";
import { scorePlayerMatch, SCORE_CATEGORIES as C, type ScoreInput } from "@app/scoring";
import {
  SECTION_HEADINGS,
  EXAMPLE_CARDS,
  EXAMPLE_FIXTURES,
  RATING_LADDER,
  ACCUMULATORS,
  RED_CARD_BANDS,
  SECOND_YELLOW_BANDS,
  YELLOW_CARD_PTS,
  OWN_GOAL_PTS,
  bandPtsLabel,
  zeroScoreInput,
  type Position,
  type NumericStatField,
} from "./scoringData";

/** Points the engine emits for a given category on `input`, or undefined if the line is omitted. */
function linePts(input: ScoreInput, category: string): number | undefined {
  return scorePlayerMatch(input).lines.find((l) => l.category === category)?.points;
}

describe("scoringData — the static /scoring reference content (pure, IO-free)", () => {
  it("declares the eight rule sections, in render order", () => {
    expect(SECTION_HEADINGS).toHaveLength(8);
    expect(SECTION_HEADINGS[5]).toBe("Role Outcomes: GK & DEF");
  });

  it("has one example card per position (GK / DEF / MID / FWD)", () => {
    expect(EXAMPLE_CARDS.map((c) => c.position)).toEqual(["GK", "DEF", "MID", "FWD"]);
  });
});

// --- §9 is DERIVED from the engine — this closes the root-cause gap (T15-7) -------------------
describe("§9 example cards are the engine's own output (not hand-totalled)", () => {
  it("each card's rows + total equal scorePlayerMatch on the same fixture", () => {
    expect(EXAMPLE_CARDS).toHaveLength(EXAMPLE_FIXTURES.length);
    EXAMPLE_FIXTURES.forEach((f, i) => {
      const card = EXAMPLE_CARDS[i]!;
      const engine = scorePlayerMatch(f.input);
      expect(card.position, "card aligns with fixture").toBe(f.position);
      expect(card.total, `${f.position} total = engine total`).toBe(engine.total);
      expect(
        card.lines.map((l) => l.pts),
        `${f.position} line points`,
      ).toEqual(engine.lines.map((l) => l.points));
      // internal consistency (kept from the old test): rows sum to the stated total.
      expect(card.lines.reduce((s, l) => s + l.pts, 0)).toBe(card.total);
    });
  });

  it("the corrected totals are 14 / 20 / 17 / 22", () => {
    expect(EXAMPLE_CARDS.map((c) => c.total)).toEqual([14, 20, 17, 22]);
  });

  it("every card demonstrates the possession-lost −1 line (the ÷10 fix is taught)", () => {
    for (const card of EXAMPLE_CARDS) {
      const poss = card.lines.find((l) => l.line === "Possession lost");
      expect(poss, `${card.position} possession-lost line`).toBeDefined();
      expect(poss!.pts).toBe(-1);
    }
  });
});

// --- §1 rating ladder vs the engine ----------------------------------------------------------
describe("§1 rating ladder matches the engine", () => {
  it("every displayed band's points equal the engine's rating line for a rating in that band", () => {
    for (const b of RATING_LADDER) {
      // minutesPlayed 0 → no appearance line; the rating line is always emitted (even at 0).
      const pts = linePts({ ...zeroScoreInput("MID"), rating: b.probe }, C.rating);
      expect(pts, `${b.band} (probe ${b.probe})`).toBe(b.pts);
    }
  });

  it("has 8 bands including the 0-point 6.5 – 6.9 band, top → bottom", () => {
    expect(RATING_LADDER).toHaveLength(8);
    expect(RATING_LADDER.find((b) => b.pts === 0)?.band).toBe("6.5 – 6.9");
    expect(RATING_LADDER[0]?.band).toBe("9.0+");
  });
});

// --- §4 accumulators vs the engine -----------------------------------------------------------
describe("§4 accumulators match the engine (divisor / sign / eligibility)", () => {
  function accPts(field: NumericStatField, category: string, sample: number, role: Position) {
    const input = zeroScoreInput(role);
    input[field] = sample;
    return linePts(input, category);
  }

  it("each displayed row equals floor(sample / per) × sign through scorePlayerMatch", () => {
    for (const a of ACCUMULATORS) {
      const expected = a.sign * Math.floor(a.sample / a.per);
      const role: Position = a.eligible === "Outfield" ? "DEF" : "MID";
      expect(accPts(a.field, a.category, a.sample, role), `${a.stat} (${a.sample}÷${a.per})`).toBe(
        expected,
      );
    }
  });

  it("Outfield-only rows score nothing for a GK", () => {
    for (const a of ACCUMULATORS.filter((x) => x.eligible === "Outfield")) {
      expect(accPts(a.field, a.category, a.sample, "GK"), `${a.stat} for GK`).toBeUndefined();
    }
  });

  it("includes the five categories promoted from `extra`", () => {
    expect(ACCUMULATORS.map((a) => a.stat)).toEqual(
      expect.arrayContaining([
        "Shots on target",
        "Big chances created",
        "Accurate crosses",
        "Touches",
        "Ball recoveries",
      ]),
    );
  });

  it("possession lost is the only negative accumulator, at −1 / 10", () => {
    const neg = ACCUMULATORS.filter((a) => a.sign === -1);
    expect(neg.map((a) => a.stat)).toEqual(["Possession lost"]);
    expect(neg[0]?.per).toBe(10);
  });
});

// --- §8 discipline vs the engine -------------------------------------------------------------
describe("§8 discipline bands match the engine", () => {
  function dismissalPts(
    field: "redCardMinute" | "secondYellowMinute",
    minute: number,
    cat: string,
  ) {
    const input = zeroScoreInput("MID");
    input[field] = minute;
    return linePts(input, cat);
  }

  it("straight red is −4 / −3 / −2 by minute band (0–29 / 30–59 / ≥60)", () => {
    for (const b of RED_CARD_BANDS) {
      expect(dismissalPts("redCardMinute", b.minute, C.redCard), `red at ${b.minute}′`).toBe(b.pts);
    }
    expect(bandPtsLabel(RED_CARD_BANDS)).toBe("−4 / −3 / −2");
  });

  it("second yellow is −3 / −2 / −1 by minute band", () => {
    for (const b of SECOND_YELLOW_BANDS) {
      expect(
        dismissalPts("secondYellowMinute", b.minute, C.secondYellow),
        `2nd yellow at ${b.minute}′`,
      ).toBe(b.pts);
    }
    expect(bandPtsLabel(SECOND_YELLOW_BANDS)).toBe("−3 / −2 / −1");
  });

  it("yellow card and own goal scalars match the engine", () => {
    expect(linePts({ ...zeroScoreInput("MID"), yellowCard: true }, C.yellowCard)).toBe(
      YELLOW_CARD_PTS,
    );
    expect(linePts({ ...zeroScoreInput("MID"), ownGoals: 1 }, C.ownGoal)).toBe(OWN_GOAL_PTS);
  });
});
