import { describe, it, expect } from "vitest";
import type { MatchStatus } from "@app/shared";
import { selectTournamentPhase, type TournamentMatchSummary } from "./selectTournamentPhase";

// ─── helpers ─────────────────────────────────────────────────────────────────────────────

function m(status: MatchStatus, round: string | null = null): TournamentMatchSummary {
  return { status, round };
}

// ─── phase detection ─────────────────────────────────────────────────────────────────────

describe("selectTournamentPhase — TournamentMatchSummary[] → TournamentPhase (pure, IO-free)", () => {
  it("returns 'pre-kickoff' when no matches exist (no fixtures loaded)", () => {
    expect(selectTournamentPhase([])).toBe("pre-kickoff");
  });

  it("returns 'pre-kickoff' when all matches are scheduled (group)", () => {
    const matches = [m("scheduled", null), m("scheduled", null), m("scheduled", null)];
    expect(selectTournamentPhase(matches)).toBe("pre-kickoff");
  });

  it("returns 'pre-kickoff' when all matches are postponed (not kicked off)", () => {
    expect(selectTournamentPhase([m("postponed", null)])).toBe("pre-kickoff");
  });

  it("returns 'group' when any group match (round=null) is in_progress", () => {
    const matches = [m("scheduled", null), m("in_progress", null), m("scheduled", null)];
    expect(selectTournamentPhase(matches)).toBe("group");
  });

  it("returns 'group' when any group match (round=null) is completed", () => {
    const matches = [m("completed", null), m("scheduled", null)];
    expect(selectTournamentPhase(matches)).toBe("group");
  });

  it("returns 'group' when any group match (round=null) is abandoned", () => {
    expect(selectTournamentPhase([m("abandoned", null)])).toBe("group");
  });

  it("returns 'group' even when some group matches are postponed (postponed != kicked off)", () => {
    const matches = [m("postponed", null), m("completed", null), m("scheduled", null)];
    expect(selectTournamentPhase(matches)).toBe("group");
  });

  it("returns 'playoff' when any knockout match (round non-null) is in_progress", () => {
    const matches = [
      m("completed", null), // group match done
      m("in_progress", "R32"), // knockout kicked off
      m("scheduled", "R32"),
    ];
    expect(selectTournamentPhase(matches)).toBe("playoff");
  });

  it("returns 'playoff' when any knockout match is completed (but not the Final)", () => {
    const matches = [m("completed", null), m("completed", "R32"), m("scheduled", "R16")];
    expect(selectTournamentPhase(matches)).toBe("playoff");
  });

  it("returns 'playoff' for QF, SF without the Final done", () => {
    const matches = [
      m("completed", null),
      m("completed", "QF"),
      m("in_progress", "SF"),
      m("scheduled", "Final"),
    ];
    expect(selectTournamentPhase(matches)).toBe("playoff");
  });

  it("returns 'complete' when the Final match is completed", () => {
    const matches = [
      m("completed", null),
      m("completed", "R32"),
      m("completed", "QF"),
      m("completed", "SF"),
      m("completed", "Final"),
    ];
    expect(selectTournamentPhase(matches)).toBe("complete");
  });

  it("returns 'complete' even if other matches are not completed (Final is the signal)", () => {
    // Edge: an abandoned group match + completed Final
    const matches = [m("abandoned", null), m("completed", "Final")];
    expect(selectTournamentPhase(matches)).toBe("complete");
  });

  it("does NOT return 'complete' for an in_progress Final (not yet done)", () => {
    const matches = [m("completed", null), m("in_progress", "Final")];
    expect(selectTournamentPhase(matches)).toBe("playoff");
  });

  it("does NOT return 'complete' for a postponed Final", () => {
    const matches = [m("completed", null), m("postponed", "Final")];
    expect(selectTournamentPhase(matches)).toBe("group");
  });

  it("precedence: complete beats playoff when Final completed + knockout in_progress", () => {
    // Unlikely edge — trust the precedence order
    const matches = [m("in_progress", "SF"), m("completed", "Final")];
    expect(selectTournamentPhase(matches)).toBe("complete");
  });

  it("precedence: playoff beats group when both have kicked off", () => {
    const matches = [m("in_progress", null), m("in_progress", "R32")];
    expect(selectTournamentPhase(matches)).toBe("playoff");
  });

  it("a lone scheduled knockout match does NOT trigger playoff (not kicked off)", () => {
    const matches = [m("completed", null), m("scheduled", "R32")];
    expect(selectTournamentPhase(matches)).toBe("group");
  });
});

// ─── exhaustiveness runtime guard ────────────────────────────────────────────────────────

describe("selectTournamentPhase — all MatchStatus values handled without throw", () => {
  it("exhaustiveness: all MatchStatus values round-trip safely", () => {
    const all: MatchStatus[] = ["scheduled", "in_progress", "completed", "postponed", "abandoned"];
    for (const status of all) {
      expect(() => selectTournamentPhase([{ status, round: null }])).not.toThrow();
    }
  });
});
