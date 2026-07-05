// @vitest-environment jsdom
/**
 * NAV-LAT — the route loading skeletons, proven by mounting the REAL components (not a replica). This
 * is the anti-drift pin for verify-nav-latency.mjs (which proves paint geometry in a real browser):
 * jsdom here pins the structural contract every `loading.tsx` relies on — the `[data-skeleton]`
 * hooks, the accessible `role=status`/`aria-busy` wrapper, per-variant bodies, and the home
 * `loading.tsx`'s static shell chrome keeping the bottom nav + active "Dashboard" tab present.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { RouteSkeleton, type SkeletonVariant } from "@/app/shell/RouteSkeleton";
import HomeLoading from "@/app/loading";

afterEach(cleanup);

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
