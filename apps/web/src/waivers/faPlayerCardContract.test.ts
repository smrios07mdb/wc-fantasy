/**
 * Source-contract smoke for the Free Agents / Waivers player card (Prompt 56):
 *   • the card REUSES the shared `PlayerStatsTab` body — it must import it (and the eager hook) and must
 *     NOT carry a duplicated Stats render (no `pc-tiles`/`pc-loghead`/`GameRow` of its own);
 *   • the new affordance styles live in route-scoped `waivers.css`, NEVER in the global `ds.css` — and
 *     the `.pc-*` chrome the card consumes is still the dormant ds.css definition (consumed, not forked).
 *
 * Pure fs reads — no DOM, no fetch. The working user path is proven separately in faPlayerCard.test.tsx.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel: string) => readFileSync(here(rel), "utf8");

describe("FaPlayerCardSheet — source contract", () => {
  const card = read("./FaPlayerCardSheet.tsx");

  it("imports the shared PlayerStatsTab + usePlayerTournamentStats (single source of the Stats body)", () => {
    expect(card).toContain('from "@/components/PlayerStatsTab"');
    expect(card).toContain("PlayerStatsTab");
    expect(card).toContain("usePlayerTournamentStats");
  });

  it("carries NO duplicated Stats render body (delegates entirely to the shared component)", () => {
    expect(card).not.toContain("pc-tiles");
    expect(card).not.toContain("pc-loghead");
    expect(card).not.toContain("function GameRow");
  });
});

describe("new affordance styles are route-scoped — ds.css is untouched", () => {
  const dsFiles = [
    "../../app/styles/ds.css",
    "../../app/draft/ds.css",
    "../../app/lineup/ds.css",
    "../../app/vsfield/ds.css",
  ].map(read);
  const waiversCss = read("./waivers.css");

  it("the new .wv-comp-fa-info control lives in waivers.css, not in any ds.css", () => {
    expect(waiversCss).toContain(".wv-comp-fa-info");
    expect(waiversCss).toContain(".wv-comp-fa-wrap");
    for (const ds of dsFiles) expect(ds).not.toContain("wv-comp-fa-info");
  });

  it("the .pc-* card chrome the card consumes is still the dormant ds.css definition", () => {
    // Present in the global ds.css (root layout) — we consume it, we don't redefine it locally.
    expect(dsFiles[0]).toContain(".pc-scrim");
    expect(dsFiles[0]).toContain(".pc-sheet");
    expect(waiversCss).not.toContain(".pc-sheet {");
  });
});
