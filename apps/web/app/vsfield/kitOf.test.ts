/**
 * kitOf — the flag-kit jersey resolver (pure, no DOM). The contract under test:
 *  - keys are ISO2 resolved via the SHARED flag mapper (toIso2), so full fifa_team names (the
 *    StarterView.nation join), FIFA alpha-3, and alpha-2 all hit the same kit;
 *  - England (no ISO alpha-2) resolves by NAME via the home-nation path, like <Flag>;
 *  - anything unmapped (including Scotland — no kit in the library) falls back to the neutral
 *    surface token, never undefined/throw;
 *  - kits are multi-layer CSS backgrounds (the README cover-gotcha is a CSS concern, but the
 *    multi-layer shape is asserted here so a "simplification" to one layer trips a test).
 */
import { describe, it, expect } from "vitest";
import { JERSEY_BG_V2, KIT_FALLBACK, kitOf } from "./kitOf";

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

  it("resolves England by NAME (home nation — no ISO alpha-2 code)", () => {
    const kit = kitOf("England");
    expect(kit).not.toBe(KIT_FALLBACK);
    expect(kit).toContain("#CF142B"); // St George's Cross red
  });

  it("falls back to the neutral surface token for unmapped nations and null", () => {
    expect(kitOf("Scotland")).toBe(KIT_FALLBACK); // home nation WITHOUT a kit in the library
    expect(kitOf("Wakanda")).toBe(KIT_FALLBACK);
    expect(kitOf(null)).toBe(KIT_FALLBACK);
    expect(kitOf(undefined)).toBe(KIT_FALLBACK);
    expect(kitOf("")).toBe(KIT_FALLBACK);
    expect(KIT_FALLBACK).toBe("var(--surface-4)");
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
