/**
 * Source-contract smoke for the waivers loader's playoff trim-down additions (DECISIONS §D). The loader
 * needs a live DB (no unit test), so this pins the SHAPE: the view it returns must carry the view-driven
 * `rosterCap` (not a hardcoded 15), the D4 `isParticipant` flag, and the static `playoffForfeitDeadlineIso`
 * — and it must source them from the single-source helpers, not re-derive them.
 *
 * Pure fs reads — no DOM, no DB. The runtime path is exercised by the handler + RTL suites.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("loadWaivers — trim-down contract", () => {
  const loader = read("./loadWaivers.ts");

  it("returns the three new view fields", () => {
    expect(loader).toContain("rosterCap: rosterCapForPlayoffPhase(playoffPhaseActive)");
    expect(loader).toContain("isParticipant,");
    expect(loader).toContain("playoffForfeitDeadlineIso,");
  });

  it("sources participation + cap from the single-source helpers (not re-derived)", () => {
    expect(loader).toContain("loadIsPlayoffParticipant");
    expect(loader).toContain("rosterCapForPlayoffPhase");
  });

  it("derives the playoff phase from playoff_entry existence, NOT league.status (P2 contract)", () => {
    // The data-existence phase signal — the atomic twin of league.status='playoff', NOT selectTournamentPhase.
    expect(loader).toContain("loadPlayoffPhaseActive");
    // No phase/cap/participation gate may key on the league.status field or its cap helper.
    expect(loader).not.toContain('=== "playoff"');
    expect(loader).not.toContain("rosterCapForLeagueStatus");
    expect(loader).not.toContain("league?.status");
  });

  it("uses the current-period R32 first kickoff as the conservative forfeit bound", () => {
    expect(loader).toContain("currentPeriodRow.matches[0].kickoffAt.toISOString()");
  });

  it("threads the viewer's PRIVATE watchlist onto the view as a self-scoped id-set (T2)", () => {
    // A self-scoped read (the viewer's own stars), surfaced as an id-set on the view (NOT a per-player flag).
    expect(loader).toContain("prisma.watchlist.findMany");
    expect(loader).toContain("where: { managerId: viewerManagerId }");
    expect(loader).toContain("watchedPlayerIds: watchlistRows.map((w) => w.playerId)");
  });
});
