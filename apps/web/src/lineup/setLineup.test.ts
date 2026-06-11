import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for the Prompt-23 /lineup re-skin. The repo's Vitest run has no DOM/JSX
// transform (by design — mirrors draftRoom.test.ts + the landing/shell smokes), so we verify the re-skin's
// load-bearing CONTRACTS from source rather than mounting. Component compilation is covered by `tsc --noEmit`
// + `next build`; visual fidelity is confirmed on the live deploy. The behaviours the re-skin must PRESERVE
// are already unit-tested at the right altitude — packages/lineup validate.test.ts (formation bounds +
// lock-respecting), view.test.ts (buildPitch / isMovable / canSwap / evaluateProposal), handleLineup.test.ts
// (authed-owner + server-side lock re-check + persist), lineupClient.test.ts (typed LineupError). Here we
// guard the *visual* re-skin: the body stays brand-free (the shell owns the brand — UNLIKE draft, there was
// never a body chip to remove), the pitch markings were ported, the legend over-claim was fixed, and the
// validator wiring / gated POST /api/lineup / locked-frozen affordance / typed-error surface / gold-free
// palette / dynamic (ƒ) shape were all left untouched.
const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "../../app");
const read = (rel: string) => readFileSync(resolve(appDir, rel), "utf8");

const client = read("lineup/SetLineupClient.tsx");
const components = read("lineup/components.tsx");
const css = read("lineup/lineup.css");
const layout = read("lineup/layout.tsx");
const page = read("lineup/page.tsx");
const view = readFileSync(resolve(here, "view.ts"), "utf8");

describe("lineup re-skin — the body carries NO brand lockup (the shell owns the brand)", () => {
  it("has no body brand mark — no `.sl-brand`/`vf-logo` 'W', no BrandBadge (the design's chip was never ported)", () => {
    for (const src of [client, components, css]) {
      expect(src).not.toContain("sl-brand");
      expect(src).not.toContain("vf-logo");
      expect(src).not.toContain("BrandBadge");
    }
  });

  it("keeps `.sl-topbar` as a de-branded screen-title strip — title + manager + period tabs", () => {
    expect(client).toContain('className="sl-topbar between"');
    expect(client).toContain("Set lineup");
    expect(client).toContain("initialState.displayName");
    expect(client).toContain("<PeriodTabs");
  });

  it('stays <AppShell active="lineup">-wrapped on the dark cobalt surface', () => {
    expect(layout).toContain('<AppShell active="lineup"');
    expect(layout).toContain('data-accent="cobalt"');
    expect(layout).toContain('data-theme="dark"');
  });
});

describe("lineup re-skin — pitch fidelity ported (presentation only)", () => {
  it("renders the design's pitch markings — halfway line, centre circle, penalty boxes, goal areas", () => {
    for (const cls of [
      "sl-pl-mid",
      "sl-pl-circle",
      "sl-pl-box-top",
      "sl-pl-box-bot",
      "sl-pl-goal-top",
      "sl-pl-goal-bot",
    ]) {
      expect(components).toContain(cls);
      expect(css).toContain(cls);
    }
    // the marking wrapper stays decorative
    expect(components).toContain('className="sl-pitch-lines" aria-hidden="true"');
  });

  it("fixes the legend over-claim — the binary locked state reads 'Locked', never 'Locked · played'", () => {
    expect(client).not.toContain("Locked · played");
    expect(client).toContain("Movable");
    expect(client).toContain("Locked —");
  });
});

describe("lineup re-skin — the formation view + bench + locked-frozen affordance stay wired", () => {
  it("renders the formation pitch (XI lanes) + the bench", () => {
    expect(client).toContain("<Pitch");
    expect(client).toContain("view={view}");
    expect(client).toContain("<Bench");
    expect(components).toContain("LANE_ORDER");
    expect(components).toContain("view.lanes[pos]");
  });

  it("freezes locked players — non-draggable, disabled, dimmed via `is-locked` (the freeze the manager sees)", () => {
    expect(components).toContain("draggable={false}");
    expect(components).toContain("aria-disabled={!movable}");
    expect(components).toContain('${movable ? "is-movable" : "is-locked"}');
    // taps on a locked player are ignored before any swap is attempted
    expect(client).toContain("if (!isMovable(period, playerId)) return;");
  });
});

describe("lineup re-skin — preserves the behaviours it restyles (no mechanism change)", () => {
  it("disables Save + surfaces the reason exactly when validateLineup rejects (the server's own check)", () => {
    expect(client).toContain("evaluateProposal(squad, period, starterIds, now)");
    expect(client).toContain("canSave={validation.ok && editable}");
    expect(client).toContain("reason");
    // the legality core IS the server's validateLineup, delegated by the pure view helper
    expect(view).toContain('from "@app/lineup"');
    expect(view).toContain("return validateLineup(");
  });

  it("saves through the gated POST /api/lineup and surfaces the typed LineupError in the restyled toast", () => {
    expect(client).toContain("submitLineup(");
    expect(client).toContain("res.error.message");
    expect(client).toContain('role="status"');
    expect(client).toContain("toast-danger");
  });

  it("keeps /lineup dynamic (ƒ) — server-authoritative, force-dynamic + gated", () => {
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain("getSessionManager()");
    expect(page).toContain('redirect("/sign-in")');
    expect(page).toContain('redirect("/auth/denied")');
  });
});

describe("per-player match date + time (Part 4) — kickoff = the lock/sub deadline", () => {
  it("formats the kickoff in the league tz via the SHARED formatInLeagueTz (no duplicate formatter)", () => {
    expect(components).toContain('from "@app/shared"');
    expect(components).toContain("formatInLeagueTz(new Date(kickoffAt), timezone)");
    // resolve-miss degrades to "TBD", never a crash
    expect(components).toContain('"TBD"');
  });

  it("renders the kickoff on BOTH the pitch token and the bench row (all 15)", () => {
    expect(components).toContain(
      '<KickoffTag kickoffAt={slot.kickoffAt} timezone={timezone} className="sl-tok-ko"',
    );
    expect(components).toContain(
      '<KickoffTag kickoffAt={slot.kickoffAt} timezone={timezone} className="sl-bench-ko"',
    );
    expect(css).toMatch(/\.sl-bench-ko\s*\{/);
  });

  it("threads the league timezone from state → Pitch/Bench (server provides it; client renders)", () => {
    expect(client).toContain("timezone");
    expect(client).toContain("timezone={timezone}");
    // the loader resolves each player's kickoff via the pure helper, off player.teamId
    expect(view).toContain("export function resolveKickoffByPlayer(");
  });
});

describe("lineup re-skin — colour + shape invariants (BRAND.md §1)", () => {
  it("keeps lineup.css free of literal hex — no gold can leak into the body (all colour via ds tokens)", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("routes save / validity / selection through the cobalt --accent + ds tokens (never gold)", () => {
    expect(css).toContain("var(--accent)");
    expect(css).not.toContain("gold");
  });
});
