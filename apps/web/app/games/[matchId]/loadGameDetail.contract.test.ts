/**
 * Source-contract smoke for the Game Detail loader (T5/T6). The loader needs a live DB (no unit test —
 * the pure `buildGameDetail` suite covers the assembly), so this pins the SEAMS at the source level: it
 * threads the pure builder, reads the already-scored rows, derives nation from the team join (NEVER the
 * player.country scalar), keys the owner overlay on the match's PERIOD, guards a null period, and writes
 * NOTHING (read-only invariant). Mirrors `loadPlayoffs.contract.test.ts`.
 *
 * Pure fs reads — no DOM, no DB.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const loader = read("./loadGameDetail.ts");
/** Source with comments stripped — so assertions key on real code, not the doc comment (which
 *  legitimately NAMES player.country / the score tables to explain what the loader avoids/reads). */
const codeOnly = loader.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("loadGameDetail — assembly contract", () => {
  it("assembles the view via the pure builder (assembly lives there, not here)", () => {
    expect(loader).toContain("buildGameDetail");
    expect(loader).toContain('from "@/src/games/buildGameDetail"');
  });

  it("reads the already-scored / ingested match-keyed rows for the box score", () => {
    expect(codeOnly).toContain("prisma.fifaMatch.findUnique");
    expect(codeOnly).toContain("prisma.matchLineupEntry.findMany");
    expect(codeOnly).toContain("prisma.statPlayerMatch.findMany");
    expect(codeOnly).toContain("prisma.scorePlayerMatch.findMany");
    expect(codeOnly).toContain("prisma.eventMatch.findMany");
    // T16: the approved additive read — source-tagged 0–10 ratings (resolved in the pure builder).
    expect(codeOnly).toContain("prisma.ratingPlayerMatch.findMany");
    // T17: the team-aggregate additive read — display-only, mapped to home/away in the pure builder.
    expect(codeOnly).toContain("prisma.statTeamMatch.findMany");
  });

  it("selects the columns the kickoff-XI reconciliation cascade needs (substitution player_in/out + minutes)", () => {
    // The cascade pairs substitutions (player_out ↔ player_in) and re-adds withdrawn off-sheet starters,
    // so BOTH sub ids must be read; the "no-minute phantom" drop needs minutes_played.
    expect(codeOnly).toContain("playerInId: true");
    expect(codeOnly).toContain("playerOutId: true");
    expect(codeOnly).toContain("minutesPlayed: true");
  });

  it("surfaces the kickoff-XI reconciliation safety net (logs ≠11 anomalies, never swallowed)", () => {
    // The builder returns lineupAnomalies; the loader logs each one (observable) and still renders the view.
    expect(codeOnly).toContain("view.lineupAnomalies");
    expect(codeOnly).toContain("console.warn");
  });

  it("derives nation from the fifa_team join — NEVER the player.country scalar", () => {
    expect(codeOnly).toContain("team: { select: { name: true } }");
    // The country scalar is never selected off player (the P34 discipline).
    expect(codeOnly).not.toContain("country: true");
  });

  it("keys the ownership overlay on THIS match's period (lineup_slot) + active roster, name-resolved server-side", () => {
    expect(codeOnly).toContain("prisma.lineupSlot.findMany");
    expect(codeOnly).toContain("periodId, playerId: { in: playerIds }");
    expect(codeOnly).toContain("prisma.rosterPlayer.findMany");
    expect(codeOnly).toContain("droppedAt: null");
    // Names attached loader-side (the scoped read-model exception) so the browser never reads manager rows.
    expect(codeOnly).toContain("prisma.manager.findMany");
  });

  it("guards a null fantasy-period link (renders the box score with no owner overlay)", () => {
    expect(codeOnly).toContain("if (match.periodId)");
  });

  it("is READ-ONLY — no writes, no engine re-run, no dirty-marking", () => {
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
      "markStatPlayerDirty",
      "recompute",
    ]) {
      expect(codeOnly).not.toContain(write);
    }
  });
});
