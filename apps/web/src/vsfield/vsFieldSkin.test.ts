import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for the /vsfield Direction-A re-skin ("split cockpit"). The
// load-bearing BEHAVIOUR the re-skin must PRESERVE is unit-tested at the right altitude:
// packages/vsfield buildVsField.test.ts (running scores + the provisional record / per-opponent H2H,
// tie = neither W nor L, the inactive-0 manager, still-to-come counts, season read),
// handleVsField.test.ts (authed read 401 / no 403), snapshotClient/realtime/liveController
// (JWT-authed subscribe → change-nudge → refetch + the polling fallback), and the jsdom
// CompareBand.test.tsx (Facts 1+2, the jersey-pitch drill-in, the Prompt-41 per-player points chip).
// Here we guard the re-skin's source CONTRACTS: the Direction-A vocabulary is wired (leaderboard rail,
// compare band, dual jersey pitches, mobile tree), the jersey kit comes from kitOf (shared iso2 flag
// mapper), the still-to-come COUNT (not a projection, §5), avatars as initials, the gold-free palette,
// the lineup-route class-collision guard, and the untouched loader / Realtime wiring / gate / ƒ shape.
const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "../../app");
const read = (rel: string) => readFileSync(resolve(appDir, rel), "utf8");

const client = read("vsfield/VsFieldClient.tsx");
const components = read("vsfield/components.tsx");
const css = read("vsfield/vsfield.css");
const layout = read("vsfield/layout.tsx");
const page = read("vsfield/page.tsx");
const loader = read("vsfield/loadVsField.ts");
const kit = read("vsfield/kitOf.ts");
const ds = read("styles/ds.css");

