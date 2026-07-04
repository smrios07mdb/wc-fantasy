/**
 * Source-contract smoke for the /players loader (PLAYERS-1). The loader needs a live DB (no unit test),
 * so this pins the DATA-DISCIPLINE shape by reading its source:
 *   • nation comes from the `fifa_team` join, NEVER `player.country` (that column is never populated);
 *   • ownership uses the `dropped_at IS NULL`, league-scoped predicate (the `liveOwnedWhere` mirror);
 *   • manager display names are attached SERVER-SIDE (the browser never reads manager rows);
 *   • the loader is READ-ONLY — no create/update/delete/upsert/raw of any kind;
 *   • the FA-window phase is derived from `acquisitionWindowState` (not re-derived);
 *   • R3: seasonPoints uses the SAME `score_player_match` `groupBy` aggregation as loadWaivers.
 *
 * Pure fs reads — no DOM, no DB. The runtime path is exercised by the pure `playersLogic` + RTL suites.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("loadPlayers — data-discipline contract", () => {
  const loader = read("./loadPlayers.ts");

  it("derives nation from the fifa_team join and NEVER selects/reads player.country", () => {
    expect(loader).toContain("team: { select: { name: true, eliminated: true } }");
    expect(loader).toContain("nation: p.team?.name ?? null");
    // The whole point of the stricter select: `country` must not appear as a Prisma field read.
    expect(loader).not.toContain("country: true");
    expect(loader).not.toContain("p.country");
  });

  it("derives nationAlive from fifa_team.eliminated (null team ⇒ alive)", () => {
    expect(loader).toContain("nationAlive: !(p.team?.eliminated ?? false)");
  });

  it("sources ownership from active roster_player (dropped_at IS NULL, league-scoped)", () => {
    expect(loader).toContain("prisma.rosterPlayer.findMany");
    expect(loader).toContain("where: { leagueId, droppedAt: null }");
    expect(loader).toContain("select: { playerId: true, managerId: true }");
  });

  it("attaches manager display names SERVER-SIDE (browser never reads manager rows)", () => {
    expect(loader).toContain("prisma.manager.findMany({ where: { leagueId }");
    expect(loader).toContain("const nameById = new Map");
    expect(loader).toContain("nameById.get(r.managerId)");
  });

  it("R3: seasonPoints uses the SAME groupBy aggregation shape as loadWaivers (single source)", () => {
    const line = 'prisma.scorePlayerMatch.groupBy({ by: ["playerId"], _sum: { points: true } })';
    const waivers = read("../waivers/loadWaivers.ts");
    expect(loader).toContain(line);
    expect(waivers).toContain(line); // the exact shape both loaders share — if waivers drifts, this fails
    expect(loader).toContain("seasonPoints: seasonByPlayer.get(p.id) ?? null");
  });

  it("derives the FA-window phase from acquisitionWindowState (not re-derived)", () => {
    expect(loader).toContain('import { acquisitionWindowState } from "@app/faab"');
    expect(loader).toContain("acquisitionWindowState(");
    expect(loader).toContain("selectCurrentPeriod(periodRows");
  });

  it("is READ-ONLY — no mutation or raw query of any kind", () => {
    for (const forbidden of [
      ".create(",
      ".createMany(",
      ".update(",
      ".updateMany(",
      ".upsert(",
      ".delete(",
      ".deleteMany(",
      "$executeRaw",
      "$queryRaw",
      "$transaction",
    ]) {
      expect(loader).not.toContain(forbidden);
    }
  });

  it("does NOT touch migration/schema/RLS/Realtime (page-load snapshot only)", () => {
    // No Realtime channel / publication wiring, no RLS GUC juggling in a read-only browser loader.
    expect(loader).not.toContain(".channel(");
    expect(loader).not.toContain("app.commish_override");
  });
});
