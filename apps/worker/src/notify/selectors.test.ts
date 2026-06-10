/**
 * Pure SELECTION logic for the three notification triggers (Prompt 41b). Each selector is an IO-free
 * function from already-fetched state → the list of (manager, subject) dispatches to emit. Idempotency
 * does NOT live here — that is the `notification_sent` ledger inside `dispatchToManager`; these only
 * decide WHO to notify and with WHICH subjectId on a single firing.
 */
import { describe, it, expect } from "vitest";
import {
  selectDraftTurnNotifications,
  selectPlayersNotStarting,
  selectMatchStartingNotifications,
} from "./selectors";

describe("selectDraftTurnNotifications — the on-the-clock manager per active draft", () => {
  it("emits one dispatch for the current manager, keyed ${draftId}:${pickNo}", () => {
    const out = selectDraftTurnNotifications([
      { draftId: "d1", status: "active", currentManagerId: "m2", currentPickNo: 7 },
    ]);
    expect(out).toEqual([{ managerId: "m2", subjectId: "d1:7" }]);
  });

  it("skips a draft that is not active", () => {
    const out = selectDraftTurnNotifications([
      { draftId: "d1", status: "pending", currentManagerId: "m1", currentPickNo: 1 },
      { draftId: "d2", status: "complete", currentManagerId: null, currentPickNo: null },
    ]);
    expect(out).toEqual([]);
  });

  it("skips an active draft with no pointer (mid-advance / not yet started)", () => {
    const out = selectDraftTurnNotifications([
      { draftId: "d1", status: "active", currentManagerId: null, currentPickNo: 4 },
      { draftId: "d2", status: "active", currentManagerId: "m3", currentPickNo: null },
    ]);
    expect(out).toEqual([]);
  });

  it("handles multiple concurrent active drafts independently", () => {
    const out = selectDraftTurnNotifications([
      { draftId: "d1", status: "active", currentManagerId: "m1", currentPickNo: 3 },
      { draftId: "d2", status: "active", currentManagerId: "m9", currentPickNo: 12 },
    ]);
    expect(out).toEqual([
      { managerId: "m1", subjectId: "d1:3" },
      { managerId: "m9", subjectId: "d2:12" },
    ]);
  });
});

describe("selectPlayersNotStarting — fantasy starters absent from the official XI", () => {
  const xi = [10, 20, 30]; // official-XI player BDL ids

  it("notifies the owner of a fantasy starter whose player is NOT in the XI and is still unlocked", () => {
    const out = selectPlayersNotStarting(xi, [
      {
        managerId: "mA",
        playerId: "pX",
        playerBdlId: 99,
        playerName: "Reserve Rae",
        lockedAt: null,
      },
    ]);
    expect(out).toEqual([{ managerId: "mA", playerId: "pX", playerName: "Reserve Rae" }]);
  });

  it("does NOT notify when the fantasy starter IS in the official XI", () => {
    const out = selectPlayersNotStarting(xi, [
      {
        managerId: "mA",
        playerId: "pX",
        playerBdlId: 20,
        playerName: "Starter Sam",
        lockedAt: null,
      },
    ]);
    expect(out).toEqual([]);
  });

  it("does NOT notify a slot that is already locked (the swap window has closed)", () => {
    const out = selectPlayersNotStarting(xi, [
      {
        managerId: "mA",
        playerId: "pX",
        playerBdlId: 99,
        playerName: "Locked Lou",
        lockedAt: new Date("2026-06-10T18:00:00Z"),
      },
    ]);
    expect(out).toEqual([]);
  });

  it("only considers the supplied slots (benched correctly = not a starter = never passed in)", () => {
    // The store query only returns is_starter slots, so a bench fantasy slot never reaches the selector.
    const out = selectPlayersNotStarting(xi, [
      { managerId: "mA", playerId: "p1", playerBdlId: 99, playerName: "Out One", lockedAt: null },
      { managerId: "mB", playerId: "p2", playerBdlId: 10, playerName: "In Two", lockedAt: null },
      { managerId: "mC", playerId: "p3", playerBdlId: 88, playerName: "Out Three", lockedAt: null },
    ]);
    expect(out).toEqual([
      { managerId: "mA", playerId: "p1", playerName: "Out One" },
      { managerId: "mC", playerId: "p3", playerName: "Out Three" },
    ]);
  });

  it("an empty official XI (feed gave nothing) notifies every unlocked fantasy starter", () => {
    const out = selectPlayersNotStarting(
      [],
      [{ managerId: "mA", playerId: "p1", playerBdlId: 1, playerName: "A", lockedAt: null }],
    );
    expect(out).toEqual([{ managerId: "mA", playerId: "p1", playerName: "A" }]);
  });
});

describe("selectMatchStartingNotifications — owners of either team, kickoff within the lead window", () => {
  const NOW = new Date("2026-06-10T18:00:00Z");
  const LEAD = 15 * 60_000;
  const k = (offsetMin: number) => NOW.getTime() + offsetMin * 60_000;

  it("emits one dispatch per owner for a match kicking off inside the window, keyed by matchId", () => {
    const out = selectMatchStartingNotifications(
      [
        {
          matchId: "match-1",
          kickoffMs: k(10),
          label: "Brazil vs Spain",
          ownerManagerIds: ["m1", "m2"],
        },
      ],
      NOW,
      LEAD,
    );
    expect(out).toEqual([
      { managerId: "m1", subjectId: "match-1", matchId: "match-1", matchLabel: "Brazil vs Spain" },
      { managerId: "m2", subjectId: "match-1", matchId: "match-1", matchLabel: "Brazil vs Spain" },
    ]);
  });

  it("excludes a match whose kickoff is beyond the lead window", () => {
    const out = selectMatchStartingNotifications(
      [{ matchId: "match-1", kickoffMs: k(16), label: "Far vs Off", ownerManagerIds: ["m1"] }],
      NOW,
      LEAD,
    );
    expect(out).toEqual([]);
  });

  it("excludes a match that has already kicked off (kickoff in the past)", () => {
    const out = selectMatchStartingNotifications(
      [
        {
          matchId: "match-1",
          kickoffMs: k(-1),
          label: "Started vs Already",
          ownerManagerIds: ["m1"],
        },
      ],
      NOW,
      LEAD,
    );
    expect(out).toEqual([]);
  });

  it("includes the exact window boundaries (now and now+lead)", () => {
    const out = selectMatchStartingNotifications(
      [
        { matchId: "at-now", kickoffMs: k(0), label: "A vs B", ownerManagerIds: ["m1"] },
        { matchId: "at-lead", kickoffMs: k(15), label: "C vs D", ownerManagerIds: ["m2"] },
      ],
      NOW,
      LEAD,
    );
    expect(out.map((n) => n.matchId)).toEqual(["at-now", "at-lead"]);
  });

  it("emits nothing for an in-window match with no owners on either team", () => {
    const out = selectMatchStartingNotifications(
      [{ matchId: "match-1", kickoffMs: k(5), label: "Nobody vs Cares", ownerManagerIds: [] }],
      NOW,
      LEAD,
    );
    expect(out).toEqual([]);
  });
});
