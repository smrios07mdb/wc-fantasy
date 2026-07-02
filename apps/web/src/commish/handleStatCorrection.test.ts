/**
 * Unit tests for the two Thread-2 commissioner write handlers (`handleCommishPenalty` / `handleCommishRating`).
 * Framework-agnostic, DB-free: an injected spy store captures the write + the audit input, and an injected
 * spy `rescore` records the re-score trigger — so every gate, validation, and audit-shape assertion runs with
 * no Prisma. Mirrors the injected-outcome handler tests (handleStartDraft / handleBid).
 */
import { describe, expect, it } from "vitest";
import type { SessionManagerOutcome } from "@app/auth";
import {
  handleCommishPenalty,
  handleCommishRating,
  handleCommishStatCorrection,
  type CommishStatStore,
  type MatchPlayerContext,
  type PenaltyBody,
  type RatingBody,
  type StatBody,
} from "./handleStatCorrection";
import type { StatOverrides } from "@app/recompute";

const OK_COMMISH: SessionManagerOutcome = {
  kind: "ok",
  manager: {
    id: "mgr1",
    userId: "user1",
    email: "c@x.com",
    isCommissioner: true,
    displayName: "C",
  },
  isCommissioner: true,
};
const OK_MEMBER: SessionManagerOutcome = {
  kind: "ok",
  manager: {
    id: "mgr2",
    userId: "user2",
    email: "m@x.com",
    isCommissioner: false,
    displayName: "M",
  },
  isCommissioner: false,
};
const NO_SESSION: SessionManagerOutcome = { kind: "no-session" };
const NOT_ALLOWLISTED: SessionManagerOutcome = { kind: "not-allowlisted", email: "x@x.com" };

const IN_MATCH: MatchPlayerContext = {
  playerTeamId: "tA",
  homeTeamId: "tA",
  awayTeamId: "tB",
  periodId: "pd1",
  periodFrozen: false,
};

function spyStore(over: Partial<CommishStatStore> = {}, priorOverrides: StatOverrides = {}) {
  const penaltyCalls: Parameters<CommishStatStore["applyPenalty"]>[0][] = [];
  const ratingCalls: Parameters<CommishStatStore["applyRating"]>[0][] = [];
  const statCalls: Parameters<CommishStatStore["applyStatCorrection"]>[0][] = [];
  const store: CommishStatStore = {
    getManagerLeagueId: async () => "lg1",
    getMatchPlayer: async () => IN_MATCH,
    applyPenalty: async (input) => {
      penaltyCalls.push(input);
      return { auditId: "aud-pen" };
    },
    applyRating: async (input) => {
      ratingCalls.push(input);
      return { auditId: "aud-rat" };
    },
    getStatOverrides: async () => priorOverrides,
    applyStatCorrection: async (input) => {
      statCalls.push(input);
      return { auditId: "aud-stat" };
    },
    ...over,
  };
  return { store, penaltyCalls, ratingCalls, statCalls };
}

function spyRescore(scored = true) {
  const calls: Array<[string, string]> = [];
  return {
    rescore: async (m: string, p: string) => {
      calls.push([m, p]);
      return { scored };
    },
    calls,
  };
}

const resolver = (o: SessionManagerOutcome) => async () => o;

const penaltyBody = (over: Partial<PenaltyBody> = {}): PenaltyBody => ({
  matchId: "m1",
  playerId: "p1",
  penaltyWon: 1,
  penaltyCommitted: 0,
  reason: "VAR awarded a penalty the feed never tagged",
  ...over,
});
const ratingBody = (over: Partial<RatingBody> = {}): RatingBody => ({
  matchId: "m1",
  playerId: "p1",
  rating: 8.5,
  reason: "Feed rating was clearly wrong for this match",
  ...over,
});
const statBody = (over: Partial<StatBody> = {}): StatBody => ({
  matchId: "m1",
  playerId: "p1",
  overrides: { goals: 2 },
  reason: "Feed missed a goal that VAR later awarded",
  ...over,
});

