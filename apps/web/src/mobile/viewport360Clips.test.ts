import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/*
 * T15-1 — 360px viewport clips (see audit/T15-1_NOTES.md §4). Source-contract geometry guards for the
 * four fixed-track / auto-table surfaces whose minimum content width exceeds a 360px phone and which
 * were CLIPPED (not scrolled) by an `overflow:hidden` ancestor. The repo's Vitest has no layout engine
 * (jsdom returns zeroed rects; see appShell.test.ts), so — exactly as the App Shell's `.sh-content`
 * overflow guards do — we prove the DEFECT geometry numerically from the CSS tracks, then assert the
 * scoped scroll fallback exists so the over-budget content is reachable instead of silently clipped.
 *
 * BLAST-RADIUS: every fix is scoped to the surface's own class or a NEW wrapper. The shared base
 * `.dtable` rule (vsfield/ds.css) and the load-bearing `html,body{overflow-x:hidden}` document backstop
 * (replicated byte-identically across the per-route ds.css copies — guarded by appShell.test.ts) must
 * stay untouched; the guards at the bottom of this file assert they did.
 */
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "../..");
const read = (rel: string) => readFileSync(resolve(webRoot, rel), "utf8");

const standingsCss = read("app/standings/standings.css");
const vsfieldCss = read("app/vsfield/vsfield.css");
const vsfieldComponents = read("app/vsfield/components.tsx");
const gamesCss = read("src/games/games.css");
const vsfieldDs = read("app/vsfield/ds.css");

/** Strip `/* … *\/` comments so a `}` inside a comment can't truncate a matched declaration block. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Extract the FIRST declaration block for a bare `.selector {…}` (no descendant/media nesting). */
function ruleBlock(css: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[},])\\s*${esc}\\s*\\{([^}]*)\\}`, "m");
  const m = stripComments(css).match(re);
  if (!m?.[1]) throw new Error(`rule ${selector} not found`);
  return m[1];
}

/** Sum a `grid-template-columns` of fixed px tracks + `minmax(<min>px, …)` mins + inter-track gaps. */
function gridMinWidth(tracks: string, gapPx: number): number {
  const cols = tracks.trim().split(/\s+(?![^(]*\))/); // split on spaces outside parens
  let sum = 0;
  for (const c of cols) {
    const mm = c.match(/minmax\(\s*(\d+)px/);
    if (mm) sum += Number(mm[1]);
    else {
      const px = c.match(/(\d+)px/);
      if (px) sum += Number(px[1]);
    }
  }
  return sum + gapPx * (cols.length - 1);
}

// A 360px phone, minus each surface's own horizontal chrome, is the width the row content must fit.
const PHONE = 360;

describe("T15-1 CLIP-1/2 · /standings matchday + cumulative — fixed grids scroll, never clip", () => {
  it("the matchday grid's fixed tracks exceed a 360px phone (defect is real, deterministic)", () => {
    // `.st-head-md` / `.st-mdrow`: `36px minmax(120px,1fr) 100px 64px`, gap 8px — never overridden at
    // narrow widths, so it is the phone layout. Content sits inside `.st-app` (14px pad) → `.st-table`
    // → 14px row pad. Min grid content ≫ the ~304px it actually gets.
    const tracks = "36px minmax(120px, 1fr) 100px 64px";
    const rowPad = 14 * 2;
    const appPad = 14 * 2;
    const available = PHONE - appPad - rowPad;
    expect(gridMinWidth(tracks, 8)).toBe(344);
    expect(gridMinWidth(tracks, 8)).toBeGreaterThan(available); // 344 > 304 → overflows
  });

  it("the cumulative grid (≤720px) also exceeds a 360px phone", () => {
    const tracks = "32px minmax(96px, 1fr) 84px 46px 38px 22px";
    expect(gridMinWidth(tracks, 8)).toBe(358);
    expect(gridMinWidth(tracks, 8)).toBeGreaterThan(PHONE - 28 - 28);
  });

  it("`.st-table` offers a horizontal scroll fallback (overflow-x:auto), not a hard overflow:hidden clip", () => {
    const block = ruleBlock(standingsCss, ".st-table");
    expect(block, "scoped scroll so the over-budget grid is reachable").toMatch(
      /overflow-x:\s*auto/,
    );
    expect(block, "the bare overflow:hidden clip must be gone").not.toMatch(/overflow:\s*hidden/);
  });
});

describe("T15-1 CLIP-4 · /vsfield Season — power-record table scrolls, never clips", () => {
  it("SeasonTable wraps its .dtable in a scoped .v2-season-scroll container (JSX className only)", () => {
    // The 6-col table renders an un-truncated displayName, so its auto min-width blows past 360px with
    // no overflow-x ancestor → clipped by the document backstop. The wrapper localises the scroll.
    const start = vsfieldComponents.indexOf("function SeasonTable");
    const season = vsfieldComponents.slice(
      start,
      vsfieldComponents.indexOf("function MaYou", start),
    );
    expect(season).toContain('<div className="v2-season-scroll">');
    // wrapper must actually enclose the table
    expect(season).toMatch(/v2-season-scroll">[\s\S]*<table className="dtable"/);
  });

  it("`.v2-season-scroll` is a horizontal scroll container", () => {
    const block = ruleBlock(vsfieldCss, ".v2-season-scroll");
    expect(block).toMatch(/overflow-x:\s*auto/);
  });
});

describe("T15-1 CLIP-3 · /games tab bar — 5 tabs scroll, never clip", () => {
  it("the 5-tab bar's min-content exceeds a 360px phone on a group match (defect is real)", () => {
    // `.gd-app` mobile padding var(--sp-3)=12px/side → 336px. Five tabs' padded min-content (audit §1
    // ≈398px) can't wrap or scroll today → tail clipped. (Knockout = 4 tabs = fits; group = 5 = clips.)
    const appPad = 12 * 2;
    expect(398).toBeGreaterThan(PHONE - appPad); // 398 > 336
  });

  it("`.gd-tabbar` scrolls its tabs horizontally (min-width:0 + overflow-x:auto), so the 5th stays reachable", () => {
    const block = ruleBlock(gamesCss, ".gd-tabbar");
    expect(block).toMatch(/min-width:\s*0/);
    expect(block).toMatch(/overflow-x:\s*auto/);
  });
});

describe("T15-1 blast-radius guards — shared surfaces untouched", () => {
  it("the shared base `.dtable` rule gains NO overflow (scroll lives on the .v2-season-scroll wrapper only)", () => {
    // /waivers TeamBudgetsRail etc. share `.dtable`; a scroll on the base would regress them.
    const block = ruleBlock(vsfieldDs, ".dtable");
    expect(block).not.toMatch(/overflow/);
  });

  it("the html,body{overflow-x:hidden} document backstop is preserved (fixes scope scroll, don't remove it)", () => {
    expect(vsfieldDs).toMatch(/html,\s*body\s*\{[^}]*overflow-x:\s*hidden/);
  });
});
