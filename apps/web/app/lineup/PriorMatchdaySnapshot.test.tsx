// @vitest-environment jsdom
/**
 * REAL render proof for T11 Fix A: a PRIOR (read-only) matchday must show the HISTORICAL lineup it was
 * actually set with — including a player who was FIELDED that matchday but DROPPED from the roster
 * afterward. Such a player is no longer in the live `squad` (roster_player.dropped_at IS NULL), but his
 * locked `lineup_slot` row for the played matchday survives the drop, so the loader hands the client a
 * per-period `snapshotPlayers` set to render from. This mounts the REAL {@link SetLineupClient} and asserts
 * the since-dropped starter appears on the prior matchday's pitch; the control proves that WITHOUT the
 * snapshot (the editable current period, which renders from `squad`) the same id would not appear — so the
 * assertion is not vacuous and the fix is what makes the dropped man visible.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SetLineupClient } from "./SetLineupClient";
import type { LineupPlayer, PeriodLineup, SetLineupState } from "../../src/lineup/types";
import { POSITIONS, type Position } from "@app/shared";

afterEach(cleanup);

function player(id: string, position: Position): LineupPlayer {
  return {
    id,
    displayName: id.toUpperCase(),
    firstName: "X",
    lastName: id,
    position,
    country: null,
  };
}

// The manager's CURRENT active roster (2 GK / 5 DEF / 5 MID / 3 FWD = 15). It deliberately does NOT
// contain `dropped1` — he was cut after the matchday, so he is absent from roster_player WHERE
// dropped_at IS NULL, exactly like production.
function currentSquad(): LineupPlayer[] {
  const counts: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
  const out: LineupPlayer[] = [];
  for (const pos of POSITIONS)
    for (let i = 0; i < counts[pos]; i++) out.push(player(`${pos.toLowerCase()}${i + 1}`, pos));
  return out;
}

// The since-dropped player who was FIELDED in the prior matchday (a FWD starter). His shortName is
// "X. dropped1" (firstName initial + lastName), the label the pitch token renders.
const DROPPED = player("dropped1", "FWD");
const DROPPED_LABEL = "X. dropped1";

// The XI the manager actually set that matchday (1-4-3-3): ten still-rostered men + the dropped FWD.
const snapshotStarters: LineupPlayer[] = [
  player("gk1", "GK"),
  player("def1", "DEF"),
  player("def2", "DEF"),
  player("def3", "DEF"),
  player("def4", "DEF"),
  player("mid1", "MID"),
  player("mid2", "MID"),
  player("mid3", "MID"),
  player("fwd1", "FWD"),
  player("fwd2", "FWD"),
  DROPPED,
];

function priorPeriod(withSnapshot: boolean): PeriodLineup {
  const starterIds = snapshotStarters.map((p) => p.id);
  return {
    periodId: "md1",
    label: "MD1",
    kind: "group_md",
    status: "open", // read-only must rest on `readOnly`, not status (status lags in prod)
    readOnly: true,
    closesAt: "2099-01-01T00:00:00.000Z",
    starterIds,
    // The whole XI is played/locked (a completed matchday) — every slot frozen.
    locks: starterIds.map((id) => ({ playerId: id, isStarter: true })),
    slotMeta: Object.fromEntries(
      starterIds.map((id) => [
        id,
        { hasPlayed: true, pointsAtStake: 0, voided: false, movable: false },
      ]),
    ),
    kickoffByPlayer: {},
    opponentByPlayer: {},
    // The fix under test: the loader populates this with the period's lineup_slot players (incl. dropped).
    ...(withSnapshot ? { snapshotPlayers: snapshotStarters } : {}),
  };
}

function stateFor(withSnapshot: boolean): SetLineupState {
  return {
    sessionManagerId: "m1",
    displayName: "Los Dragones",
    squad: currentSquad(),
    periods: [priorPeriod(withSnapshot)],
    activePeriodId: "md1",
    timezone: "UTC",
  };
}

describe("set-lineup — a PRIOR matchday shows the HISTORICAL lineup incl. since-dropped players (T11 Fix A)", () => {
  it("renders the since-dropped fielded starter from the period's snapshot", () => {
    render(<SetLineupClient initialState={stateFor(true)} />);
    // A still-rostered starter renders (proves the harness mounts the pitch)…
    expect(screen.getByText("X. gk1")).toBeTruthy();
    // …and so does the since-dropped FWD — the bug was that he was silently omitted.
    expect(screen.getByText(DROPPED_LABEL)).toBeTruthy();
  });

  it("CONTROL: without the snapshot he is absent (renders from the live squad) — assertion not vacuous", () => {
    render(<SetLineupClient initialState={stateFor(false)} />);
    // Still-rostered starters render from `squad`…
    expect(screen.getByText("X. gk1")).toBeTruthy();
    // …but the dropped player (not in `squad`, no snapshot) does not — exactly the pre-fix behaviour.
    expect(screen.queryByText(DROPPED_LABEL)).toBeNull();
  });
});
