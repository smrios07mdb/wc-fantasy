import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for the Prompt-24 /vsfield re-skin. The repo's Vitest run has no
// DOM/JSX transform (by design — see components/Brand.test.ts + the landing/shell/draft/lineup smokes),
// so we verify the re-skin's load-bearing CONTRACTS from source rather than mounting. Component
// compilation is covered by `tsc --noEmit` + `next build`; visual fidelity is confirmed on the live
// deploy. The BEHAVIOUR the re-skin must PRESERVE is already unit-tested at the right altitude:
// packages/vsfield buildVsField.test.ts (running scores + the provisional record / per-opponent H2H via
// the Prompt-04 pairwise helper, tie = neither W nor L, the inactive-0 manager, still-to-come counts,
// season read), handleVsField.test.ts (authed read 401 / no 403), snapshotClient/realtime/liveController
// (JWT-authed subscribe → change-nudge → refetch + the polling fallback). Here we guard only that the
// *visual* re-skin de-duplicated the body brand, ported the design's pitch markings, kept every region
// wired + the still-to-come COUNT (not a projection, §5), avatars as initials, the gold-free palette,
// and did NOT touch the loader / Realtime wiring / the gate / the dynamic (ƒ) shape.
const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "../../app");
const read = (rel: string) => readFileSync(resolve(appDir, rel), "utf8");

const client = read("vsfield/VsFieldClient.tsx");
const components = read("vsfield/components.tsx");
const css = read("vsfield/vsfield.css");
const layout = read("vsfield/layout.tsx");
const page = read("vsfield/page.tsx");
const loader = read("vsfield/loadVsField.ts");

describe("vsfield re-skin — the body brand lockup is de-duplicated (the shell owns the brand)", () => {
  it("drops the body `.vf-logo` 'W' badge — no second brand mark (mirrors the Prompt-22 dr-logo de-dup)", () => {
    expect(client).not.toContain('className="vf-logo"');
    expect(client).not.toContain('className="vf-brand"');
    // the trophy/"XI" brand belongs to the AppShell topbar, never the vsfield body
    expect(client).not.toContain("BrandBadge");
    // `.vf-logo` was vsfield-LOCAL (defined+used only here), so the orphaned CSS rule is gone too
    expect(css).not.toMatch(/^\.vf-logo\s*\{/m);
    expect(css).not.toMatch(/^\.vf-brand\s*\{/m);
  });

  it("keeps `.vf-top` as a de-branded status stack — screen label + live period line", () => {
    expect(client).toContain('className="vf-status"');
    expect(css).toMatch(/^\.vf-status\s*\{/m);
    // the period line is still rendered (vsfield-local context, not a brand mark)
    expect(client).toContain("periodLabel.toUpperCase()");
  });
});

describe("vsfield re-skin — the design's pitch markings are ported (the fidelity fix)", () => {
  it("adds a centre circle + halfway line so the formation pitch reads as a pitch", () => {
    expect(css).toMatch(/\.vf-pitch::after\s*\{/);
    expect(css).toMatch(/\.vf-pitch-v::before\s*\{/);
    expect(css).toMatch(/\.vf-pitch-h::before\s*\{/);
    // the centre circle is a circle (aspect-ratio:1 is unique to it)
    expect(css).toContain("aspect-ratio: 1");
  });
});

describe("vsfield re-skin — every region stays wired (presentation only)", () => {
  it("renders the period field + season view + live indicator off the view tabs", () => {
    expect(client).toContain('tab === "season"');
    expect(client).toContain("<MatchStrip");
    expect(client).toContain("<FieldTable");
    expect(client).toContain("<YouVsField");
    expect(client).toContain("<SeasonTable");
    expect(client).toContain("<H2HDetail");
    expect(client).toContain("<ConnPill");
  });

  it("keeps each per-manager region in the field row — score + record + H2H + still-to-come", () => {
    expect(components).toContain("vf-c-score"); // running score
    expect(components).toContain("vs field "); // provisional all-play-all record subline
    expect(components).toContain("<H2HResultChip"); // per-opponent head-to-head
    expect(components).toContain("vf-ytp-num"); // still-to-come count
    expect(components).toContain("to play");
  });
});

describe("vsfield re-skin — still-to-come is a COUNT, never a projection (ARCHITECTURE §5)", () => {
  it("derives the indicator from the bucket counts (yet-to-play + no-match), not a projected score", () => {
    expect(components).toContain("c.yetToPlay + c.noMatch");
    // §5 forbids a projected-points number for the upside indicator
    expect(components).not.toContain("projection");
    expect(components).not.toContain("projected");
  });
});

describe("vsfield re-skin — avatars stay initials, not the parrot (BRAND.md §6)", () => {
  it("renders the initials Avatar and never introduces the parrot mascot as an avatar", () => {
    expect(components).toContain("function initials(");
    expect(components).toContain("{initials(name)}");
    expect(components).not.toContain("parrot");
  });
});

describe("vsfield re-skin — preserves the loader / Realtime / gate it restyles (no mechanism change)", () => {
  it("keeps the JWT-authed Realtime subscribe + change-nudge refetch + polling fallback wiring", () => {
    expect(client).toContain("startVsFieldLive");
    expect(client).toContain("onAuthStateChange"); // INITIAL_SESSION / TOKEN_REFRESHED lifecycle
    expect(client).toContain("fetchVsField"); // server-computed snapshot refetch
  });

  it("keeps the league-scoped server loader reusing buildVsField (the Prompt-04 helper)", () => {
    expect(loader).toContain("buildVsField");
    expect(loader).toContain('scope: "group_stage"'); // the season standing read is league-scoped
  });

  it("keeps the gate authenticated-league-member only — 401 (sign-in) / not-member (denied), no 403", () => {
    expect(page).toContain("getSessionManager()"); // the Prompt-07 session→manager resolve
    expect(page).toContain('redirect("/sign-in")'); // no session
    expect(page).toContain('redirect("/auth/denied")'); // not allow-listed / no linked manager
    // league-scoped read: the outcome is gated only on kind !== "ok"; there is NO own-manager target to
    // compare against, so no 403-not-your-manager path is introduced (the doc comment notes its absence).
    expect(page).toContain('outcome.kind !== "ok"');
  });
});

describe("vsfield re-skin — colour + shape invariants (BRAND.md §1, ARCHITECTURE §5)", () => {
  it("keeps vsfield.css gold-free — every hex is one of the two documented non-gold overrides", () => {
    // vsfield.css legitimately carries `--pos-gk` slate + `--node-played` steel-blue (the gold-removal
    // overrides ported from the design). Those are the ONLY hex literals allowed; any other hex — and in
    // particular any amber/gold — would be a regression. (The pitch markings use rgba white, not hex.)
    const hexes = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
    const allowed = new Set(["#5e6e8c", "#6e86b4"]);
    for (const h of hexes) expect(allowed.has(h)).toBe(true);
    // (a word-match on "gold" would false-positive on the file's own "No gold" comments — the hex
    // allowlist above is the substantive guard: no amber/gold colour value can be present.)
  });

  it("stays AppShell-wrapped (brand from the shell) on the dark cobalt surface", () => {
    expect(layout).toContain('<AppShell active="vsfield"');
    expect(layout).toContain('data-accent="cobalt"');
  });

  it("keeps /vsfield dynamic (ƒ) — server-authoritative, force-dynamic", () => {
    expect(page).toContain('export const dynamic = "force-dynamic"');
  });
});