describe("vsfield re-skin — the body brand lockup stays de-duplicated (the shell owns the brand)", () => {
  it("keeps the body de-branded — no `.vf-logo` 'W' badge, no second brand mark", () => {
    expect(client).not.toContain('className="vf-logo"');
    expect(client).not.toContain('className="vf-brand"');
    expect(client).not.toContain("BrandBadge");
    expect(css).not.toMatch(/^\.vf-logo\s*\{/m);
    expect(css).not.toMatch(/^\.vf-brand\s*\{/m);
  });

  it("keeps `.vf-top` as a de-branded status stack — screen label + live period line", () => {
    expect(client).toContain('className="vf-status"');
    expect(css).toMatch(/^\.vf-status\s*\{/m);
    expect(client).toContain("periodLabel.toUpperCase()");
  });
});

describe("vsfield re-skin — the Direction-A split cockpit is wired (presentation only)", () => {
  it("renders the leaderboard rail + compare band + dual XI panels + season + live indicator", () => {
    expect(client).toContain('tab === "season"');
    expect(client).toContain("<MatchStrip");
    expect(client).toContain("<Leaderboard");
    expect(client).toContain("<CompareBand");
    expect(client).toContain("<XIPanel");
    expect(client).toContain("<YouVsField");
    expect(client).toContain("<SeasonTable");
    expect(client).toContain("<ConnPill");
    expect(css).toMatch(/^\.da-lb\s*\{/m); // the prominent left leaderboard rail
    expect(css).toMatch(/^\.da-xi\s*\{/m); // the dual jersey-pitch panels
    expect(css).toMatch(/^\.v2-band\s*\{/m); // the compare band
  });

  it("renders the net-new mobile tree (leaderboard-first, media-query swapped — no JS fork)", () => {
    expect(client).toContain("<MaStandings");
    expect(client).toContain("<MaH2H");
    expect(css).toMatch(/^\.ma-scroll\s*\{/m);
    expect(css).toContain("@media (max-width: 760px)");
    // the mobile You/Opp side toggle is a LOCAL useState (F3), not Realtime-coupled
    expect(components).toContain('useState<"me" | "opp">');
  });

  it("keeps each per-manager region in the leaderboard row — score + H2H + still-to-come", () => {
    expect(components).toContain("da-lb-pts"); // running score
    expect(components).toContain("da-lb-wld"); // per-opponent head-to-head W/L/D + margin
    expect(components).toContain("h2hVsViewer"); // ... off the snapshot, not a client recompute
    expect(components).toContain("to play");
  });

  it("selection state is the 'field' sentinel | managerId (UUIDs — no collision)", () => {
    expect(client).toContain("effSel");
    expect(client).toContain("useState<string | null>(null)");
    expect(client).toContain('?? "field"');
  });
});

describe("vsfield re-skin — flag-kit jerseys (kitOf) + the lineup class-collision guard", () => {
  it("derives every kit through kitOf, which reuses the SHARED iso2 flag mapper (no second table)", () => {
    expect(components).toContain('import { kitOf } from "./kitOf"');
    expect(components).toContain("kitOf(starter.nation)");
    expect(kit).toContain('from "@/src/draft/flag"'); // toIso2 + isHomeNation — the existing mapper
    expect(kit).toContain("toIso2");
    expect(kit).toContain("isHomeNation");
  });

  it("never sets background-size: cover on the jersey (the multi-layer kit gotcha)", () => {
    expect(css).not.toMatch(/background-size:\s*cover/);
  });

  it("namespaces the jersey token as `.sl-tok-jersey` under `.da-pitch` — never bare `.sl-tok` (lineup owns it)", () => {
    expect(components).toContain("sl-tok-jersey");
    expect(components).not.toMatch(/"sl-tok[" ]/); // no bare sl-tok class emitted
    expect(css).toContain(".da-pitch .sl-tok-jersey");
    expect(css).not.toMatch(/^\.sl-tok\s*\{/m); // no unscoped .sl-tok rule to fight lineup.css
    expect(css).not.toMatch(/^\.sl-tok-name\s*\{/m); // lineup's class — not redefined here
  });

  it("uses the shared --kit-outline token (defined globally in ds.css, dark + light)", () => {
    expect(css).toContain("var(--kit-outline)");
    expect(ds).toContain("--kit-outline: rgba(255,255,255,0.82)"); // :root (dark)
    expect(ds).toContain("--kit-outline: rgba(20,28,42,0.5)"); // [data-theme="light"]
  });
});

describe("vsfield points chip — per-player points under each jersey (Prompt 41 / path a)", () => {
  it("tokens render a points CHIP (sl-jersey-score + sl-jersey-pts + the real number), not a worded label", () => {
    expect(components).toContain("sl-jersey-score"); // the chip container (vsfield-local rename)
    expect(components).toContain("sl-jersey-pts"); // the PTS / TO PLAY unit
    expect(components).toContain("starter.points"); // the REAL score_player_match.points is the headline
    expect(components).not.toContain("sl-jersey-state"); // the old worded state chip is gone
    expect(components).not.toContain("sl-jersey-toplay"); // ditto
    expect(components).not.toContain("sl-tok-score"); // still NOT the lineup-colliding bare design name
  });

  it("CompareBand still ships Facts 1+2 only; Fact 3 stays deferred (now a scope step, not blocked)", () => {
    expect(components).toContain("Fact 3 (player-by-player lineup edge) is still deferred");
    expect(components).not.toContain("Player-by-player");
    expect(components).not.toContain("biggest edge");
  });

  it("the FeedTicker stays a no-op stub with its data-gap TODO", () => {
    expect(components).toContain("TODO: FeedTicker needs event-level feed not in VsFieldView");
  });
});

describe("vsfield re-skin — still-to-come is a COUNT, never a projection (ARCHITECTURE §5)", () => {
  it("derives the indicator from the bucket counts (yet-to-play + no-match), not a projected score", () => {
    expect(components).toContain("c.yetToPlay + c.noMatch");
    expect(components).not.toContain("projection");
    expect(components).not.toContain("projected");
  });
});

describe("vsfield re-skin — avatars stay initials, not the parrot (BRAND.md §6)", () => {
  it("renders the initials Avatar for MANAGERS and never the parrot mascot", () => {
    expect(components).toContain("function initials(");
    expect(components).toContain("{initials(name)}");
    expect(components).not.toContain("parrot");
    // manager rows are manager-identity — PlayerAvatar (player/nation-scoped) is NOT used here
    expect(components).not.toContain("PlayerAvatar");
  });
});

describe("vsfield re-skin — preserves the loader / Realtime / gate it restyles (no mechanism change)", () => {
  it("keeps the JWT-authed Realtime subscribe + change-nudge refetch + polling fallback wiring", () => {
    expect(client).toContain("startVsFieldLive");
    expect(client).toContain("onAuthStateChange"); // INITIAL_SESSION / TOKEN_REFRESHED lifecycle
    expect(client).toContain("fetchVsField"); // server-computed snapshot refetch
  });

  it("keeps the league-scoped server loader reusing buildVsField; per-player points composed SERVER-side", () => {
    expect(loader).toContain("buildVsField");
    expect(loader).toContain('scope: "group_stage"'); // the season standing read is league-scoped
    // Prompt 41 (path a): per-player points ARE composed at the SERVER source — the loader reads
    // score_player_match (joined via match.periodId). The browser's direct read scope is unchanged;
    // that boundary is locked by src/vsfield/pointsPath.test.ts (no browser-direct read / subscription).
    expect(loader).toContain("scorePlayerMatch");
  });

  it("keeps the gate authenticated-league-member only — 401 (sign-in) / not-member (denied), no 403", () => {
    expect(page).toContain("getSessionManager()"); // the Prompt-07 session→manager resolve
    expect(page).toContain('redirect("/sign-in")'); // no session
    expect(page).toContain('redirect("/auth/denied")'); // not allow-listed / no linked manager
    expect(page).toContain('outcome.kind !== "ok"');
  });
});

describe("vsfield re-skin — colour + shape invariants (BRAND.md §1, ARCHITECTURE §5)", () => {
  it("keeps vsfield.css gold-free — every hex is one of the two documented non-gold overrides", () => {
    // vsfield.css legitimately carries `--pos-gk` slate + `--node-played` steel-blue (the gold-removal
    // overrides ported from the design). Those are the ONLY hex literals allowed; any other hex — and in
    // particular any amber/gold — would be a regression. (Pitch markings + on-kit text use rgba, not
    // hex; the jersey flag colors live in kitOf.ts as content imagery, like flag emoji.)
    const hexes = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
    const allowed = new Set(["#5e6e8c", "#6e86b4"]);
    for (const h of hexes) expect(allowed.has(h)).toBe(true);
  });

  it("stays AppShell-wrapped (brand from the shell) on the dark cobalt surface", () => {
    expect(layout).toContain('<AppShell active="vsfield"');
    expect(layout).toContain('data-accent="cobalt"');
  });

  it("keeps /vsfield dynamic (ƒ) — server-authoritative, force-dynamic", () => {
    expect(page).toContain('export const dynamic = "force-dynamic"');
  });
});
