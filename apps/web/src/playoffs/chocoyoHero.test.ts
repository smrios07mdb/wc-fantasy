import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Source-contract smoke for the /playoffs CHOCOYO hero re-skin (feat/playoffs-chocoyo-reskin).
 *
 * A source smoke CANNOT prove the screen renders (that is the job of the real-browser render harness,
 * apps/web/scripts/verify-playoffs-hero.mjs — the .po-parrot glyph "passed green" here once and shipped
 * INVISIBLE). This is the ADDITIVE half: it pins the wiring the harness replica mirrors — the exact copy,
 * the pure-SVG machete (no raster dependency), the trophy mark, the victim-strike parity, the clockless
 * client-side blade state machine — so the real component can never silently drift from what the harness
 * screenshots. Presentation-only: no loader/engine/view-model assertion (those stay byte-untouched).
 */
const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "../../app");
const read = (rel: string) => readFileSync(resolve(appDir, rel), "utf8");

const client = read("playoffs/PlayoffsClient.tsx");
const components = read("playoffs/components.tsx");
const css = read("playoffs/playoffs.css");

describe("playoffs — Chocoyo hero re-skin (source contract)", () => {
  it("drops the old tiny .po-parrot glyph entirely (it shipped invisible; the hero owns the mascot now)", () => {
    expect(client).not.toContain('className="po-parrot"');
    expect(client).not.toContain('src="/brand/parrot.png"');
    expect(css).not.toMatch(/^\.po-parrot\s*\{/m);
  });

  it("ports the machete as a PURE inline SVG (no raster edge) with the functional --elim cutting edge", () => {
    // The blade is the .po-act-blade SVG; its belly carries the --elim red via .po-machete-edge (CSS stroke).
    expect(components).toContain('className="po-act-blade"');
    expect(components).toContain('className="po-machete-edge"');
    expect(components).toContain('viewBox="0 0 152 58"');
    expect(css).toMatch(/\.po-machete-edge\s*\{[^}]*stroke:\s*var\(--elim\)/);
  });

  it("renders the Chocoyo act: the trophy mark (Chocoyo peeking out) + the executioner caption", () => {
    expect(components).toContain('src="/brand/trophy.png"');
    expect(components).toContain('className="po-act-fig"');
    expect(components).toContain("Chocoyo · your executioner");
  });

  it("binds the marquee copy to the view-model (dynamic cut/counts) with the static Chocoyo strings", () => {
    // Headline: "LOWEST {cutCount} GET THE CHOP" → "CHOP!" on the drop.
    expect(components).toContain("LOWEST ${cut} GET THE CHOP");
    expect(components).toContain('"CHOP!"');
    // Static subcopy + actor line + the substats line (still standing / get chopped / advance).
    expect(components).toContain("The Chocoyo doesn");
    expect(components).toContain("still standing");
    expect(components).toContain("get chopped");
    expect(components).toContain("advance");
    // The doomed list is the view-model's eliminatedIds (never a browser re-derivation).
    expect(components).toContain("round.eliminatedIds");
    // Round framing binds to totalRounds / the focus round idx, never a hardcoded field size.
    expect(components).toContain("of {view.totalRounds}");
  });

  it("strikes the doomed with the cross-surface row-elim treatment (text-tertiary + line-through in --elim)", () => {
    // Hero block + the survivor rows/ladder/mobile rows all carry the --elim strike colour (waivers parity).
    const strikeColour = (css.match(/text-decoration-color:\s*var\(--elim\)/g) ?? []).length;
    expect(strikeColour).toBeGreaterThanOrEqual(4);
  });

  it("keeps the hero route-scoped in playoffs.css, never added to the shared ds.css", () => {
    expect(css).toMatch(/^\.po-hero\s*\{/m);
    expect(css).toMatch(/^\.po-act\s*\{/m);
    expect(css).toMatch(/^\.mpo-hero\s*\{/m);
  });

  it("threads the client blade choreography into BOTH the desktop and mobile hero", () => {
    // The DesktopPlayoffs/MobilePlayoffs both receive drop={drop}; the hero reads it.
    const dropProps = (client.match(/drop=\{drop\}/g) ?? []).length;
    expect(dropProps).toBe(2);
    expect(components).toContain("interface HeroDrop");
    expect(components).toContain("bladeStateOf");
  });
});

describe("playoffs — the blade state machine is client-side + clockless (source contract)", () => {
  it("detects the live→past round flip via a transition latch (never a server clock)", () => {
    // The latch compares the previous render's per-round status to the current one.
    expect(client).toContain('prev[i] === "live"');
    expect(client).toContain('=== "past"');
    expect(client).toMatch(/prevStatusRef/);
  });

  it("runs the wind → drop → settle phases as a ONE-TIME choreography (not a loop)", () => {
    expect(client).toContain('phase: "wind"');
    expect(client).toContain('phase: "drop"');
    expect(client).toContain('phase: "rest"');
    expect(client).toContain("BLADE_WIND_MS");
    expect(client).toContain("BLADE_SETTLE_MS");
  });

  it("respects prefers-reduced-motion (no choreography; settled/raised states only)", () => {
    expect(client).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(client).toContain("reducedMotionRef");
    // The CSS also gates every sway/swing behind (prefers-reduced-motion: no-preference).
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("gates the idle blade animation so it never re-swings on load for an already-past round", () => {
    // The sway only runs when the hero is NOT in any dropped/wind state (a settled past round stays static).
    expect(css).toContain(":not(.is-wind):not(.is-drop):not(.is-dropped)");
  });
});

// Regression pins from the adversarial review (the render harness proves these by paint; these are the
// fast-layer belt-and-suspenders so a future edit can't silently reintroduce either bug).
describe("playoffs — Chocoyo hero: reduced-motion + champion-tone regressions", () => {
  it("gates the trophy `po-squawk` wobble behind prefers-reduced-motion (`is-dropped` is a REST state)", () => {
    // `.is-dropped` mounts on the champion hero AND any settled past round, so an UNGATED `.po-act-fig`
    // squawk fires on load under reduce. The squawk must live INSIDE the no-preference block, nowhere before.
    const anchor = css.indexOf("@media (prefers-reduced-motion: no-preference)");
    expect(anchor).toBeGreaterThan(-1);
    expect(css.slice(0, anchor)).not.toContain("po-squawk");
    expect(css.slice(anchor)).toContain("po-squawk");
  });

  it("renders the champion endgame CELEBRATORY on mobile too (`is-champion`, not the cut-red)", () => {
    // The mobile hero reuses `.is-dropped` for champion, so it MUST also carry `is-champion` + a win/accent
    // headline override — otherwise the "You win" reads in `--elim` (elimination red).
    expect(components).toContain("mpo-hero is-champion is-dropped");
    expect(css).toMatch(/\.mpo-hero\.is-champion\s+\.mpo-headline\s*\{[^}]*color:\s*var\(--win\)/);
  });
});
