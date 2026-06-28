/**
 * Source-contract smoke for the FAAB ENFORCEMENT cap migration (CONTRACT-P3, Option B). The four
 * enforcement cap sites in `prismaStore.ts` — `loadBatchContext`, `loadManagerBidContext`,
 * `loadManagerFaContext`, `listOverCapPlayoffSurvivors` — must derive BOTH the roster cap AND the
 * playoff-phase / participant signal from playoff_entry EXISTENCE (`loadPlayoffPhaseActive` →
 * `rosterCapForPlayoffPhase`), NEVER the `league.status` field. This is the same data-existence contract
 * P2 applied to the READ path (`loadReleaseContext` / `loadWaivers`); `rosterCapForLeagueStatus` is now
 * fully retired from `@app/shared`.
 *
 * Mirrors `apps/web/app/waivers/loadWaivers.contract.test.ts`. Pure fs reads — no DOM, no DB. The runtime
 * behavior (the actual cap a real Postgres state produces) is pinned by `enforcementCap.integration.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("FAAB enforcement cap — data-existence source contract (CONTRACT-P3)", () => {
  const store = read("./prismaStore.ts");
  const constants = read("../../shared/src/constants.ts");

  it("the context loads derive the cap from the playoff-phase boolean, not league.status", () => {
    // loadBatchContext / loadManagerBidContext / loadManagerFaContext all return this exact shape.
    expect(store).toContain("rosterCap: rosterCapForPlayoffPhase(playoffPhaseActive)");
  });

  it("computes the phase via loadPlayoffPhaseActive (the playoff_entry-existence predicate)", () => {
    expect(store).toContain("loadPlayoffPhaseActive(prisma, leagueId)");
  });

  it("no enforcement site keys phase/cap on the league.status field", () => {
    expect(store).not.toContain("rosterCapForLeagueStatus");
    expect(store).not.toContain('=== "playoff"');
    expect(store).not.toContain('!== "playoff"');
  });

  it("rosterCapForLeagueStatus is deleted from @app/shared (no status-keyed cap helper remains)", () => {
    expect(constants).not.toContain("rosterCapForLeagueStatus");
  });
});
