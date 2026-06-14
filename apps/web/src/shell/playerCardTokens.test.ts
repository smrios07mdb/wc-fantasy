import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for the shared player-card (`.pc-*`) tokens added in the
// 2026-06-13 design batch (mirrors flagWiring.test.ts). The `.pc-*` block is DORMANT until a
// screen consumes it (vf-psheet, sl-scoremodal, the standalone Free Agents / Waivers sheets),
// so there is nothing to mount — instead we guard from source that the block is present in the
// canonical ds.css (and, with appShell.test.ts's byte-identity check, in all four per-route
// copies). The load-bearing reason: the design export this block came from OMITS several blocks
// the live app depends on (`--kit-outline`, the P46 PlayerAvatar/`.flag-emoji` block, the P40
// overflow backstop). This test makes a future wholesale re-export that drops the `.pc-*` classes
// — or one that accidentally takes the export's omissions — fail loudly rather than silently.
const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "../../app");
const ds = readFileSync(resolve(appDir, "styles/ds.css"), "utf8");

describe("ds.css — shared player-card (.pc-*) tokens present (2026-06-13 batch)", () => {
  it("defines the player-card classes (at minimum the segmented tabs, the stats tiles, and the standalone sheet)", () => {
    for (const cls of [
      ".pc-seg",
      ".pc-seg-btn",
      ".pc-stats",
      ".pc-tiles",
      ".pc-tile",
      ".pc-log",
      ".pc-lrow",
      ".pc-statline",
      ".pc-stat",
      ".pc-scrim",
      ".pc-sheet",
      ".pc-x",
      ".pc-head",
      ".pc-ovr",
      ".pc-ovr-row .t-label",
    ]) {
      expect(ds, `${cls} must be defined in the canonical ds.css`).toContain(cls);
    }
  });

  it("references existing tokens only — the block introduces NO new CSS custom property definitions", () => {
    // The `.pc-*` block (everything from the SHARED player card banner to EOF) must only *consume*
    // tokens via var(...) — it must never *define* a `--token:` (additive, no new variables).
    const block = ds.slice(ds.indexOf("SHARED player card"));
    expect(block, "the .pc-* block must exist").toBeTruthy();
    // A custom-property *definition* looks like `--name:` at a declaration position. var(--name)
    // references are fine; this catches an accidental new token slipping in with the block.
    expect(block, "no new --token: definition inside the .pc-* block").not.toMatch(
      /(^|[;{]\s*)--[\w-]+\s*:/,
    );
  });
});

describe("ds.css — the export's omissions are NOT adopted (live-dependency guard)", () => {
  it("keeps --kit-outline (vsfield kit rendering) for both themes", () => {
    expect(ds).toContain("--kit-outline");
  });

  it("keeps the P46 PlayerAvatar + .flag-emoji block (app-wide)", () => {
    expect(ds).toContain(".player-avatar.pos-GK");
    expect(ds).toContain(".flag-emoji");
    expect(ds).toContain(".flag-emoji.flag-lg");
  });

  it("keeps the P40 no-horizontal-overflow backstop", () => {
    expect(ds).toContain("html, body { max-width: 100%; overflow-x: hidden; }");
  });
});
