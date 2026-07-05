// @vitest-environment jsdom
/**
 * `/games/[matchId]` not-found.tsx (F-P1-ERR1, T15-5) — the scoped 404 that resolves the page's
 * `if (!view) notFound()` call to branded content instead of the bare root default.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import MatchNotFound from "./not-found";

afterEach(cleanup);

describe("games/[matchId] not-found.tsx", () => {
  it("renders branded match-scoped 404 copy", () => {
    render(<MatchNotFound />);
    expect(screen.getByText("404")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Match not found" })).toBeTruthy();
  });

  it("offers a link back to the dashboard", () => {
    render(<MatchNotFound />);
    const link = screen.getByRole("link", { name: /back to dashboard/i });
    expect(link.getAttribute("href")).toBe("/");
  });
});
