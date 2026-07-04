import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * T15-2 source-contract smoke — pins the shell-stacking layer's byte-level contracts so a future
 * re-export/refactor can't silently reintroduce the audited defects (F-P0-A1 / F-P1-I1 / F-P1-C1 /
 * F-P2-I6/I7 / F-P2-PSC1 / F-P3-A2 / F-P3-G3). The geometric truths (paint order, tappability,
 * bounds at 360/390/430) are proven in a real browser by scripts/verify-shell-stacking.mjs; THIS
 * test makes the underlying declarations un-regressable in the plain vitest gate.
 */
const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "../..");
const read = (p: string) => readFileSync(resolve(webDir, p), "utf8");

const ds = read("app/styles/ds.css");
const shell = read("app/shell/shell.css");
const waivers = read("src/waivers/waivers.css");
const pool = read("src/pool/pool.css");
const psc = read("components/PlayerScoreSheet.css");
const lineup = read("app/lineup/lineup.css");
const draft = read("app/draft/draft.css");
const commish = read("app/commish/commish.css");
const players = read("src/players/players.css");

describe("ds.css — the ONE documented z-scale (T15-2)", () => {
  it("declares the four z tokens", () => {
    expect(ds).toContain("--z-nav: 100");
    expect(ds).toContain("--z-overlay: 120");
    expect(ds).toContain("--z-overlay-stack: 130");
    expect(ds).toContain("--z-takeover: 200");
  });

  it("puts the shared player-card scrim on the overlay tier with a dvh-capped, chrome-fixed sheet", () => {
    expect(ds).toMatch(/\.pc-scrim\s*{[^}]*z-index:\s*var\(--z-overlay\)/);
    expect(ds).toMatch(/\.pc-sheet\s*{[^}]*max-height:\s*88dvh/);
    expect(ds).toMatch(/\.pc-sheet\s*{[^}]*overflow:\s*hidden/);
    // the internal scroller that keeps ✕/header/tabs fixed (F-P2-PSC1)
    expect(ds).toMatch(/\.pc-body\s*{[^}]*overflow-y:\s*auto/);
    expect(ds).toMatch(/\.pc-body\s*{[^}]*overscroll-behavior:\s*contain/);
    // 44px close target
    expect(ds).toMatch(/\.pc-x\s*{[^}]*width:\s*44px/);
  });

  it("keeps zero legacy-vh modal caps in the overlay system files", () => {
    // dvh/svh are fine; a bare NNvh max-height on any modal cap is the F-P2-I7 regression.
    for (const [name, css] of [
      ["ds.css", ds],
      ["waivers.css", waivers],
      ["pool.css", pool],
      ["PlayerScoreSheet.css", psc],
    ] as const) {
      expect(css, `${name} must not cap a modal with legacy vh`).not.toMatch(
        /max-height:[^;]*\d(vh)[^a-z]/,
      );
    }
  });
});

