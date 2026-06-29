/**
 * SEC-P4 no-drift proof: the SERVER write-time guard (`@app/pool` validatePickSubmission → the
 * `pick-on-undecided-match` rejection) and the UI pickability gate (`poolView` isKnockoutFixturePickable,
 * which hides the pick controls) MUST agree on EXACTLY the same set of knockout fixtures. Both now bottom out
 * in the one shared predicate `isPlaceholderTeamName` (lifted into @app/pool), so a future edit to the regex
 * can't silently desync "what the UI hides" from "what the server rejects". This test fails if they diverge.
 */
import { describe, it, expect } from "vitest";
import { validatePickSubmission, type PoolPickFacts } from "@app/pool";
import { isKnockoutFixturePickable } from "./poolView";
import type { PoolTeam } from "./types";

const KICKOFF = new Date("2026-07-10T18:00:00.000Z");
const OPEN = new Date(KICKOFF.getTime() - 1); // before kickoff → not locked

const resolved = (name: string): PoolTeam => ({ name, code: "XX" });
const placeholder = (id: number): PoolTeam => ({ name: `Team ${id}`, code: null });

/** The UI fixture shape and the server facts shape, derived from ONE pair of sides (no separate encodings). */
function bothViews(home: PoolTeam | null, away: PoolTeam | null) {
  const fixture = { home, away };
  const facts: PoolPickFacts = {
    status: "scheduled",
    kickoffAt: KICKOFF,
    periodKind: "knockout_round",
    homeTeamName: home?.name ?? null,
    awayTeamName: away?.name ?? null,
  };
  return { fixture, facts };
}

const CASES: { label: string; home: PoolTeam | null; away: PoolTeam | null }[] = [
  { label: "both resolved", home: resolved("Brazil"), away: resolved("Argentina") },
  { label: "home placeholder", home: placeholder(273), away: resolved("Brazil") },
  { label: "away placeholder", home: resolved("Brazil"), away: placeholder(9) },
  { label: "home null FK", home: null, away: resolved("Brazil") },
  { label: "away null FK", home: resolved("Brazil"), away: null },
  { label: "both placeholder", home: placeholder(11), away: placeholder(12) },
  { label: "both null FK", home: null, away: null },
];

describe("SEC-P4 — server undecided guard agrees with the UI isKnockoutFixturePickable gate", () => {
  for (const { label, home, away } of CASES) {
    it(`agree on a knockout fixture: ${label}`, () => {
      const { fixture, facts } = bothViews(home, away);
      const uiPickable = isKnockoutFixturePickable(fixture);
      const serverRejectsUndecided =
        validatePickSubmission("HOME", facts, OPEN)?.code === "pick-on-undecided-match";
      // The server rejects an undecided fixture EXACTLY when the UI hides its pick controls.
      expect(serverRejectsUndecided).toBe(!uiPickable);
    });
  }

  it("a RESOLVED knockout fixture is accepted by the server and pickable in the UI", () => {
    const { fixture, facts } = bothViews(resolved("Croatia"), resolved("Morocco"));
    expect(isKnockoutFixturePickable(fixture)).toBe(true);
    expect(validatePickSubmission("HOME", facts, OPEN)).toBeNull();
  });
});
