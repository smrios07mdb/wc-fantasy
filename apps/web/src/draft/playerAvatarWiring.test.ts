import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for P46 PlayerAvatar. The Vitest run has no DOM/JSX transform,
// so the React component is checked by reading source text; full compilation is covered by
// `tsc --noEmit` + `next build`.
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "../../");
const read = (rel: string) => readFileSync(resolve(webRoot, rel), "utf8");

const avatarComp = read("components/PlayerAvatar.tsx");
const initials = read("src/draft/playerInitials.ts");
const draftComps = read("app/draft/components.tsx");
const lineupComps = read("app/lineup/components.tsx");
const ds = read("app/styles/ds.css");
const draftCss = read("app/draft/draft.css");
const lineupCss = read("app/lineup/lineup.css");

describe("playerInitials.ts — pure initials helper", () => {
  it("exports playerInitials function", () => {
    expect(initials).toContain("export function playerInitials(");
  });
  it("handles firstName + lastName, display name split, and single word", () => {
    expect(initials).toContain("firstName");
    expect(initials).toContain("lastName");
    expect(initials).toContain("displayName");
  });
});

describe("PlayerAvatar.tsx — presentational component", () => {
  it("imports resolver functions from flag.ts (not re-invented)", () => {
    expect(avatarComp).toContain('from "../src/draft/flag"');
    expect(avatarComp).toContain("toIso2");
    expect(avatarComp).toContain("flagEmoji");
    expect(avatarComp).toContain("isHomeNation");
  });
  it("imports playerInitials helper", () => {
    expect(avatarComp).toContain('from "../src/draft/playerInitials"');
    expect(avatarComp).toContain("playerInitials(");
  });
  it("applies player-avatar + pos class for position color (CSS vars, no hardcoded UI hex)", () => {
    expect(avatarComp).toContain("player-avatar");
    expect(avatarComp).toContain("pos-${position}");
    // SVG flag colors are content imagery (exempt like Flag.tsx); no hardcoded colors in the JSX logic
    expect(avatarComp).not.toContain("backgroundColor:");
    expect(avatarComp).not.toContain("style={{ background");
  });
  it("renders flag badge via pa-flag class", () => {
    expect(avatarComp).toContain("pa-flag");
  });
  it("never renders a broken image — no <img> tag", () => {
    expect(avatarComp).not.toContain("<img");
  });
  it("null/absent country → no badge (FlagBadge returns null early)", () => {
    expect(avatarComp).toContain("if (!country) return null");
  });
  it("home nations render inline SVG (correct glyphs — no ISO alpha-2 for England/Scotland)", () => {
    expect(avatarComp).toContain("isHomeNation(country)");
    expect(avatarComp).toContain('"England"');
    expect(avatarComp).toContain('"Scotland"');
    expect(avatarComp).toContain("<svg");
    expect(avatarComp).toContain("pa-flag-svg");
  });
  it("accepts size prop with sm/md/lg variants", () => {
    expect(avatarComp).toContain('size = "md"');
    expect(avatarComp).toContain("avatar-${size}");
  });
});

