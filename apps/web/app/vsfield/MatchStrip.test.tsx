// @vitest-environment jsdom
/**
 * REAL interaction proof that each fixture card is a tap target to /games/<matchId> (mirrors the
 * dashboard MatchRow precedent). The source-contract smoke test (vsFieldSkin.test.ts) pins the JSX
 * string; this renders the real component in jsdom and asserts the resulting anchor's href.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MatchStrip } from "./components";
import type { MatchView } from "@app/vsfield";

afterEach(cleanup);

function match(over: Partial<MatchView> & Pick<MatchView, "matchId">): MatchView {
  return {
    matchId: over.matchId,
    homeTeamName: over.homeTeamName ?? "Home",
    awayTeamName: over.awayTeamName ?? "Away",
    status: over.status ?? "scheduled",
    kickoffAt: over.kickoffAt ?? "2026-06-30T12:00:00.000Z",
    homeScore: over.homeScore ?? null,
    awayScore: over.awayScore ?? null,
    startsInMinutes: over.startsInMinutes ?? 90,
  };
}

describe("MatchStrip — fixture cards link to the match detail page", () => {
  it("renders each match as a real <a href> to /games/<matchId>, not an inert div", () => {
    render(<MatchStrip matches={[match({ matchId: "m-123" })]} />);
    const link = screen.getByRole("link");
    // T15-CUT rider F-P3-A4: the link carries its origin tab so the match page lights the right slot.
    expect(link.getAttribute("href")).toBe("/games/m-123?from=vsfield");
  });

  it("renders one link per match, each pointing at its own matchId", () => {
    render(<MatchStrip matches={[match({ matchId: "m-1" }), match({ matchId: "m-2" })]} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/games/m-1?from=vsfield",
      "/games/m-2?from=vsfield",
    ]);
  });
});
