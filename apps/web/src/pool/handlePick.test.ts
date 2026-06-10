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

/** A store seeded with one manager (m1 in lg1) and three submittable/edge matches. */
function submitStore(): MemoryPoolPickStore {
  return new MemoryPoolPickStore()
    .setManagerLeague("m1", "lg1")
    .setMatch("g-open", { status: "scheduled", periodKind: "group_md", kickoffAt: future })
    .setMatch("g-locked", { status: "scheduled", periodKind: "group_md", kickoffAt: past })
    .setMatch("k-open", { status: "scheduled", periodKind: "knockout_round", kickoffAt: future });
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
      .setMatch("g-done", { status: "completed", periodKind: "group_md", kickoffAt: past })
      .setMatch("g-future", { status: "scheduled", periodKind: "group_md", kickoffAt: future })
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
