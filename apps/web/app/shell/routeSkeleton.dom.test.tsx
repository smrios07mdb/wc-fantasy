// @vitest-environment jsdom
/**
 * NAV-LAT — the route loading skeletons, proven by mounting the REAL components (not a replica). This
 * is the anti-drift pin for verify-nav-latency.mjs (which proves paint geometry in a real browser):
 * jsdom here pins the structural contract every `loading.tsx` relies on — the `[data-skeleton]`
 * hooks, the accessible `role=status`/`aria-busy` wrapper, per-variant bodies, and the home
 * `loading.tsx`'s static shell chrome keeping the bottom nav + active "Dashboard" tab present.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { RouteSkeleton, type SkeletonVariant } from "@/app/shell/RouteSkeleton";
import HomeLoading from "@/app/loading";

afterEach(cleanup);

// webDir = apps/web (this file lives at apps/web/app/shell/) — read REAL source for the drift pin.
const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => readFileSync(resolve(webDir, p), "utf8");

const VARIANTS: SkeletonVariant[] = ["list", "pitch", "cockpit", "board", "form", "dashboard"];

describe("RouteSkeleton — structural contract", () => {
  for (const variant of VARIANTS) {
    it(`variant "${variant}" renders an accessible, shimmering skeleton`, () => {
      const { container } = render(<RouteSkeleton variant={variant} label="Test screen" />);
      const root = container.querySelector<HTMLElement>("[data-skeleton]");
      expect(root).not.toBeNull();
      expect(root!.getAttribute("data-skeleton-variant")).toBe(variant);
      expect(root!.getAttribute("role")).toBe("status");
      expect(root!.getAttribute("aria-busy")).toBe("true");
      expect(root!.getAttribute("aria-label")).toContain("Test screen");
      // at least one shimmer block — never a spinner-only / empty placeholder
      expect(container.querySelectorAll("[data-skeleton] .skeleton").length).toBeGreaterThan(0);
    });
  }

  it("leads with a header band for standard variants, but not the dashboard (its own banner leads)", () => {
    const { container: list } = render(<RouteSkeleton variant="list" />);
    expect(list.querySelector("[data-skeleton-band]")).not.toBeNull();
    cleanup();
    const { container: dash } = render(<RouteSkeleton variant="dashboard" bare />);
    expect(dash.querySelector("[data-skeleton-band]")).toBeNull();
  });

  it("carries a visually-hidden 'Loading …' announcement for screen readers", () => {
    const { container } = render(<RouteSkeleton variant="list" label="Standings" />);
    expect(container.textContent).toContain("Loading Standings");
  });
});

describe("home loading.tsx — static shell chrome keeps nav + active tab visible", () => {
  it("renders the bottom nav with the Dashboard slot active-highlighted around the dashboard skeleton", () => {
    const { container } = render(<HomeLoading />);
    // the shell frame is present (home mounts AppShell in page.tsx, so its loader re-renders chrome)
    expect(container.querySelector(".sh-app.sh-app-top")).not.toBeNull();
    expect(container.querySelector(".sh-topbar")).not.toBeNull();
    const bar = container.querySelector(".sh-btmnav");
    expect(bar).not.toBeNull();
    // exactly one active bottom slot, and it is the Dashboard (home) tab
    const active = bar!.querySelectorAll(".sh-btnav-item.is-active");
    expect(active.length).toBe(1);
    expect(active[0]!.textContent).toContain("Dashboard");
    // the content area holds the dashboard body skeleton (its own banner leads, so no header band)
    const skel = container.querySelector(".sh-content [data-skeleton]");
    expect(skel).not.toBeNull();
    expect(skel!.getAttribute("data-skeleton-variant")).toBe("dashboard");
  });

  it("marks the top-strip Home item active for the desktop breakpoint", () => {
    const { container } = render(<HomeLoading />);
    const activeTop = container.querySelector(".sh-topbar .sh-nav-item.is-active");
    expect(activeTop).not.toBeNull();
    expect(activeTop!.textContent).toContain("Home");
  });
});

/**
 * DRIFT PIN — the home loader (app/loading.tsx) hand-mirrors AppShell's nav chrome because `/` mounts
 * the real (async) AppShell in page.tsx, not a layout. The RTL cases above prove the loader OUTPUT
 * carries these classes; this block pins that same vocabulary against the REAL AppShell / MoreSheet
 * SOURCE (the shellStacking.contract / verify-players precedent: readFileSync + assert on source), so a
 * future rename in AppShell breaks THIS test instead of silently diverging the loading chrome from the
 * bar it imitates. Both halves reference one shared list, so they can't drift apart either.
 */
describe("home loading.tsx chrome — pinned to the REAL AppShell source (anti-drift)", () => {
  const appShell = read("app/shell/AppShell.tsx");
  const moreSheet = read("app/shell/MoreSheet.tsx");
  const homeLoader = read("app/loading.tsx");

  // Every chrome class the home loader emits to imitate the real bar. Kept in lockstep with AppShell.
  const SHELL_VOCAB = [
    "sh-app sh-app-top",
    "sh-topbar",
    "sh-topnav-scroll",
    "sh-topnav",
    "sh-nav-item",
    "sh-content",
    "sh-btmnav",
    "sh-btnav-item",
    "is-active",
  ] as const;

  it.each(SHELL_VOCAB)("AppShell source still emits %s (rename → this breaks)", (cls) => {
    expect(appShell, `AppShell no longer emits "${cls}" — reconcile app/loading.tsx`).toContain(
      cls,
    );
  });

  it.each(SHELL_VOCAB)("home loader source uses the pinned class %s", (cls) => {
    expect(
      homeLoader,
      `app/loading.tsx dropped "${cls}" — chrome diverged from AppShell`,
    ).toContain(cls);
  });

  it("pins the More slot's class to the REAL MoreSheet source (where the live More button emits it)", () => {
    expect(moreSheet).toContain("sh-more-btn");
    expect(homeLoader).toContain("sh-more-btn");
  });

  it("pins the loader's nav labels to the REAL crossNav arrays (not hard-coded strings)", () => {
    // The loader must derive labels from crossNav, so a label rename there flows through automatically.
    expect(homeLoader).toMatch(/from ["']@\/src\/shell\/crossNav["']/);
    expect(homeLoader).toContain("BOTTOM_TAB_ITEMS");
    expect(homeLoader).toContain("NAV_ITEMS");
  });
});