describe("shell.css — bottom-nav tap reliability + safe areas (F-P0-A1 / F-P3-A2)", () => {
  it("gives every tab slot equal width, a 44px floor, instant press feedback, and no tap-delay heuristics", () => {
    expect(shell).toMatch(/\.sh-btnav-item\s*{[^}]*flex:\s*1 1 0/);
    expect(shell).toMatch(/\.sh-btnav-item\s*{[^}]*min-width:\s*0/);
    expect(shell).toMatch(/\.sh-btnav-item\s*{[^}]*min-height:\s*44px/);
    expect(shell).toMatch(/\.sh-btnav-item\s*{[^}]*touch-action:\s*manipulation/);
    expect(shell).toMatch(/\.sh-btnav-item:active\s*{/);
    // the ellipsis overflow guard on the label span
    expect(shell).toMatch(/\.sh-btnav-item\s*>\s*span\s*{[^}]*text-overflow:\s*ellipsis/);
  });

  it("keeps the nav on the token tier and pointer-inert under any open route scrim (F-P1-I1)", () => {
    expect(shell).toMatch(/\.sh-btmnav\s*{[^}]*z-index:\s*var\(--z-nav, 100\)/);
    expect(shell).toMatch(
      /body:has\(\.pc-scrim, \.wv-scrim, \.pl-modal-overlay, \.sl-forfeit-overlay\)\s*\.sh-btmnav\s*{\s*pointer-events:\s*none/,
    );
  });

  it("pads the bar, sheet and topbar for landscape safe-area-x (F-P3-A2)", () => {
    expect(shell).toMatch(/\.sh-btmnav\s*{[^}]*padding-left:\s*env\(safe-area-inset-left\)/);
    expect(shell).toMatch(/\.sh-more-sheet\s*{[^}]*padding-right:\s*env\(safe-area-inset-right\)/);
    expect(shell).toMatch(/\.sh-topbar\s*{[^}]*env\(safe-area-inset-left\)/);
  });

  it("gives the More sheet its chrome (grabber/title/✕) and a contained internal scroller (F-P2-A4/I6)", () => {
    expect(shell).toContain(".sh-sheet-grab");
    expect(shell).toContain(".sh-sheet-head");
    expect(shell).toContain(".sh-sheet-x");
    expect(shell).toMatch(/\.sh-more-sheet-items\s*{[^}]*overscroll-behavior:\s*contain/);
    expect(shell).toMatch(/\.sh-more-sheet\s*{[^}]*max-height:[^;]*dvh/);
  });
});

describe("waivers — composer modal + instant-pickup panel (F-P1-I1 / step-27)", () => {
  it("lifts the bid composer scrim to the overlay tier with a dvh cap", () => {
    expect(waivers).toMatch(/\.wv-scrim\s*{[^}]*z-index:\s*var\(--z-overlay\)/);
    expect(waivers).toMatch(/\.wv-composer\s*{[^}]*max-height:\s*90dvh/);
  });

  it("stacks the FA card ABOVE the open composer via the stacked-overlay tier", () => {
    expect(waivers).toMatch(/\.wv-app \.pc-scrim\s*{\s*z-index:\s*var\(--z-overlay-stack\)/);
  });

  it("contains the MODAL's internal scrollers only — the in-flow FA panel keeps page chaining (F-P2-I6)", () => {
    expect(waivers).toMatch(
      /\.wv-scrim \.wv-comp-list,\s*\.wv-scrim \.wv-drop-pick,\s*\.wv-scrim \.wv-comp-config\s*{\s*overscroll-behavior:\s*contain/,
    );
    // the bare (unscoped) .wv-comp-list must NOT be contained — that would eat page scroll in-flow
    expect(waivers).not.toMatch(/^\.wv-comp-list\s*{[^}]*overscroll-behavior/m);
  });

  it("step-27: the FA panel's action column orders ABOVE the pool list at the 1-col breakpoint", () => {
    expect(waivers).toMatch(/\.wv-fa \.wv-comp-config\s*{[^}]*order:\s*-1/);
    expect(waivers).toMatch(/\.wv-fa \.wv-comp-list\s*{[^}]*max-height:\s*min\(420px, 44dvh\)/);
  });
});

describe("route surfaces on the scale", () => {
  it("pool drill-in: overlay tier + dvh + contained list", () => {
    expect(pool).toMatch(/\.pl-modal-overlay\s*{[^}]*z-index:\s*var\(--z-overlay\)/);
    expect(pool).toMatch(/\.pl-modal\s*{[^}]*max-height:\s*min\(80dvh, 720px\)/);
    expect(pool).toMatch(/\.pl-modal-list\s*{[^}]*overscroll-behavior:\s*contain/);
  });

  it("score sheet (both CSS copies): takeover tier, dvh cap, fixed chrome + .sl-sm-body scroller, 44px ✕ (F-P2-PSC1)", () => {
    for (const [name, css] of [
      ["PlayerScoreSheet.css", psc],
      ["lineup.css", lineup],
    ] as const) {
      expect(css, name).toMatch(/\.sl-forfeit-overlay\s*{[^}]*z-index:\s*var\(--z-takeover, 200\)/);
      expect(css, name).toMatch(/\.sl-scoremodal\s*{[^}]*max-height:\s*85dvh/);
      expect(css, name).toMatch(/\.sl-scoremodal\s*{[^}]*overflow:\s*hidden/);
      expect(css, name).toMatch(/\.sl-sm-body\s*{[^}]*overscroll-behavior:\s*contain/);
      expect(css, name).toMatch(/\.sl-sm-close\s*{[^}]*width:\s*44px/);
    }
  });

  it("lineup SaveBar pins above the nav band on phones (F-P1-C1)", () => {
    expect(lineup).toMatch(
      /@media \(max-width: 639px\)\s*{\s*\.sl-savebar\s*{\s*bottom:\s*calc\(58px \+ env\(safe-area-inset-bottom, 0px\) \+ 10px\)/,
    );
  });

  it("draft toasts: overlay tier + lifted clear of the nav band on phones (F-P1-I1 merged instance)", () => {
    expect(draft).toMatch(/\.dr-toasts\s*{[^}]*z-index:\s*var\(--z-overlay\)/);
    expect(draft).toMatch(
      /\.dr-toasts\s*{\s*bottom:\s*calc\(58px \+ env\(safe-area-inset-bottom, 0px\) \+ 12px\)/,
    );
  });

  it("commish: console clears the home indicator (F-P3-G3) and the view-as dropdown joins the scale", () => {
    expect(commish).toMatch(
      /\.adm-console\s*{[^}]*padding-bottom:\s*calc\(32px \+ env\(safe-area-inset-bottom, 0px\)\)/,
    );
    expect(commish).toMatch(/\.adm-viewas-menu\s*{[^}]*z-index:\s*var\(--z-overlay\)/);
  });

  it("players: the pioneer route-scoped z lift is retired — the global token covers it", () => {
    expect(players).not.toMatch(/\.pl-app \.pc-scrim\s*{[^}]*z-index/);
  });
});
