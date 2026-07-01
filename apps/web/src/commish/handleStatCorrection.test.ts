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
  type CommishStatStore,
  type MatchPlayerContext,
  type PenaltyBody,
  type RatingBody,
} from "./handleStatCorrection";

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

function spyStore(over: Partial<CommishStatStore> = {}) {
  const penaltyCalls: Parameters<CommishStatStore["applyPenalty"]>[0][] = [];
  const ratingCalls: Parameters<CommishStatStore["applyRating"]>[0][] = [];
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
    ...over,
  };
  return { store, penaltyCalls, ratingCalls };
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
});