describe("ds.css — PlayerAvatar token classes (globally available)", () => {
  it("defines .player-avatar position-color overrides for all four positions", () => {
    expect(ds).toContain(".player-avatar.pos-GK");
    expect(ds).toContain(".player-avatar.pos-DEF");
    expect(ds).toContain(".player-avatar.pos-MID");
    expect(ds).toContain(".player-avatar.pos-FWD");
  });
  it("pos-GK uses white text (dark slate background)", () => {
    expect(ds).toMatch(/\.player-avatar\.pos-GK\s*\{[^}]*color:\s*#fff/);
  });
  it("defines .pa-flag badge positioning classes", () => {
    expect(ds).toContain(".pa-flag");
    expect(ds).toContain(".pa-flag-svg");
  });
  it("defines .flag-emoji globally (shared across draft + lineup + vsfield)", () => {
    expect(ds).toContain(".flag-emoji");
    expect(ds).toContain(".flag-emoji.flag-lg");
  });
  it("no gold color leak in PlayerAvatar classes", () => {
    const playerAvatarSection = ds.slice(
      ds.indexOf(".player-avatar"),
      ds.indexOf(".pa-flag-svg") + 200,
    );
    expect(playerAvatarSection).not.toMatch(/#[Ff][0-9a-fA-F]{2}[0-9a-fA-F]{2}[0-9a-fA-F]{2}/); // no gold-ish hex
  });
});

describe("draft.css — .flag-emoji promoted to ds.css (no duplicate)", () => {
  it("flag-emoji definition removed from route-scoped draft.css", () => {
    expect(draftCss).not.toMatch(/\.flag-emoji\s*\{/);
  });
});

describe("draft/components.tsx — PlayerAvatar wired into pool rows, queue, and roster pcard", () => {
  it("imports PlayerAvatar from the shared components directory", () => {
    expect(draftComps).toContain("import { PlayerAvatar }");
    expect(draftComps).toContain("PlayerAvatar");
  });
  it("uses PlayerAvatar in pool rows (dr-prow)", () => {
    expect(draftComps).toMatch(/<PlayerAvatar[\s\S]*?position=\{p\.position\}/);
  });
  it("uses PlayerAvatar in roster pcard section", () => {
    expect(draftComps).toContain('className="pcard"');
    expect(draftComps).toContain("<PlayerAvatar");
  });
  it("CountryFlag + Pos no longer used independently in player rows (replaced by PlayerAvatar)", () => {
    // CountryFlag still exists as a helper for the nation filter chips, but not in the player rows
    expect(draftComps).not.toMatch(/<CountryFlag country=\{p\.country\} \/>/);
  });
});

describe("lineup/components.tsx — PlayerAvatar wired into PitchToken and BenchRow", () => {
  it("imports PlayerAvatar from the shared components directory", () => {
    expect(lineupComps).toContain("import { PlayerAvatar }");
  });
  it("PlayerAvatar appears in PitchToken (sl-tok-top context)", () => {
    expect(lineupComps).toContain("sl-tok-top");
    expect(lineupComps).toContain("<PlayerAvatar");
  });
  it("PlayerAvatar appears in BenchRow (bench list context)", () => {
    expect(lineupComps).toContain("sl-bench-row");
    // PlayerAvatar inside bench row — Pos no longer used in bench row
    const benchSection = lineupComps.slice(lineupComps.indexOf("export function BenchRow"));
    expect(benchSection).toContain("<PlayerAvatar");
  });
  it("player country is passed through to the avatar", () => {
    expect(lineupComps).toMatch(/country=\{player\.country\}/);
  });
});

describe("lineup.css — <button> overflow fix so .pa-flag badge is not clipped by Safari/WebKit", () => {
  it(".sl-tok has overflow:visible (Safari clips <button border-radius> children without it)", () => {
    // Tailwind Preflight sets -webkit-appearance:button on all <button>s; in Safari/WebKit this
    // enforces a native paint-boundary clip that hides absolute children protruding outside the
    // border-radius. overflow:visible breaks the native clip. Chrome/Blink is unaffected (buttons
    // already compute overflow:visible in Chrome's UA stylesheet).
    const tokBlock = lineupCss.slice(
      lineupCss.indexOf(".sl-tok {"),
      lineupCss.indexOf("}", lineupCss.indexOf(".sl-tok {")),
    );
    expect(tokBlock).toContain("overflow: visible");
  });
  it(".sl-bench-row has overflow:visible (same Safari/WebKit button-clip fix)", () => {
    const benchBlock = lineupCss.slice(
      lineupCss.indexOf(".sl-bench-row {"),
      lineupCss.indexOf("}", lineupCss.indexOf(".sl-bench-row {")),
    );
    expect(benchBlock).toContain("overflow: visible");
  });
});