// ── shared gate (both handlers) ───────────────────────────────────────────────────────────────────
describe("commissioner gate — both handlers reject before any write", () => {
  it("no session → 401 no_session; nothing written or re-scored", async () => {
    const { store, penaltyCalls } = spyStore();
    const { rescore, calls } = spyRescore();
    const res = await handleCommishPenalty(
      { resolveManager: resolver(NO_SESSION), store, rescore },
      penaltyBody(),
    );
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "no_session" });
    expect(penaltyCalls).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("logged-in NON-commissioner → 403 forbidden; nothing written", async () => {
    const { store, penaltyCalls } = spyStore();
    const { rescore } = spyRescore();
    const res = await handleCommishPenalty(
      { resolveManager: resolver(OK_MEMBER), store, rescore },
      penaltyBody(),
    );
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect(penaltyCalls).toHaveLength(0);
  });

  it("not-allowlisted (any non-ok) → 403 forbidden", async () => {
    const { store, ratingCalls } = spyStore();
    const { rescore } = spyRescore();
    const res = await handleCommishRating(
      { resolveManager: resolver(NOT_ALLOWLISTED), store, rescore },
      ratingBody(),
    );
    expect(res.status).toBe(403);
    expect(ratingCalls).toHaveLength(0);
  });
});

