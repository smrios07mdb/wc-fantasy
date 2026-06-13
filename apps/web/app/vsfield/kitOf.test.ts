/**
 * kitOf — the flag-kit jersey resolver (pure, no DOM). The contract under test:
 *  - keys are ISO2 resolved via the SHARED flag mapper (toIso2), so full fifa_team names (the
 *    StarterView.nation join), FIFA alpha-3, and alpha-2 all hit the same kit;
 *  - England and Scotland (no ISO alpha-2) resolve by NAME via the home-nation path, like <Flag>;
 *  - all 30 in-scope WC2026 nations (8 original + 22 from the approved jersey-gradients handoff)
 *    resolve to a NON-fallback gradient — a grey token in the app means a silent resolution miss;
 *  - anything truly unmapped (and null/empty) falls back to the neutral surface token, never throw;
 *  - kits are multi-layer CSS backgrounds and NONE may carry `cover` (the README render-contract:
 *    background-size:cover collapses the layers to a muddy block).
 */
import { describe, it, expect } from "vitest";
import { JERSEY_BG_V2, KIT_FALLBACK, kitOf } from "./kitOf";

/** Every nation name in scope, as it arrives from the fifa_team.name join. */
const IN_SCOPE_NATIONS = [
  // original 8
  "Argentina",
  "Mexico",
  "France",
  "Croatia",
  "United States",
  "Brazil",
  "Portugal",
  "England",
  // 22 new (approved handoff)
  "Uruguay",
  "Belgium",
  "Côte d'Ivoire",
  "Senegal",
  "Germany",
  "Egypt",
  "Netherlands",
  "Ghana",
  "Spain",
  "Colombia",
  "Ecuador",
  "Austria",
  "Canada",
  "Switzerland",
  "Japan",
  "Türkiye",
  "Morocco",
  "South Korea",
  "Sweden",
  "Norway",
  "Scotland",
  "Czechia",
];

describe("kitOf — nation → jersey background", () => {
  it("resolves full fifa_team names through the shared iso2 mapper", () => {
    expect(kitOf("Argentina")).toBe(JERSEY_BG_V2.AR);
    expect(kitOf("Mexico")).toBe(JERSEY_BG_V2.MX);
    expect(kitOf("France")).toBe(JERSEY_BG_V2.FR);
    expect(kitOf("Croatia")).toBe(JERSEY_BG_V2.HR);
    expect(kitOf("Brazil")).toBe(JERSEY_BG_V2.BR);
    expect(kitOf("Portugal")).toBe(JERSEY_BG_V2.PT);
  });

  it("resolves USA's common aliases and FIFA alpha-3 codes to the same kit", () => {
    expect(kitOf("United States")).toBe(JERSEY_BG_V2.US);
    expect(kitOf("USA")).toBe(JERSEY_BG_V2.US);
    expect(kitOf("POR")).toBe(JERSEY_BG_V2.PT); // FIFA alpha-3 ≠ ISO alpha-3 — the mapper's alias table
    expect(kitOf("CRO")).toBe(JERSEY_BG_V2.HR);
  });

  it("resolves the 22 handoff nations through their full names + FIFA codes", () => {
    expect(kitOf("Uruguay")).toBe(JERSEY_BG_V2.UY);
    expect(kitOf("URU")).toBe(JERSEY_BG_V2.UY); // FIFA alpha-3
    expect(kitOf("Belgium")).toBe(JERSEY_BG_V2.BE);
    expect(kitOf("Senegal")).toBe(JERSEY_BG_V2.SN);
    expect(kitOf("Germany")).toBe(JERSEY_BG_V2.DE);
    expect(kitOf("GER")).toBe(JERSEY_BG_V2.DE); // FIFA alpha-3 (ISO is DEU)
    expect(kitOf("Netherlands")).toBe(JERSEY_BG_V2.NL);
    expect(kitOf("NED")).toBe(JERSEY_BG_V2.NL); // FIFA alpha-3 (ISO is NLD)
    expect(kitOf("Switzerland")).toBe(JERSEY_BG_V2.CH);
    expect(kitOf("SUI")).toBe(JERSEY_BG_V2.CH); // FIFA alpha-3 (ISO is CHE)
    expect(kitOf("South Korea")).toBe(JERSEY_BG_V2.KR);
    expect(kitOf("Czechia")).toBe(JERSEY_BG_V2.CZ);
    expect(kitOf("Türkiye")).toBe(JERSEY_BG_V2.TR);
  });

  it("resolves Côte d'Ivoire with either a straight or a curly apostrophe", () => {
    // fifa_team.name may carry U+0027 (') or U+2019 (’); the shared mapper handles both.
    expect(kitOf("Côte d'Ivoire")).toBe(JERSEY_BG_V2.CI);
    expect(kitOf("Côte d’Ivoire")).toBe(JERSEY_BG_V2.CI);
    expect(kitOf("CIV")).toBe(JERSEY_BG_V2.CI); // FIFA alpha-3
  });

  it("resolves England AND Scotland by NAME (home nations — no ISO alpha-2 code)", () => {
    const eng = kitOf("England");
    expect(eng).not.toBe(KIT_FALLBACK);
    expect(eng).toContain("#CF142B"); // St George's Cross red

    const sco = kitOf("Scotland");
    expect(sco).not.toBe(KIT_FALLBACK);
    expect(sco).toContain("#0065BF"); // Saltire blue
  });

  it("resolves EVERY in-scope nation to a non-fallback gradient (a grey token = a miss)", () => {
    const misses = IN_SCOPE_NATIONS.filter((n) => kitOf(n) === KIT_FALLBACK);
    expect(misses).toEqual([]);
    expect(IN_SCOPE_NATIONS).toHaveLength(30);
  });

  it("falls back to the neutral surface token for unmapped nations and null", () => {
    expect(kitOf("Wakanda")).toBe(KIT_FALLBACK);
    expect(kitOf(null)).toBe(KIT_FALLBACK);
    expect(kitOf(undefined)).toBe(KIT_FALLBACK);
    expect(kitOf("")).toBe(KIT_FALLBACK);
    expect(KIT_FALLBACK).toBe("var(--surface-4)");
  });

  it("never sets background-size:cover on any kit (the README render-contract guard)", () => {
    // Across the whole library AND every in-scope resolved kit — cover collapses the layers.
    for (const bg of Object.values(JERSEY_BG_V2)) expect(bg).not.toContain("cover");
    for (const n of IN_SCOPE_NATIONS) expect(kitOf(n)).not.toContain("cover");
  });

  it("keeps the multi-layer kit shape (the cover-gotcha guard) — layered backgrounds stay layered", () => {
    // Argentina = sun dot over horizontal tricolor; USA = canton + stripes; Brazil = two dots + field
    const ar = JERSEY_BG_V2.AR ?? "";
    const br = JERSEY_BG_V2.BR ?? "";
    expect(ar.split("radial-gradient").length - 1).toBe(1);
    expect(ar).toContain("linear-gradient(180deg");
    expect(JERSEY_BG_V2.US).toContain("repeating-linear-gradient");
    expect(br.split("radial-gradient").length - 1).toBe(2);
  });
});
