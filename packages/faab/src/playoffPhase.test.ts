/**
 * Pure unit for the FAAB/waiver PHASE signal (P2 contract fix). The FAAB roster-cap / participation phase is
 * derived from playoff_entry EXISTENCE, NEVER `league.status`:
 *   - `loadPlayoffPhaseActive` is the data-existence predicate (the atomic twin of `league.status='playoff'` —
 *     both are written in the single `applyTransition` $transaction, worker/commish/transitionStore.ts).
 *   - `loadIsPlayoffParticipant` now gates on that boolean (not a LeagueStatus string).
 *   - `rosterCapForPlayoffPhase` is the boolean cap helper, equal to `rosterCapForLeagueStatus` in every
 *     reachable phase.
 * selectTournamentPhase is deliberately NOT the signal here — it returns `group` during the R32 pre-kickoff
 * trim window and `complete` after the Final, either of which would wrongly re-open the cap (DECISIONS §D).
 *
 * Fake `Pick<Db,"playoffEntry">` — no DB. The real Prisma edges are pinned by release.integration.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  rosterCapForLeagueStatus,
  rosterCapForPlayoffPhase,
  PLAYOFF_ROSTER,
  SQUAD_SIZE,
} from "@app/shared";
import { loadPlayoffPhaseActive, loadIsPlayoffParticipant } from "./prismaStore";

type CountDb = Parameters<typeof loadPlayoffPhaseActive>[0];
type FindDb = Parameters<typeof loadIsPlayoffParticipant>[0];

/** Fake whose only surface is `playoffEntry.count`, returning a fixed total and recording its args. */
function countDb(total: number): { db: CountDb; seen: { args: unknown } } {
  const seen: { args: unknown } = { args: undefined };
  const db = {
    playoffEntry: {
      count: async (args: unknown) => {
        seen.args = args;
        return total;
      },
    },
  } as unknown as CountDb;
  return { db, seen };
}

/** Fake whose only surface is `playoffEntry.findUnique`, returning a fixed entry and recording the call. */
function findDb(entry: { status: string } | null): { db: FindDb; seen: { called: boolean } } {
  const seen = { called: false };
  const db = {
    playoffEntry: {
      findUnique: async () => {
        seen.called = true;
        return entry;
      },
    },
  } as unknown as FindDb;
  return { db, seen };
}

describe("loadPlayoffPhaseActive — playoff phase == playoff_entry existence (not league.status)", () => {
  it("false when no playoff_entry rows exist (draft / group / pre-playoff)", async () => {
    expect(await loadPlayoffPhaseActive(countDb(0).db, "L")).toBe(false);
  });

  it("true when ANY playoff_entry row exists (post group→playoff transition)", async () => {
    expect(await loadPlayoffPhaseActive(countDb(1).db, "L")).toBe(true);
    expect(await loadPlayoffPhaseActive(countDb(48).db, "L")).toBe(true);
  });

  it("counts by leagueId only — any entry (incl. eliminated/champion) keeps the phase active", async () => {
    // Must NOT filter status='alive': an all-eliminated-but-champion league is still the playoff phase
    // (this is exactly why we do not reset the cap at tournament-complete — league.status stays 'playoff').
    const { db, seen } = countDb(3);
    expect(await loadPlayoffPhaseActive(db, "L")).toBe(true);
    expect(seen.args).toEqual({ where: { leagueId: "L" } });
  });
});

describe("loadIsPlayoffParticipant — gated on the playoffPhaseActive boolean (not league.status)", () => {
  it("returns true for everyone when the phase is not active — WITHOUT a per-manager lookup", async () => {
    const { db, seen } = findDb(null);
    expect(
      await loadIsPlayoffParticipant(db, {
        playoffPhaseActive: false,
        leagueId: "L",
        managerId: "m",
      }),
    ).toBe(true);
    expect(seen.called).toBe(false); // short-circuits — no DB read off the contract path
  });

  it("returns true for an `alive` entry when the phase is active", async () => {
    expect(
      await loadIsPlayoffParticipant(findDb({ status: "alive" }).db, {
        playoffPhaseActive: true,
        leagueId: "L",
        managerId: "m",
      }),
    ).toBe(true);
  });

  it("returns false for an eliminated entry — or none — when the phase is active", async () => {
    expect(
      await loadIsPlayoffParticipant(findDb({ status: "eliminated" }).db, {
        playoffPhaseActive: true,
        leagueId: "L",
        managerId: "m",
      }),
    ).toBe(false);
    expect(
      await loadIsPlayoffParticipant(findDb(null).db, {
        playoffPhaseActive: true,
        leagueId: "L",
        managerId: "m",
      }),
    ).toBe(false);
  });
});

describe("rosterCapForPlayoffPhase — boolean cap helper, parity with rosterCapForLeagueStatus", () => {
  it("true → playoff cap (9), matching rosterCapForLeagueStatus('playoff')", () => {
    expect(rosterCapForPlayoffPhase(true)).toBe(PLAYOFF_ROSTER.cap);
    expect(rosterCapForPlayoffPhase(true)).toBe(9);
    expect(rosterCapForPlayoffPhase(true)).toBe(rosterCapForLeagueStatus("playoff"));
  });

  it("false → group cap (15), matching every non-playoff status", () => {
    expect(rosterCapForPlayoffPhase(false)).toBe(SQUAD_SIZE);
    expect(rosterCapForPlayoffPhase(false)).toBe(15);
    expect(rosterCapForPlayoffPhase(false)).toBe(rosterCapForLeagueStatus("draft"));
    expect(rosterCapForPlayoffPhase(false)).toBe(rosterCapForLeagueStatus("group"));
    expect(rosterCapForPlayoffPhase(false)).toBe(rosterCapForLeagueStatus("complete"));
  });
});
