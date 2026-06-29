import { describe, it, expect } from "vitest";
import type { SessionManagerOutcome } from "@app/auth";
import {
  handleSubmitPick,
  handleReadPicks,
  type PoolPickDeps,
  type SubmitPickBody,
} from "./handlePick";
import { MemoryPoolPickStore } from "./memoryStore";

const T = new Date("2026-06-12T12:00:00.000Z");
const future = new Date(T.getTime() + 60 * 60 * 1000); // T + 1h
const past = new Date(T.getTime() - 60 * 60 * 1000); // T − 1h

function ok(managerId: string, isCommissioner = false): SessionManagerOutcome {
  return {
    kind: "ok",
    manager: {
      id: managerId,
      userId: `u_${managerId}`,
      email: `${managerId}@x.com`,
      isCommissioner,
      displayName: managerId,
    },
    isCommissioner,
  };
}

function deps(
  outcome: SessionManagerOutcome,
  store: MemoryPoolPickStore,
  now: Date = T,
): PoolPickDeps {
  return { resolveManager: async () => outcome, store, now };
}

/** Both sides resolved to real nation names — the default for every fixture that isn't testing the SEC-P4 guard. */
const RESOLVED = { homeTeamName: "Brazil", awayTeamName: "Argentina" } as const;

/** A store seeded with one manager (m1 in lg1) and the submittable/edge matches (incl. SEC-P4 undecided ones). */
function submitStore(): MemoryPoolPickStore {
  return (
    new MemoryPoolPickStore()
      .setManagerLeague("m1", "lg1")
      .setMatch("g-open", {
        status: "scheduled",
        periodKind: "group_md",
        kickoffAt: future,
        ...RESOLVED,
      })
      .setMatch("g-locked", {
        status: "scheduled",
        periodKind: "group_md",
        kickoffAt: past,
        ...RESOLVED,
      })
      .setMatch("k-open", {
        status: "scheduled",
        periodKind: "knockout_round",
        kickoffAt: future,
        ...RESOLVED,
      })
      // SEC-P4 fixtures: an undecided knockout with a `Team {id}` placeholder side, and one with a null FK.
      .setMatch("k-undecided", {
        status: "scheduled",
        periodKind: "knockout_round",
        kickoffAt: future,
        homeTeamName: "Team 273",
        awayTeamName: "Brazil",
      })
      .setMatch("k-null", {
        status: "scheduled",
        periodKind: "knockout_round",
        kickoffAt: future,
        homeTeamName: "Argentina",
        awayTeamName: null,
      })
  );
}

const submit = (over: Partial<SubmitPickBody> = {}): SubmitPickBody => ({
  managerId: "m1",
  matchId: "g-open",
  prediction: "HOME",
  ...over,
});

