import { describe, it, expect } from "vitest";
import {
  COMMISSIONER_EMAIL,
  isCommissionerActor,
  resolvePlayer,
  resolveTeam,
  kickoffGuard,
  rosterEndStateHolds,
  lineupEndStateHolds,
  relaxPeriodLock,
  formatAudit,
  type NamedPlayer,
  type NamedTeam,
} from "./core";

const players: NamedPlayer[] = [
  { id: "p1", displayName: "Kylian Mbappé", firstName: "Kylian", lastName: "Mbappé" },
  { id: "p2", displayName: "Jude Bellingham", firstName: "Jude", lastName: "Bellingham" },
  { id: "p3", displayName: "Bellingham Jr", firstName: "Jobe", lastName: "Bellingham" },
];

const teams: NamedTeam[] = [
  { managerId: "m1", displayName: "Los Dragones" },
  { managerId: "m2", displayName: "Sergio's XI" },
];

describe("commissioner gate", () => {
  it("accepts a manager flagged isCommissioner", () => {
    expect(isCommissionerActor({ email: "anyone@x.com", isCommissioner: true })).toBe(true);
  });
  it("accepts the hardcoded commissioner email regardless of the flag (case-insensitive)", () => {
    expect(isCommissionerActor({ email: COMMISSIONER_EMAIL, isCommissioner: false })).toBe(true);
    expect(isCommissionerActor({ email: "SMRIOS07@GMAIL.COM", isCommissioner: false })).toBe(true);
  });
  it("refuses a non-commissioner", () => {
    expect(isCommissionerActor({ email: "rando@x.com", isCommissioner: false })).toBe(false);
    expect(isCommissionerActor({ email: null, isCommissioner: false })).toBe(false);
  });
});

describe("name → id resolution (ambiguity is an error, not a guess)", () => {
  it("resolves an exact display name (case-insensitive)", () => {
    const r = resolvePlayer(players, "kylian mbappé");
    expect(r).toEqual({ kind: "ok", value: players[0] });
  });
  it("resolves a unique partial match", () => {
    expect(resolvePlayer(players, "Mbapp")).toEqual({ kind: "ok", value: players[0] });
  });
  it("returns ambiguous with the candidates when a partial matches several", () => {
    const r = resolvePlayer(players, "Bellingham");
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") expect(r.candidates.map((c) => c.id).sort()).toEqual(["p2", "p3"]);
  });
  it("prefers an EXACT match even when a partial would be ambiguous", () => {
    // "Bellingham Jr" is an exact displayName → unambiguous despite "Bellingham" partials.
    expect(resolvePlayer(players, "Bellingham Jr")).toEqual({ kind: "ok", value: players[2] });
  });
  it("returns none when nothing matches", () => {
    expect(resolvePlayer(players, "Haaland")).toEqual({ kind: "none" });
  });
  it("resolves a team label (case-insensitive) and reports none", () => {
    expect(resolveTeam(teams, "los dragones")).toEqual({ kind: "ok", value: teams[0] });
    expect(resolveTeam(teams, "Nobody United")).toEqual({ kind: "none" });
  });
});

describe("per-player kickoff guard (default-block on an already-played add)", () => {
  const now = new Date("2026-06-11T20:00:00Z");
  it("does NOT block a future kickoff", () => {
    const g = kickoffGuard({
      addMatchKickoffAt: new Date("2026-06-12T16:00:00Z"),
      now,
      allowPostKickoff: false,
    });
    expect(g).toEqual({ alreadyPlayed: false, blocked: false });
  });
  it("BLOCKS an already-kicked-off add by default", () => {
    const g = kickoffGuard({
      addMatchKickoffAt: new Date("2026-06-11T19:00:00Z"),
      now,
      allowPostKickoff: false,
    });
    expect(g).toEqual({ alreadyPlayed: true, blocked: true });
  });
  it("honors --allow-post-kickoff: already-played but NOT blocked", () => {
    const g = kickoffGuard({
      addMatchKickoffAt: new Date("2026-06-11T19:00:00Z"),
      now,
      allowPostKickoff: true,
    });
    expect(g).toEqual({ alreadyPlayed: true, blocked: false });
  });
  it("no fixture → never already-played", () => {
    expect(kickoffGuard({ addMatchKickoffAt: null, now, allowPostKickoff: false })).toEqual({
      alreadyPlayed: false,
      blocked: false,
    });
  });
});

describe("idempotency (skip if the end state already holds)", () => {
  it("roster: add already owned and drop already gone → holds", () => {
    const owned = new Set(["p1"]);
    expect(rosterEndStateHolds({ ownedByManager: owned, addId: "p1", dropId: "p2" })).toBe(true);
    expect(rosterEndStateHolds({ ownedByManager: owned, addId: "p1", dropId: null })).toBe(true);
  });
  it("roster: add not owned yet → does not hold", () => {
    expect(rosterEndStateHolds({ ownedByManager: new Set(), addId: "p1", dropId: null })).toBe(
      false,
    );
  });
  it("roster: add owned but drop still owned → does not hold", () => {
    const owned = new Set(["p1", "p2"]);
    expect(rosterEndStateHolds({ ownedByManager: owned, addId: "p1", dropId: "p2" })).toBe(false);
  });
  it("lineup: same set of starters (order-independent) → holds", () => {
    expect(
      lineupEndStateHolds({
        currentStarterIds: ["a", "b", "c"],
        desiredStarterIds: ["c", "a", "b"],
      }),
    ).toBe(true);
    expect(
      lineupEndStateHolds({ currentStarterIds: ["a", "b"], desiredStarterIds: ["a", "c"] }),
    ).toBe(false);
  });
});

describe("relaxPeriodLock (bypass ONLY the edit-window lock)", () => {
  it("forces status open + closesAt null, preserving the id", () => {
    const relaxed = relaxPeriodLock({ id: "md1", status: "closed", closesAt: new Date() });
    expect(relaxed.id).toBe("md1");
    expect(relaxed.status).toBe("open");
    expect(relaxed.closesAt).toBeNull();
  });
});

describe("structured audit line", () => {
  it("emits one line carrying every required field", () => {
    const line = formatAudit({
      command: "roster",
      commissioner: COMMISSIONER_EMAIL,
      team: "Los Dragones",
      managerId: "m1",
      action: "add/drop",
      add: "Kylian Mbappé",
      drop: "Jude Bellingham",
      reason: "missing FA UI blocked the move",
      kickoffBypassed: true,
      timestamp: "2026-06-11T20:00:00.000Z",
    });
    for (const needle of [
      "commish",
      COMMISSIONER_EMAIL,
      "Los Dragones",
      "add/drop",
      "Kylian Mbappé",
      "Jude Bellingham",
      "missing FA UI blocked the move",
      "2026-06-11T20:00:00.000Z",
    ]) {
      expect(line).toContain(needle);
    }
    expect(line).toMatch(/kickoff/i); // the bypass flag is present
    expect(line.split("\n")).toHaveLength(1); // a single structured line
  });
});
