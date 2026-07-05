// @vitest-environment jsdom
/**
 * `/games/[matchId]` loading.tsx (F-P2-ERR1, T15-5) — the one route NAV-LAT's loading.tsx sweep left
 * uncovered (AppShell mounts in this route's `page.tsx`, not a `layout.tsx`). Mirrors the structural
 * assertions `app/shell/routeSkeleton.dom.test.tsx` already runs against `app/loading.tsx` (the other
 * shell-in-page.tsx route): a real `RouteSkeleton` mount (not a spinner), plus the static inert shell
 * chrome staying visible around it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import GameLoading from "./loading";

afterEach(cleanup);

describe("games/[matchId] loading.tsx", () => {
  it("mounts a real RouteSkeleton (pitch variant), not a spinner", () => {
    const { container } = render(<GameLoading />);
    const skel = container.querySelector("[data-skeleton]");
    expect(skel).not.toBeNull();
    expect(skel!.getAttribute("data-skeleton-variant")).toBe("pitch");
  });

  it("renders static top-strip and bottom-bar chrome around the skeleton", () => {
    const { container } = render(<GameLoading />);
    expect(container.querySelector(".sh-topbar")).not.toBeNull();
    expect(container.querySelector(".sh-btmnav")).not.toBeNull();
  });

  it("highlights the 'pool' tab as the documented fallback-active tab", () => {
    const { container } = render(<GameLoading />);
    const activeBottom = container.querySelectorAll(".sh-btnav-item.is-active");
    expect(activeBottom.length).toBe(1);
    expect(activeBottom[0]!.textContent).toContain("Quiniela");

    const activeTop = container.querySelector(".sh-topnav .sh-nav-item.is-active");
    expect(activeTop).not.toBeNull();
    expect(activeTop!.textContent).toContain("Quiniela");
  });
});