// ── B1 penalty ────────────────────────────────────────────────────────────────────────────────────
describe("handleCommishPenalty", () => {
  it("happy path: +2 for penalty_won=1 — upserts the manual row + ONE audit row + fires the re-score", async () => {
    const { store, penaltyCalls } = spyStore();
    const { rescore, calls } = spyRescore();
    const res = await handleCommishPenalty(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      penaltyBody({ penaltyWon: 1, penaltyCommitted: 0 }),
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      penaltyWon: 1,
      penaltyCommitted: 0,
      delta: "+2 pts",
      frozenOverride: false,
      auditId: "aud-pen",
    });

    expect(penaltyCalls).toHaveLength(1); // exactly ONE audit row per write (the store commits both atomically)
    const { write, audit } = penaltyCalls[0]!;
    expect(write).toEqual({
      matchId: "m1",
      playerId: "p1",
      penaltyWon: 1,
      penaltyCommitted: 0,
      reason: "VAR awarded a penalty the feed never tagged",
      enteredByUserId: "user1",
    });
    expect(audit.actionType).toBe("penalty_applied");
    expect(audit.leagueId).toBe("lg1");
    expect(audit.actorUserId).toBe("user1");
    expect(audit.targetRef).toEqual({ matchId: "m1", playerId: "p1" });
    expect(audit.reason).toBe("VAR awarded a penalty the feed never tagged");
    expect(audit.reversible).toBe(true);
    expect(audit.delta).toBe("+2 pts");

    expect(calls).toEqual([["m1", "p1"]]); // re-score fired once, for exactly this (match, player)
  });

  it("penalty_committed=1 → −2 pts delta", async () => {
    const { store, penaltyCalls } = spyStore();
    const { rescore } = spyRescore();
    const res = await handleCommishPenalty(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      penaltyBody({ penaltyWon: 0, penaltyCommitted: 1 }),
    );
    expect(res.status).toBe(200);
    expect((res.body as { delta: string }).delta).toBe("−2 pts");
    expect(penaltyCalls[0]!.audit.delta).toBe("−2 pts");
  });

  it("Clear (0/0) is an absolute, idempotent write — still one audit row + re-score", async () => {
    const { store, penaltyCalls } = spyStore();
    const { rescore, calls } = spyRescore();
    const res = await handleCommishPenalty(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      penaltyBody({ penaltyWon: 0, penaltyCommitted: 0 }),
    );
    expect(res.status).toBe(200);
    expect((res.body as { delta: string }).delta).toBe("0 pts");
    expect(penaltyCalls[0]!.write).toMatchObject({ penaltyWon: 0, penaltyCommitted: 0 });
    expect(penaltyCalls[0]!.audit.summary.toLowerCase()).toContain("clear");
    expect(calls).toEqual([["m1", "p1"]]);
  });

  it("reason missing/blank → 400 reason_required, BEFORE any DB read or write", async () => {
    let readMatchPlayer = false;
    const { store, penaltyCalls } = spyStore({
      getMatchPlayer: async () => {
        readMatchPlayer = true;
        return IN_MATCH;
      },
    });
    const { rescore, calls } = spyRescore();
    const res = await handleCommishPenalty(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      penaltyBody({ reason: "   " }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "reason_required" });
    expect(readMatchPlayer).toBe(false);
    expect(penaltyCalls).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("negative penalty count → 400 bad_request", async () => {
    const { store, penaltyCalls } = spyStore();
    const { rescore } = spyRescore();
    const res = await handleCommishPenalty(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      penaltyBody({ penaltyWon: -1 }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad_request" });
    expect(penaltyCalls).toHaveLength(0);
  });

  it("bad (match,player): no such row → 404 invalid_match_player; no write, no re-score", async () => {
    const { store, penaltyCalls } = spyStore({ getMatchPlayer: async () => null });
    const { rescore, calls } = spyRescore();
    const res = await handleCommishPenalty(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      penaltyBody(),
    );
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "invalid_match_player" });
    expect(penaltyCalls).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("bad (match,player): player's team is NOT in the match → 404 invalid_match_player", async () => {
    const { store, penaltyCalls } = spyStore({
      getMatchPlayer: async () => ({ ...IN_MATCH, playerTeamId: "tOTHER" }),
    });
    const { rescore } = spyRescore();
    const res = await handleCommishPenalty(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      penaltyBody(),
    );
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "invalid_match_player" });
    expect(penaltyCalls).toHaveLength(0);
  });

  it("FROZEN period: the correction is NOT swallowed — 200, write + re-score happen, override surfaced", async () => {
    const { store, penaltyCalls } = spyStore({
      getMatchPlayer: async () => ({ ...IN_MATCH, periodFrozen: true }),
    });
    const { rescore, calls } = spyRescore();
    const res = await handleCommishPenalty(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      penaltyBody(),
    );
    expect(res.status).toBe(200);
    expect((res.body as { frozenOverride: boolean }).frozenOverride).toBe(true);
    expect(penaltyCalls).toHaveLength(1);
    expect(penaltyCalls[0]!.audit.detail?.toLowerCase()).toContain("frozen");
    expect(calls).toEqual([["m1", "p1"]]); // re-score still fires past the freeze
  });

  it("scored=false (no feed footprint): 200 + write + audit STILL land, but surfaces scored:false + a pending warning", async () => {
    const { store, penaltyCalls } = spyStore();
    const { rescore } = spyRescore(false); // the adapter participant gate rejected the player (no stat/event/shot)
    const res = await handleCommishPenalty(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      penaltyBody(),
    );
    expect(res.status).toBe(200);
    expect(penaltyCalls).toHaveLength(1); // durable — folds into the score once the feed records the player
    expect(res.body).toMatchObject({ ok: true, scored: false, warning: "no_match_participation" });
  });

  it("scored=true happy path reports scored:true and omits the warning", async () => {
    const { store } = spyStore();
    const { rescore } = spyRescore(true);
    const res = await handleCommishPenalty(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      penaltyBody(),
    );
    expect(res.body).toMatchObject({ scored: true });
    expect((res.body as { warning?: string }).warning).toBeUndefined();
  });

  it("re-score THROWS after the write+audit commit (frozen override) → 200 saved-but-restate-pending, NOT a 500", async () => {
    // The write + audit `$transaction` has already committed by the time the sync re-score fires (the frozen-
    // override rollup, which throws here). The throw must NOT surface as a bare 500 that hides the durable write.
    const { store, penaltyCalls } = spyStore({
      getMatchPlayer: async () => ({ ...IN_MATCH, periodFrozen: true }),
    });
    const rescore = async (): Promise<{ scored: boolean }> => {
      throw new Error("recomputeManagerPeriod blew up past the freeze gate");
    };
    const res = await handleCommishPenalty(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      penaltyBody(),
    );

    // Write + audit still landed — they committed BEFORE the throwing re-score.
    expect(penaltyCalls).toHaveLength(1);
    // Distinguishable, actionable partial-success — never a generic 500.
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      frozenOverride: true,
      scored: false,
      restatePending: true,
      warning: "restate_pending",
      auditId: "aud-pen",
    });
    // The remedy — re-submit the identical (absolute, idempotent) correction — is spelled out for the operator.
    expect((res.body as { message: string }).message).toMatch(/re-submit/i);
    // restate-pending takes precedence: the feed-participation warning must NOT also appear.
    expect((res.body as { warning: string }).warning).not.toBe("no_match_participation");
  });

  it("distinguishes restate-pending (post-write) from a clean pre-write validation reject", async () => {
    // A pre-write reject persists NOTHING and returns 4xx `{ error }`; the post-write restate-pending persists
    // the row + audit and returns a 200 with `ok:true` + `restatePending`. The two must never look alike.
    const { store: goodStore } = spyStore();
    const { rescore: okRescore } = spyRescore(true);
    const preWrite = await handleCommishPenalty(
      { resolveManager: resolver(OK_COMMISH), store: goodStore, rescore: okRescore },
      penaltyBody({ reason: "  " }), // fails validation BEFORE any write
    );
    expect(preWrite.status).toBe(400);
    expect(preWrite.body).toEqual({ error: "reason_required" });
    expect((preWrite.body as { ok?: boolean }).ok).toBeUndefined();
    expect((preWrite.body as { restatePending?: boolean }).restatePending).toBeUndefined();
  });
});

