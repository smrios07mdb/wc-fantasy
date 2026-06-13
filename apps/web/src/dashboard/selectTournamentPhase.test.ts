import { describe, it, expect } from "vitest";
import type { MatchStatus, PeriodKind } from "@app/shared";
import { selectTournamentPhase, type TournamentMatchSummary } from "./selectTournamentPhase";

// ─── helpers ─────────────────────────────────────────────────────────────────────────────

function m(
  status: MatchStatus,
  periodKind: PeriodKind | null = null,
  periodLabel: string | null = null,
): TournamentMatchSummary {
  return { status, periodKind, periodLabel };
}

// ─── phase detection ─────────────────────────────────────────────────────────────────────

describe("selectTournamentPhase — TournamentMatchSummary[] → TournamentPhase (pure, IO-free)", () => {
  it("returns 'pre-kickoff' when no matches exist (no fixtures loaded)", () => {
    expect(selectTournamentPhase([])).toBe("pre-kickoff");
  });

  it("returns 'pre-kickoff' when all matches are scheduled (group)", () => {
    const matches = [
      m("scheduled", "group_md", "MD1"),
      m("scheduled", "group_md", "MD1"),
      m("scheduled", "group_md", "MD2"),
    ];
    expect(selectTournamentPhase(matches)).toBe("pre-kickoff");
  });

  it("returns 'pre-kickoff' when all matches are postponed (not kicked off)", () => {
    expect(selectTournamentPhase([m("postponed", "group_md", "MD1")])).toBe("pre-kickoff");
  });

  it("returns 'group' when any group match (period.kind=group_md) is in_progress", () => {
    const matches = [
      m("scheduled", "group_md", "MD1"),
      m("in_progress", "group_md", "MD1"),
      m("scheduled", "group_md", "MD2"),
    ];
    expect(selectTournamentPhase(matches)).toBe("group");
  });

  it("returns 'group' when any group match (period.kind=group_md) is completed", () => {
    const matches = [m("completed", "group_md", "MD1"), m("scheduled", "group_md", "MD2")];
    expect(selectTournamentPhase(matches)).toBe("group");
  });

  it("returns 'group' when any group match (period.kind=group_md) is abandoned", () => {
    expect(selectTournamentPhase([m("abandoned", "group_md", "MD1")])).toBe("group");
  });

  it("returns 'group' even when some group matches are postponed (postponed != kicked off)", () => {
    const matches = [
      m("postponed", "group_md", "MD1"),
      m("completed", "group_md", "MD1"),
      m("scheduled", "group_md", "MD2"),
    ];
    expect(selectTournamentPhase(matches)).toBe("group");
  });

  it("returns 'playoff' when any knockout match (period.kind=knockout_round) is in_progress", () => {
    const matches = [
      m("completed", "group_md", "MD1"), // group match done
      m("in_progress", "knockout_round", "R32"), // knockout kicked off
      m("scheduled", "knockout_round", "R32"),
    ];
    expect(selectTournamentPhase(matches)).toBe("playoff");
  });

  it("returns 'playoff' when any knockout match is completed (but not the Final)", () => {
    const matches = [
      m("completed", "group_md", "MD1"),
      m("completed", "knockout_round", "R32"),
      m("scheduled", "knockout_round", "R16"),
    ];
    expect(selectTournamentPhase(matches)).toBe("playoff");
  });

  it("returns 'playoff' for QF, SF without the Final done", () => {
    const matches = [
      m("completed", "group_md", "MD1"),
      m("completed", "knockout_round", "QF"),
      m("in_progress", "knockout_round", "SF"),
      m("scheduled", "knockout_round", "Final"),
    ];
    expect(selectTournamentPhase(matches)).toBe("playoff");
  });

  it("returns 'complete' when the Final match is completed", () => {
    const matches = [
      m("completed", "group_md", "MD1"),
      m("completed", "knockout_round", "R32"),
      m("completed", "knockout_round", "QF"),
      m("completed", "knockout_round", "SF"),
      m("completed", "knockout_round", "Final"),
    ];
    expect(selectTournamentPhase(matches)).toBe("complete");
  });

  it("returns 'complete' even if other matches are not completed (Final is the signal)", () => {
    // Edge: an abandoned group match + completed Final
    const matches = [m("abandoned", "group_md", "MD1"), m("completed", "knockout_round", "Final")];
    expect(selectTournamentPhase(matches)).toBe("complete");
  });

  it("does NOT return 'complete' for an in_progress Final (not yet done)", () => {
    const matches = [
      m("completed", "group_md", "MD1"),
      m("in_progress", "knockout_round", "Final"),
    ];
    expect(selectTournamentPhase(matches)).toBe("playoff");
  });

  it("does NOT return 'complete' for a postponed Final", () => {
    const matches = [m("completed", "group_md", "MD1"), m("postponed", "knockout_round", "Final")];
    expect(selectTournamentPhase(matches)).toBe("group");
  });

  it("precedence: complete beats playoff when Final completed + knockout in_progress", () => {
    // Unlikely edge — trust the precedence order
    const matches = [
      m("in_progress", "knockout_round", "SF"),
      m("completed", "knockout_round", "Final"),
    ];
    expect(selectTournamentPhase(matches)).toBe("complete");
  });

  it("precedence: playoff beats group when both have kicked off", () => {
    const matches = [
      m("in_progress", "group_md", "MD1"),
      m("in_progress", "knockout_round", "R32"),
    ];
    expect(selectTournamentPhase(matches)).toBe("playoff");
  });

  it("a lone scheduled knockout match does NOT trigger playoff (not kicked off)", () => {
    const matches = [m("completed", "group_md", "MD1"), m("scheduled", "knockout_round", "R32")];
    expect(selectTournamentPhase(matches)).toBe("group");
  });
});

