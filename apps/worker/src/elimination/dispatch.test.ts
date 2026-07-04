import { describe, it, expect } from "vitest";
import { dispatchTeamElimination } from "./dispatch";
import { MemoryTeamEliminationStore, type SeedFifaMatch } from "./memoryStore";

/**
 * The resident-tick WC TEAM-ELIMINATION driver (feat/auto-team-elimination). Each tick reads the
 * FREEZE-GATED completed knockout fixtures, derives the union of losers via the pure
 * `selectEliminatedTeamIds`, and flags them through the guarded, set-only, GLOBAL write. Exercised DB-free
 * against the in-memory double, which mirrors BOTH the prismaStore's read filter (status='completed' AND
 * period.kind='knockout_round' AND period.frozen_at NOT NULL) and its guarded, set-only write. There is no
 * cron and no dual-writer: a missed flag is self-healing (the idempotent 60s tick re-derives it).
 */

function koMatch(
  over: Partial<SeedFifaMatch> & { homeTeamId: string; awayTeamId: string },
): SeedFifaMatch {
  return {
    status: "completed",
    periodKind: "knockout_round",
    periodFrozen: true,
    homeScore: null,
    awayScore: null,
    homeScoreEt: null,
    awayScoreEt: null,
    homeScorePens: null,
    awayScorePens: null,
    ...over,
  };
}

describe("dispatchTeamElimination — the resident-tick team-elimination writer", () => {
  it("flags the losers of frozen, completed knockout matches (winners stay alive)", async () => {
    const store = new MemoryTeamEliminationStore([
      koMatch({ homeTeamId: "BRA", awayTeamId: "KOR", homeScore: 4, awayScore: 1 }), // KOR out
      koMatch({
        homeTeamId: "CRO",
        awayTeamId: "JPN",
        homeScore: 1,
        awayScore: 1,
        homeScorePens: 3,
        awayScorePens: 1,
      }), // JPN out on pens
    ]);

    const res = await dispatchTeamElimination(store);

    expect(res.flagged).toEqual(["JPN", "KOR"]);
    expect(store.isEliminated("KOR")).toBe(true);
    expect(store.isEliminated("JPN")).toBe(true);
    expect(store.isEliminated("BRA")).toBe(false);
    expect(store.isEliminated("CRO")).toBe(false);
  });

  it("ignores a completed knockout match whose period is NOT frozen (the freeze gate)", async () => {
    const store = new MemoryTeamEliminationStore([
      koMatch({
        homeTeamId: "ARG",
        awayTeamId: "MEX",
        homeScore: 2,
        awayScore: 0,
        periodFrozen: false,
      }),
    ]);

    const res = await dispatchTeamElimination(store);

    expect(res.flagged).toEqual([]);
    expect(store.isEliminated("MEX")).toBe(false); // round not final yet → not flagged
    expect(store.flagCalls).toBe(0);
  });

  it("ignores group-stage (group_md) matches — only a knockout loss eliminates", async () => {
    const store = new MemoryTeamEliminationStore([
      koMatch({
        homeTeamId: "GER",
        awayTeamId: "JPN",
        homeScore: 1,
        awayScore: 2,
        periodKind: "group_md",
      }),
    ]);

    const res = await dispatchTeamElimination(store);

    expect(res.flagged).toEqual([]);
    expect(store.isEliminated("GER")).toBe(false); // a group loss is not a WC elimination
  });

  it("ignores the period-less 3rd-place match (period_id NULL → excluded by the knockout join)", async () => {
    const store = new MemoryTeamEliminationStore([
      koMatch({
        homeTeamId: "CRO",
        awayTeamId: "MAR",
        homeScore: 2,
        awayScore: 1,
        periodKind: null,
      }),
    ]);

    const res = await dispatchTeamElimination(store);

    expect(res.flagged).toEqual([]);
    expect(store.isEliminated("MAR")).toBe(false); // its two teams are already-flagged semifinal losers
  });

  it("is idempotent: an already-flagged loser produces an empty write on the next tick", async () => {
    const store = new MemoryTeamEliminationStore(
      [koMatch({ homeTeamId: "BRA", awayTeamId: "KOR", homeScore: 4, awayScore: 1 })],
      { KOR: true }, // already eliminated (a prior tick flagged it)
    );

    const res = await dispatchTeamElimination(store);

    expect(res.flagged).toEqual([]); // nothing NEW to flag
    expect(store.isEliminated("KOR")).toBe(true); // stays eliminated (never un-flagged)
    expect(store.flagCalls).toBe(1); // the guarded write ran but flipped nothing
  });

  it("group-stage steady state (no frozen knockout round yet) opens no write at all", async () => {
    const store = new MemoryTeamEliminationStore([
      koMatch({
        homeTeamId: "ARG",
        awayTeamId: "MEX",
        homeScore: 2,
        awayScore: 0,
        periodKind: "group_md",
      }),
    ]);

    const res = await dispatchTeamElimination(store);

    expect(res.flagged).toEqual([]);
    expect(store.flagCalls).toBe(0); // the loser union is empty → flagEliminated is never called
  });
});