// ── B2 rating ─────────────────────────────────────────────────────────────────────────────────────
describe("handleCommishRating", () => {
  it("happy path: sets a 0–10 manual rating — upsert source=manual + ONE audit + re-score", async () => {
    const { store, ratingCalls } = spyStore();
    const { rescore, calls } = spyRescore();
    const res = await handleCommishRating(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      ratingBody({ rating: 8.5 }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      rating: 8.5,
      source: "manual",
      frozenOverride: false,
    });
    expect(ratingCalls).toHaveLength(1);
    expect(ratingCalls[0]!.write).toEqual({
      kind: "set",
      matchId: "m1",
      playerId: "p1",
      rating: 8.5,
    });
    expect(ratingCalls[0]!.audit.actionType).toBe("rating_override");
    expect(ratingCalls[0]!.audit.targetRef).toEqual({ matchId: "m1", playerId: "p1" });
    expect(ratingCalls[0]!.audit.reason).toBe("Feed rating was clearly wrong for this match");
    expect(ratingCalls[0]!.audit.reversible).toBe(true);
    expect(calls).toEqual([["m1", "p1"]]);
  });

  it("accepts the boundary values 0 and 10", async () => {
    const { store, ratingCalls } = spyStore();
    const { rescore } = spyRescore();
    expect(
      (
        await handleCommishRating(
          { resolveManager: resolver(OK_COMMISH), store, rescore },
          ratingBody({ rating: 0 }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handleCommishRating(
          { resolveManager: resolver(OK_COMMISH), store, rescore },
          ratingBody({ rating: 10 }),
        )
      ).status,
    ).toBe(200);
    expect(ratingCalls.map((c) => (c.write.kind === "set" ? c.write.rating : null))).toEqual([
      0, 10,
    ]);
  });

  it("Clear override (rating=null) → DELETE the manual row + audit + re-score; body has no manual source", async () => {
    const { store, ratingCalls } = spyStore();
    const { rescore, calls } = spyRescore();
    const res = await handleCommishRating(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      ratingBody({ rating: null }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, rating: null, source: null });
    expect(ratingCalls[0]!.write).toEqual({ kind: "clear", matchId: "m1", playerId: "p1" });
    expect(ratingCalls[0]!.audit.summary.toLowerCase()).toContain("clear");
    expect(calls).toEqual([["m1", "p1"]]);
  });

  it("rating above 10 → 400 rating_out_of_range; no write", async () => {
    const { store, ratingCalls } = spyStore();
    const { rescore } = spyRescore();
    const res = await handleCommishRating(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      ratingBody({ rating: 11 }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "rating_out_of_range" });
    expect(ratingCalls).toHaveLength(0);
  });

  it("rating below 0 → 400 rating_out_of_range", async () => {
    const { store } = spyStore();
    const { rescore } = spyRescore();
    const res = await handleCommishRating(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      ratingBody({ rating: -0.5 }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "rating_out_of_range" });
  });

  it("reason missing → 400 reason_required", async () => {
    const { store, ratingCalls } = spyStore();
    const { rescore } = spyRescore();
    const res = await handleCommishRating(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      ratingBody({ reason: "" }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "reason_required" });
    expect(ratingCalls).toHaveLength(0);
  });

  it("bad (match,player) → 404 invalid_match_player", async () => {
    const { store } = spyStore({ getMatchPlayer: async () => null });
    const { rescore } = spyRescore();
    const res = await handleCommishRating(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      ratingBody(),
    );
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "invalid_match_player" });
  });

  it("re-score THROWS after the write+audit commit → 200 saved-but-restate-pending, the manual write stays durable", async () => {
    const { store, ratingCalls } = spyStore({
      getMatchPlayer: async () => ({ ...IN_MATCH, periodFrozen: true }),
    });
    const rescore = async (): Promise<{ scored: boolean }> => {
      throw new Error("rescore failed after commit");
    };
    const res = await handleCommishRating(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      ratingBody({ rating: 8.5 }),
    );

    expect(ratingCalls).toHaveLength(1); // upsert + audit committed before the throw
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      rating: 8.5,
      source: "manual",
      frozenOverride: true,
      scored: false,
      restatePending: true,
      warning: "restate_pending",
      auditId: "aud-rat",
    });
    expect((res.body as { message: string }).message).toMatch(/re-submit/i);
  });
});

