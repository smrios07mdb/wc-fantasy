/**
 * Source-contract smoke for The Cut (T15-CUT) — pins the shipped source to the port's contract the
 * same way vsFieldSkin.test.ts pins the Direction-A re-skin, and pins the REAL components to the
 * verify-the-cut.mjs replica's class markers so the render proof can't silently drift from the code.
 *
 * The two P1 copy exclusions live here: the reference ceremony's "FAAB resets to $100" line (rider A
 * — DECISIONS: one-time $100, never reset) and any fabricated pend clock. This suite is the tripwire
 * that keeps them out.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "../..");
const read = (rel: string) => readFileSync(resolve(webDir, rel), "utf8");

const knockoutUI = read("app/vsfield/KnockoutUI.tsx");
const glyph = read("app/vsfield/MacheteGlyph.tsx");
const components = read("app/vsfield/components.tsx");
const client = read("app/vsfield/VsFieldClient.tsx");
const loader = read("app/vsfield/loadVsField.ts");
const css = read("app/vsfield/knockout.css");
const verifyScript = read("scripts/verify-the-cut.mjs");
const playoffsComponents = read("app/playoffs/components.tsx");

describe("The Cut — FAAB copy truth (the excluded P1: never 'resets')", () => {
  it("the ceremony line reads carry-forward and links the waivers route", () => {
    expect(knockoutUI).toContain("Your FAAB carries over");
    expect(knockoutUI).toMatch(/href="\/waivers"/);
  });

  it("no knockout surface ships reset language", () => {
    for (const [name, src] of [
      ["KnockoutUI", knockoutUI],
      ["VsFieldClient", client],
      ["components", components],
      ["knockout.css", css],
    ] as const) {
      expect(src, `${name} must not carry FAAB reset copy`).not.toMatch(/FAAB resets/i);
      expect(src, `${name} must not carry reset-to-100 copy`).not.toMatch(/resets? to \$100/i);
    }
  });

  it("the demoted theater keeps the carry-over explainer", () => {
    expect(playoffsComponents).toContain("carries over");
    expect(playoffsComponents).not.toMatch(/resets? to \$100/i);
  });

  it("the pend arm invents no clock (no fabricated 'official at HH:MM UTC')", () => {
    expect(knockoutUI).toContain("official after stat corrections");
    expect(knockoutUI).not.toMatch(/\d{2}:\d{2}\s*UTC/);
  });
});

describe("The Cut — blade discipline (exactly ONE machete per screen)", () => {
  it("the marquee loom yields to the Damocles blade on the YOU band", () => {
    expect(knockoutUI).toMatch(/viewer\.state !== "block" && <Machete cls="loom"/);
    expect(knockoutUI).toMatch(/state === "block" && <Machete cls="damocles"/);
  });

  it("every blade renders the ONE silhouette from MacheteGlyph (no second machete art)", () => {
    expect(glyph).toContain('className={"ko-mach ');
    expect(glyph).toContain('className="ko-blade"');
    // The knockout surface never defines its own <svg> blade paths outside the glyph module.
    expect(knockoutUI).not.toContain("M26 26 C48 21");
  });
});

describe("The Cut — replica markers (verify-the-cut.mjs renders THESE classes)", () => {
  const markers = [
    "ko-marq",
    "ko-trophy",
    "ko-marq-tx",
    "ko-theater",
    "ko-you",
    "ko-you-ic",
    "ko-you-tx",
    "ko-you-num",
    "ko-you-pts",
    "ko-shape",
    "ko-cut",
    "ko-fallen",
    "ko-dead",
    "ko-dead-tag",
    "ko-champ",
    "ko-medal",
    "ko-ghost",
    "ko-rowwrap",
    "koc",
    "koc-victims",
    "koc-stamp",
    "koc-faab",
  ];
  it("KnockoutUI emits every replica class marker", () => {
    for (const m of markers) expect(knockoutUI, `missing marker ${m}`).toContain(m);
  });
  it("the verify replica uses the same markers (drift tripwire)", () => {
    for (const m of markers) expect(verifyScript, `replica missing ${m}`).toContain(m);
  });
  it("ladder rows carry the block treatment through the shared LbRow/MaRow", () => {
    expect(components).toContain("ko-blocksub");
    expect(components).toMatch(/block = false/);
    expect(components).toContain('from "./MacheteGlyph"');
  });
});

describe("The Cut — loader gate (rider E: group phase composes NO ko sibling)", () => {
  it("ko is gated on the seeded field existing (playoff_entry data-existence)", () => {
    expect(loader).toContain("const knockoutPhaseActive = playoffEntryRows.length > 0;");
    expect(loader).toMatch(/knockoutPhaseActive && orderedKnockoutPeriods\.length > 0/);
  });
  it("the projection runs the REAL ladder core, never a re-derived cut", () => {
    expect(loader).toContain("buildPlayoffsView({");
    expect(loader).toContain("buildKnockoutContext({");
    expect(loader).toContain("loadCumulativeTournamentTotals(prisma, leagueId, participantIds)");
  });
  it("the §27 filter composition is byte-identical (alive ladder still filters)", () => {
    expect(loader).toContain(
      "const field = filterEliminatedFromField(view.field, eliminatedManagerIds, isLivePeriod);",
    );
  });
  it("the ko sibling attaches ONLY on the live knockout wave or the complete default view", () => {
    expect(loader).toMatch(/displayedIsLiveKnockout \|\| \(koCtx\.complete && onDefaultView\)/);
  });
});

describe("The Cut — client fold contracts", () => {
  it("the drill-in sheet rides the EXISTING validated ?manager= param via native history", () => {
    expect(client).toContain('url.searchParams.set("manager", id)');
    expect(client).toContain("window.history.pushState({ koSheet: true }");
    expect(client).toContain('window.addEventListener("popstate", onPop)');
  });
  it("the ceremony fires on the live→past latch (the Chocoyo pattern), never on mount", () => {
    expect(client).toMatch(/prev\[i\] === "live" && s === "past"/);
    expect(client).toContain("prevRoundStatuses");
  });
  it("the sheet mounts on phones only (scroll-lock must never fire on desktop)", () => {
    expect(client).toMatch(/ko && isPhone && effSel !== null && \(\s*<KOSheet/);
  });
  it("K3: the stale cue overrides a nominally-live socket and the controller gets visibility deps", () => {
    expect(client).toContain('stale && conn === "live" ? "stale" : conn');
    expect(client).toContain("visibilitychange");
    expect(client).toContain("onStale: setStale");
  });
});

describe("The Cut — ceremony robustness (F-P3-K4 + the class-driven reveal)", () => {
  it("the victims row wraps (a whole tied set can be cut)", () => {
    expect(css).toMatch(/\.koc-victims\s*\{[^}]*flex-wrap:\s*wrap/);
  });
  it("takeover z-scale sits above the bottom nav with the pre-T15-2 note", () => {
    expect(css).toMatch(/\.ko-sheetwrap\s*\{[^}]*z-index:\s*110/);
    expect(css).toMatch(/\.koc\s*\{[^}]*z-index:\s*120/);
    expect(css).toContain("pre-T15-2");
  });
});