// ─── live-bug regression (Prompt 44) ───────────────────────────────────────────────────────
// The live BALLDONTLIE feed populates fifa_match.round with the MATCHDAY NUMBER ("1") for group
// games. The retired round-based selector keyed group↔knockout on `round !== null`, so an
// in_progress/completed group matchday (round = "1", non-null) fired the knockout branch and the
// dashboard rendered the playoff interim WHILE THE TOURNAMENT WAS STILL IN THE GROUP STAGE. Keying
// on period.kind instead of round fixes it. These cases reproduce the live MD1 distribution.

describe("selectTournamentPhase — Prompt-44 live-MD1 regression (period.kind discriminator)", () => {
  it("group_md in_progress/completed + scheduled knockouts → 'group' (NOT 'playoff')", () => {
    // Mirrors the live DB: 1 in_progress + 5 completed group_md MD1 rows (round would be "1"),
    // 66 scheduled group_md (MD1/2/3), 31 scheduled knockout_round (R32…Final).
    const matches = [
      m("in_progress", "group_md", "MD1"),
      m("completed", "group_md", "MD1"),
      m("scheduled", "group_md", "MD2"),
      m("scheduled", "group_md", "MD3"),
      m("scheduled", "knockout_round", "Round of 32"),
      m("scheduled", "knockout_round", "Final"),
    ];
    expect(selectTournamentPhase(matches)).toBe("group");
  });

  it("a lone scheduled knockout_round (no kicked-off knockout) never triggers playoff", () => {
    expect(selectTournamentPhase([m("scheduled", "knockout_round", "Round of 32")])).toBe(
      "pre-kickoff",
    );
    expect(
      selectTournamentPhase([
        m("completed", "group_md", "MD1"),
        m("scheduled", "knockout_round", "Round of 32"),
      ]),
    ).toBe("group");
  });

  it("a non-null matchday-style label on a group_md match does not imply knockout", () => {
    // The selector must ignore the label entirely for group games — only period.kind decides.
    expect(selectTournamentPhase([m("completed", "group_md", "1")])).toBe("group");
    expect(selectTournamentPhase([m("in_progress", "group_md", "3")])).toBe("group");
  });
});

// ─── unseeded periods (periodKind === null) ────────────────────────────────────────────────

describe("selectTournamentPhase — unlinked periods (periodKind null) advance no phase", () => {
  it("kicked-off matches with no linked period stay 'pre-kickoff' (cannot classify)", () => {
    const matches = [m("in_progress", null, null), m("completed", null, null)];
    expect(selectTournamentPhase(matches)).toBe("pre-kickoff");
  });
});

// ─── exhaustiveness runtime guard ────────────────────────────────────────────────────────

describe("selectTournamentPhase — all MatchStatus values handled without throw", () => {
  it("exhaustiveness: all MatchStatus values round-trip safely", () => {
    const all: MatchStatus[] = ["scheduled", "in_progress", "completed", "postponed", "abandoned"];
    for (const status of all) {
      expect(() =>
        selectTournamentPhase([{ status, periodKind: null, periodLabel: null }]),
      ).not.toThrow();
    }
  });
});