// ── 2b general stat-line correction ─────────────────────────────────────────────────────────────────
describe("handleCommishStatCorrection", () => {
  it("gate: no session → 401; non-commissioner → 403; nothing written", async () => {
    const { store, statCalls } = spyStore();
    const { rescore, calls } = spyRescore();
    const a = await handleCommishStatCorrection(
      { resolveManager: resolver(NO_SESSION), store, rescore },
      statBody(),
    );
    expect(a.status).toBe(401);
    const b = await handleCommishStatCorrection(
      { resolveManager: resolver(OK_MEMBER), store, rescore },
      statBody(),
    );
    expect(b.status).toBe(403);
    expect(statCalls).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("happy path: N-field overlay → ONE applyStatCorrection (one audit row) + ONE re-score", async () => {
    const { store, statCalls } = spyStore();
    const { rescore, calls } = spyRescore();
    const res = await handleCommishStatCorrection(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      statBody({ overrides: { goals: 2, assists: 1 } }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      overrides: { goals: 2, assists: 1 },
      frozenOverride: false,
      auditId: "aud-stat",
    });
    expect(statCalls).toHaveLength(1);
    const { write, audit } = statCalls[0]!;
    expect(write).toEqual({
      matchId: "m1",
      playerId: "p1",
      overrides: { goals: 2, assists: 1 },
      reason: "Feed missed a goal that VAR later awarded",
      enteredByUserId: "user1",
    });
    expect(audit.actionType).toBe("stat_correction");
    expect(audit.leagueId).toBe("lg1");
    expect(audit.actorUserId).toBe("user1");
    expect(audit.targetRef).toEqual({ matchId: "m1", playerId: "p1" });
    expect(audit.reason).toBe("Feed missed a goal that VAR later awarded");
    expect(audit.reversible).toBe(true);
    // delta is a raw field-change string (feed→N), NOT a points total.
    expect(audit.delta).toBe("goals feed→2 · assists feed→1");
    expect(res.body).toMatchObject({ delta: "goals feed→2 · assists feed→1" });
    expect(calls).toEqual([["m1", "p1"]]);
  });

  it("delta uses the PRIOR overlay as the before-value (N→M)", async () => {
    const { store, statCalls } = spyStore({}, { goals: 1 });
    const { rescore } = spyRescore();
    const res = await handleCommishStatCorrection(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      statBody({ overrides: { goals: 3 } }),
    );
    expect(res.status).toBe(200);
    expect(statCalls[0]!.audit.delta).toBe("goals 1→3");
  });

  it("clear-all (empty overrides) is a valid, absolute write → still one audit row + re-score", async () => {
    const { store, statCalls } = spyStore({}, { goals: 2 });
    const { rescore, calls } = spyRescore();
    const res = await handleCommishStatCorrection(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      statBody({ overrides: {} }),
    );
    expect(res.status).toBe(200);
    expect(statCalls).toHaveLength(1);
    expect(statCalls[0]!.write.overrides).toEqual({});
    expect(statCalls[0]!.audit.summary.toLowerCase()).toContain("clear");
    expect(statCalls[0]!.audit.delta).toBe("goals 2→feed");
    expect(calls).toEqual([["m1", "p1"]]);
  });

  it("idempotent SET: re-submitting the identical overlay still writes ONE audit row (delta 'no change')", async () => {
    const { store, statCalls } = spyStore({}, { goals: 2 });
    const { rescore } = spyRescore();
    const res = await handleCommishStatCorrection(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      statBody({ overrides: { goals: 2 } }),
    );
    expect(res.status).toBe(200);
    expect(statCalls).toHaveLength(1); // one audit per save (governance), even when nothing changed
    expect(statCalls[0]!.write.overrides).toEqual({ goals: 2 }); // absolute SET, never accumulated
    expect(statCalls[0]!.audit.delta).toBe("no change");
  });

  it("reason missing/blank → 400 reason_required, BEFORE any DB read or write", async () => {
    let read = false;
    const { store, statCalls } = spyStore({
      getMatchPlayer: async () => {
        read = true;
        return IN_MATCH;
      },
    });
    const { rescore } = spyRescore();
    const res = await handleCommishStatCorrection(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      statBody({ reason: "   " }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "reason_required" });
    expect(read).toBe(false);
    expect(statCalls).toHaveLength(0);
  });

  it("unknown / inert stat key → 400 unknown_stat_key; nothing written", async () => {
    const { store, statCalls } = spyStore();
    const { rescore } = spyRescore();
    const bad = await handleCommishStatCorrection(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      statBody({ overrides: { goalz: 2 } }),
    );
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: "unknown_stat_key" });
    // dribblesAttempted is a real StatRow field but is NOT scored → not in the allowlist → rejected too.
    const inert = await handleCommishStatCorrection(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      statBody({ overrides: { dribblesAttempted: 5 } }),
    );
    expect(inert.body).toEqual({ error: "unknown_stat_key" });
    expect(statCalls).toHaveLength(0);
  });

  it("negative / fractional value → 400 bad_request", async () => {
    const { store, statCalls } = spyStore();
    const { rescore } = spyRescore();
    expect(
      (
        await handleCommishStatCorrection(
          { resolveManager: resolver(OK_COMMISH), store, rescore },
          statBody({ overrides: { goals: -1 } }),
        )
      ).body,
    ).toEqual({ error: "bad_request" });
    expect(
      (
        await handleCommishStatCorrection(
          { resolveManager: resolver(OK_COMMISH), store, rescore },
          statBody({ overrides: { goals: 1.5 } }),
        )
      ).body,
    ).toEqual({ error: "bad_request" });
    expect(statCalls).toHaveLength(0);
  });

  it("bad (match,player) → 404 invalid_match_player; no write, no re-score", async () => {
    const { store, statCalls } = spyStore({ getMatchPlayer: async () => null });
    const { rescore, calls } = spyRescore();
    const res = await handleCommishStatCorrection(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      statBody(),
    );
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "invalid_match_player" });
    expect(statCalls).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("FROZEN period: not swallowed — 200, write + re-score, frozen note on the audit detail", async () => {
    const { store, statCalls } = spyStore({
      getMatchPlayer: async () => ({ ...IN_MATCH, periodFrozen: true }),
    });
    const { rescore, calls } = spyRescore();
    const res = await handleCommishStatCorrection(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      statBody(),
    );
    expect(res.status).toBe(200);
    expect((res.body as { frozenOverride: boolean }).frozenOverride).toBe(true);
    expect(statCalls[0]!.audit.detail?.toLowerCase()).toContain("frozen");
    expect(calls).toEqual([["m1", "p1"]]);
  });

  it("scored=false (no feed footprint): 200 + write + audit land, surfaces scored:false + pending warning", async () => {
    const { store, statCalls } = spyStore();
    const { rescore } = spyRescore(false); // adapter participant gate rejected the manual-only correction
    const res = await handleCommishStatCorrection(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      statBody(),
    );
    expect(res.status).toBe(200);
    expect(statCalls).toHaveLength(1);
    expect(res.body).toMatchObject({ ok: true, scored: false, warning: "no_match_participation" });
  });

  it("re-score THROWS after commit → 200 saved-but-restate-pending, NOT a 500", async () => {
    const { store, statCalls } = spyStore({
      getMatchPlayer: async () => ({ ...IN_MATCH, periodFrozen: true }),
    });
    const rescore = async (): Promise<{ scored: boolean }> => {
      throw new Error("recomputeManagerPeriod blew up past the freeze gate");
    };
    const res = await handleCommishStatCorrection(
      { resolveManager: resolver(OK_COMMISH), store, rescore },
      statBody(),
    );
    expect(statCalls).toHaveLength(1); // overlay + audit committed before the throw
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      frozenOverride: true,
      scored: false,
      restatePending: true,
      warning: "restate_pending",
      auditId: "aud-stat",
    });
    expect((res.body as { message: string }).message).toMatch(/re-submit/i);
    expect((res.body as { warning: string }).warning).not.toBe("no_match_participation");
  });
});
