// @vitest-environment jsdom
/**
 * T8 — END-TO-END proof that the Waivers free-agent picker shows each free agent's NEXT opponent
 * ("vs / @ + flag + name"), mirroring the set-lineup OpponentTag. Following the P48/P54 lesson (a source
 * smoke does NOT prove a user path) this MOUNTS the real {@link FreeAgentPanel} — the actual FA picker
 * surface — and asserts the opponent the loader threaded onto each {@link WvPlayer} renders on the row:
 *   • a HOME fixture renders "vs <opp>";
 *   • an AWAY fixture renders "@ <opp>";
 *   • a player whose team has no fixture this period (opponent === null) renders "TBD".
 *
 * The opponent value is a pure WvPlayer field here (the loader-thread is guarded separately by the
 * source-contract smoke, since `loadWaivers` needs a live DB); this proves the presentation path only.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FreeAgentPanel } from "./FreeAgentPanel";
import type { OpponentInfo, WvPlayer } from "./types";

afterEach(cleanup);

function fa(id: string, over: Partial<WvPlayer> = {}): WvPlayer {
  return {
    id,
    name: over.name ?? id,
    shortName: over.shortName ?? id,
    position: over.position ?? "MID",
    nation: over.nation ?? "Spain",
    teamName: over.teamName ?? null,
    // kickoffAt null ⇒ never cutoff-passed ⇒ the row is always claimable (independent of `now`).
    kickoffAt: null,
    seasonPoints: over.seasonPoints ?? null,
    opponent: over.opponent,
  };
}

const home: OpponentInfo = { opponentName: "France", opponentNation: "France", isHome: true };
const away: OpponentInfo = { opponentName: "Brazil", opponentNation: "Brazil", isHome: false };

function mount(freeAgents: WvPlayer[]) {
  render(
    <FreeAgentPanel
      enabled
      rosterCap={15}
      freeAgents={freeAgents}
      claims={[]}
      roster={[]}
      lockedPlayerIds={[]}
      now={new Date("2026-06-20T00:00:00Z")}
      submitting={false}
      errorMessage={null}
      onGrant={() => {}}
      onOpen={() => {}}
    />,
  );
}

describe("Free-agent picker — next opponent on each row", () => {
  it("renders 'vs <opp>' for a home fixture", () => {
    mount([fa("h", { shortName: "Home Guy", opponent: home })]);
    // The opponent name is a bare text node beside the flag span, so assert on the run's text content
    // (anchored by the stable title); the flag itself carries the nation via aria-label/title.
    const tag = screen.getByTitle("Next: vs France");
    expect(tag.textContent).toContain("vs");
    expect(tag.textContent).toContain("France");
    expect(tag.querySelector(".flag-emoji")).toBeTruthy();
  });

  it("renders '@ <opp>' for an away fixture", () => {
    mount([fa("a", { shortName: "Away Guy", opponent: away })]);
    const tag = screen.getByTitle("Next: @ Brazil");
    expect(tag.textContent).toContain("@");
    expect(tag.textContent).toContain("Brazil");
    expect(tag.querySelector(".flag-emoji")).toBeTruthy();
  });

  it("renders 'TBD' when the player's team has no fixture this period (opponent null)", () => {
    mount([fa("t", { shortName: "Tbd Guy", opponent: null })]);
    expect(screen.getByLabelText("Next opponent TBD")).toBeTruthy();
  });

  it("shows each free agent's own opponent across a mixed pool", () => {
    mount([
      fa("h", { shortName: "Home Guy", opponent: home }),
      fa("a", { shortName: "Away Guy", opponent: away }),
      fa("t", { shortName: "Tbd Guy", opponent: null }),
    ]);
    expect(screen.getByTitle("Next: vs France")).toBeTruthy();
    expect(screen.getByTitle("Next: @ Brazil")).toBeTruthy();
    expect(screen.getByLabelText("Next opponent TBD")).toBeTruthy();
  });
});
