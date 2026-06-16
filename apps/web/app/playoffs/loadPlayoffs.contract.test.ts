/**
 * Source-contract smoke for the playoff loader. The loader needs a live DB (no unit test — the gated
 * `loadPlayoffs.integration.test.ts` covers the runtime reads, the pure `buildPlayoffsView` suite covers
 * the assembly), so this pins the SEAMS at the source level: it assembles the §21 view via the pure
 * builder, reuses the SAME cut decision + cumulative derivation the apply path uses, threads the existing
 * lineup/FAAB reads rather than reimplementing them, and writes NOTHING (read-only invariant).
 *
 * Pure fs reads — no DOM, no DB.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const loader = read("./loadPlayoffs.ts");
/** Source with comments stripped — so the read-only assertions key on real code, not the doc comment
 *  (which legitimately NAMES `league.status` / writes to explain what the loader deliberately avoids). */
const codeOnly = loader.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("loadPlayoffs — assembly contract", () => {
  it("assembles the §21 view via the pure builder (classification lives there, not here)", () => {
    expect(loader).toContain("buildPlayoffsView");
    expect(loader).toContain('from "@app/recompute"');
  });

  it("reuses the existing lineup + FAAB reads for reducedLineup / reinforcement (no reimplementation)", () => {
    expect(loader).toContain("loadLineup(viewerManagerId)");
    expect(loader).toContain("loadWaivers(viewerManagerId)");
    expect(loader).toContain("reducedLineup");
    expect(loader).toContain("reinforcement");
  });

  it("reads the knockout ladder, the seeded field, and the group periods", () => {
    expect(loader).toContain('kind: "knockout_round"');
    expect(loader).toContain('kind: "group_md"');
    expect(loader).toContain("prisma.playoffEntry.findMany");
  });

  it("derives the cumulative total via the SHARED loadCumulativeTournamentTotals helper (single-sourced with the apply path)", () => {
    // The boundary tiebreak is the SAME cumulative total the apply path computes — BOTH paths call the one
    // canonical helper (its period scoping lives once), so they cannot drift. It passes its OWN participant
    // set; the inline cumulative query is gone — the period scoping no longer lives in this loader.
    expect(loader).toContain('from "@app/recompute/prisma"');
    expect(loader).toContain("loadCumulativeTournamentTotals(prisma, leagueId, participantIds)");
    expect(codeOnly).not.toContain("period: { leagueId }");
  });

  it("orders the ladder by the canonical KNOCKOUT_ROUNDS index", () => {
    expect(loader).toContain("KNOCKOUT_ROUNDS.indexOf");
  });

  it("is READ-ONLY — no writes, no league.status mutation", () => {
    for (const write of [
      ".create(",
      ".createMany(",
      ".update(",
      ".updateMany(",
      ".upsert(",
      ".delete(",
      ".deleteMany(",
      "$transaction",
      "$executeRaw",
    ]) {
      expect(codeOnly).not.toContain(write);
    }
    // It never touches league.status (the routing decision is the screens thread's). It DOES read
    // playoff_entry.status — that is the authoritative source of the past-round states.
    expect(codeOnly).not.toContain("league.status");
    expect(codeOnly).not.toContain("league.update");
  });
});