describe("handleSubmitPick", () => {
  it("401 when there is no session (before any store access)", async () => {
    const res = await handleSubmitPick(deps({ kind: "no-session" }, submitStore()), submit());
    expect(res.status).toBe(401);
  });

  it("403 not_allowlisted / no_manager", async () => {
    const a = await handleSubmitPick(
      deps({ kind: "not-allowlisted", email: "x@x.com" }, submitStore()),
      submit(),
    );
    expect(a.status).toBe(403);
    const b = await handleSubmitPick(
      deps({ kind: "no-manager", userId: "u" }, submitStore()),
      submit(),
    );
    expect(b.status).toBe(403);
  });

  it("403 when submitting for ANOTHER manager (own-row enforcement; commissioner has no override)", async () => {
    const res = await handleSubmitPick(
      deps(ok("m1", true), submitStore()),
      submit({ managerId: "m2" }),
    );
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "not_your_manager" });
  });

  it("404 when the match is unknown", async () => {
    const res = await handleSubmitPick(deps(ok("m1"), submitStore()), submit({ matchId: "nope" }));
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "unknown_match" });
  });

  it("409 pick-locked once the match has kicked off", async () => {
    const res = await handleSubmitPick(
      deps(ok("m1"), submitStore()),
      submit({ matchId: "g-locked" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "pick-locked" });
  });

  it("409 when DRAW is submitted for a knockout match", async () => {
    const res = await handleSubmitPick(
      deps(ok("m1"), submitStore()),
      submit({ matchId: "k-open", prediction: "DRAW" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "draw-not-allowed-knockout" });
  });

  it("409 pick-on-undecided-match when a knockout side is a placeholder team (SEC-P4)", async () => {
    const res = await handleSubmitPick(
      deps(ok("m1"), submitStore()),
      submit({ matchId: "k-undecided", prediction: "HOME" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "pick-on-undecided-match" });
  });

  it("409 pick-on-undecided-match when a knockout side is a null FK (SEC-P4)", async () => {
    const res = await handleSubmitPick(
      deps(ok("m1"), submitStore()),
      submit({ matchId: "k-null", prediction: "AWAY" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "pick-on-undecided-match" });
  });

  it("200 on a RESOLVED knockout fixture — the SEC-P4 guard does not over-reject", async () => {
    const res = await handleSubmitPick(
      deps(ok("m1"), submitStore()),
      submit({ matchId: "k-open", prediction: "HOME" }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, pick: { matchId: "k-open", prediction: "HOME" } });
  });

  it("409 DRAW on the 3rd-place play-off — getMatchFacts resolves is_third_place → knockout_round (T-3RD)", async () => {
    // The production getMatchFacts (prismaStore) resolves the period-less 3rd-place match to knockout_round
    // via resolvePoolPeriod, so the handler rejects a DRAW on it exactly like any other knockout 2-way.
    // Seeded with RESOLVED teams so the DRAW rule (not the SEC-P4 undecided guard) is what fires.
    const store = new MemoryPoolPickStore().setManagerLeague("m1", "lg1").setMatch("tp", {
      status: "scheduled",
      periodKind: "knockout_round",
      kickoffAt: future,
      ...RESOLVED,
    });
    const res = await handleSubmitPick(
      deps(ok("m1"), store),
      submit({ matchId: "tp", prediction: "DRAW" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "draw-not-allowed-knockout" });
  });

  it("409 pick-on-undecided-match on the 3rd-place play-off while TBD; 200 once both teams resolve (SEC-P4 + T-3RD)", async () => {
    // The 3rd-place match is a synthesized knockout_round (T-3RD). Until the semis are played both sides are
    // `Team {id}` placeholders → the undecided guard rejects ANY pick; once resolved, a HOME pick succeeds.
    const tbd = new MemoryPoolPickStore().setManagerLeague("m1", "lg1").setMatch("tp", {
      status: "scheduled",
      periodKind: "knockout_round",
      kickoffAt: future,
      homeTeamName: "Team 11",
      awayTeamName: "Team 12",
    });
    const rejected = await handleSubmitPick(
      deps(ok("m1"), tbd),
      submit({ matchId: "tp", prediction: "HOME" }),
    );
    expect(rejected.status).toBe(409);
    expect(rejected.body).toMatchObject({ error: "pick-on-undecided-match" });

    const resolved = new MemoryPoolPickStore().setManagerLeague("m1", "lg1").setMatch("tp", {
      status: "scheduled",
      periodKind: "knockout_round",
      kickoffAt: future,
      homeTeamName: "Croatia",
      awayTeamName: "Morocco",
    });
    const accepted = await handleSubmitPick(
      deps(ok("m1"), resolved),
      submit({ matchId: "tp", prediction: "HOME" }),
    );
    expect(accepted.status).toBe(200);
  });

  it("200 creates then UPSERTS the same (manager, match) pick", async () => {
    const store = submitStore();
    const first = await handleSubmitPick(deps(ok("m1"), store), submit({ prediction: "HOME" }));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      ok: true,
      pick: { managerId: "m1", matchId: "g-open", prediction: "HOME" },
    });

    const second = await handleSubmitPick(deps(ok("m1"), store), submit({ prediction: "AWAY" }));
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ ok: true, pick: { prediction: "AWAY" } });
    // Upsert, not insert: still exactly one row for (m1, g-open), now AWAY.
    expect(store.rows.filter((r) => r.managerId === "m1" && r.matchId === "g-open")).toHaveLength(
      1,
    );
    expect(store.rows.find((r) => r.managerId === "m1" && r.matchId === "g-open")?.prediction).toBe(
      "AWAY",
    );
  });

  it("allows DRAW on a group match", async () => {
    const res = await handleSubmitPick(
      deps(ok("m1"), submitStore()),
      submit({ prediction: "DRAW" }),
    );
    expect(res.status).toBe(200);
  });
});

describe("handleReadPicks (anti-copying)", () => {
  function readStore(): MemoryPoolPickStore {
    return new MemoryPoolPickStore()
      .setManagerLeague("m1", "lg1")
      .setManagerLeague("m2", "lg1")
      .setMatch("g-done", {
        status: "completed",
        periodKind: "group_md",
        kickoffAt: past,
        ...RESOLVED,
      })
      .setMatch("g-future", {
        status: "scheduled",
        periodKind: "group_md",
        kickoffAt: future,
        ...RESOLVED,
      })
      .seedPick({ leagueId: "lg1", managerId: "m1", matchId: "g-done", prediction: "DRAW" })
      .seedPick({ leagueId: "lg1", managerId: "m1", matchId: "g-future", prediction: "HOME" })
      .seedPick({ leagueId: "lg1", managerId: "m2", matchId: "g-done", prediction: "AWAY" })
      .seedPick({ leagueId: "lg1", managerId: "m2", matchId: "g-future", prediction: "HOME" });
  }

  it("401 when there is no session", async () => {
    const res = await handleReadPicks(deps({ kind: "no-session" }, readStore()));
    expect(res.status).toBe(401);
  });

  it("returns the caller's own picks always + others' picks ONLY for kicked-off matches", async () => {
    const res = await handleReadPicks(deps(ok("m1"), readStore()));
    expect(res.status).toBe(200);
    const picks = (res.body as { picks: { managerId: string; matchId: string }[] }).picks;
    const keys = picks.map((p) => `${p.managerId}/${p.matchId}`).sort();
    // own: both g-done + g-future. other (m2): only g-done (kicked off). NOT m2/g-future.
    expect(keys).toEqual(["m1/g-done", "m1/g-future", "m2/g-done"]);
  });
});
