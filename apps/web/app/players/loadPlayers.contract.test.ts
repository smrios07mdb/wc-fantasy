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

  it("builds the row STATLINE from a stat_player_match groupBy over appearances (minutes > 0)", () => {
    expect(loader).toContain("prisma.statPlayerMatch.groupBy(");
    expect(loader).toContain("where: { minutesPlayed: { gt: 0 } }");
    expect(loader).toContain("_count: true"); // PLD = appearances
    // Real promoted columns only — SH sources the promoted shots_on_target (no raw-shots column).
    for (const col of [
      "minutesPlayed",
      "goals",
      "assists",
      "shotsOnTarget",
      "keyPasses",
      "tacklesWon",
    ]) {
      expect(loader).toContain(`${col}: true`);
    }
  });

  it("YC is a REAL display-only count from event_match via the SHARED classifyCard (single source)", () => {
    // reuse the shared classifier (@app/recompute) so a booking is counted like the game-detail Events
    // surface — importing an EXISTING pure export is not an engine change.
    expect(loader).toContain('from "@app/recompute"');
    expect(loader).toContain("classifyCard");
    expect(loader).toContain("prisma.eventMatch.findMany");
    expect(loader).toContain('incidentType: { equals: "card"');
    expect(loader).toContain("e.rescinded"); // rescinded rows excluded (mirrors buildGameDetail)
    expect(loader).toContain('classifyCard(e) === "yellow"');
    expect(loader).toContain("ycByPlayer.get(playerId) ?? 0");
  });

  it("the event_match read is READ-ONLY (no write/create/update) and there is NO migration/engine run", () => {
    for (const forbidden of [
      "eventMatch.create",
      "eventMatch.update",
      "eventMatch.delete",
      "eventMatch.upsert",
    ]) {
      expect(loader).not.toContain(forbidden);
    }
    // recompute is reused by IMPORT only — the loader must not re-run scoring/recompute.
    expect(loader).not.toContain("scorePlayerMatch(");
    expect(loader).not.toContain("recompute(");
  });

  it("CS stays the ONE remaining gap (null) — never fabricated/derived", () => {
    expect(loader).toContain("cleanSheets: null");
  });

  it("R3: seasonPoints uses the SAME groupBy aggregation shape as loadWaivers (single source)", () => {
    const line = 'prisma.scorePlayerMatch.groupBy({ by: ["playerId"], _sum: { points: true } })';
    const waivers = read("../waivers/loadWaivers.ts");
    expect(loader).toContain(line);
    expect(waivers).toContain(line); // the exact shape both loaders share — if waivers drifts, this fails
    expect(loader).toContain("seasonPoints: seasonByPlayer.get(p.id) ?? null");
  });

  it("derives the FA-window phase from acquisitionWindowState (not re-derived)", () => {
    expect(loader).toContain("acquisitionWindowState");
    expect(loader).toContain('from "@app/faab"');
    expect(loader).toContain("acquisitionWindowState(");
    expect(loader).toContain("selectCurrentPeriod(periodRows");
  });

  it("CUTOFF-TAG: exposes the effective batch instant via effectiveBatchAt, sealed-bid ONLY (mirrors loadWaivers)", () => {
    // Reuse the SAME shared `effectiveBatchAt` (override ?? firstKickoff − lead) loadWaivers uses — no new
    // query shape (waiverBatchAt just joins the existing period select), and the lead resolves via the
    // SAME env fallback so the two surfaces can never drift.
    expect(loader).toContain("effectiveBatchAt");
    expect(loader).toContain("DEFAULT_FAAB_BATCH_LEAD_MIN");
    expect(loader).toContain("waiverBatchAt: true");
    // Sealed-bid gate — batchAtIso is null in free-agency / locked (exactly loadWaivers' countdownToIso).
    expect(loader).toContain('windowPhase === "sealed-bid"');
    expect(loader).toContain("batchAtIso");
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

  it("PLAYERS-DATA-scope: scopes the pool to the fifa_match home∪away participant set", () => {
    // Derives the participant set + filters the pool via the unit-pinned pure helpers (playersLogic).
    expect(loader).toContain("participantTeamIds(scheduleTeamRows)");
    expect(loader).toContain("scopeToParticipants(playerRows, participants)");
    // Rows are built from the SCOPED pool, never the raw playerRows.
    expect(loader).toContain("scopedPlayerRows.map");
    expect(loader).not.toContain("playerRows.map");
  });

  it("PLAYERS-DATA-scope: the participant read is the fifa_match team FKs — NOT group_id, NOT a list", () => {
    // A dedicated two-column schedule read (home/away FKs) backs the predicate.
    expect(loader).toContain(
      "prisma.fifaMatch.findMany({ select: { homeTeamId: true, awayTeamId: true } })",
    );
    // group_id is never READ as the participant signal (it is NULL for every team) — assert the
    // Prisma field form (camelCase `groupId`), so the DECISIONS rationale may still name `group_id`
    // in prose. No hardcoded country/team allow-list either: the set is derived purely from the FKs.
    expect(loader).not.toContain("groupId");
  });

  it("does NOT touch migration/schema/RLS/Realtime (page-load snapshot only)", () => {
    // No Realtime channel / publication wiring, no RLS GUC juggling in a read-only browser loader.
    expect(loader).not.toContain(".channel(");
    expect(loader).not.toContain("app.commish_override");
  });
});
