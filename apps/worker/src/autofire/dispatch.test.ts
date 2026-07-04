import { describe, it, expect } from "vitest";
import { dispatchAutoFireCut, type AutoFireDeps, type AutoFireLog } from "./dispatch";
import { MemoryAutoFireStore } from "./memoryStore";
import type { AutoFireRoundRow } from "./store";
import type { RoundCompletenessInput } from "./completeness";
import { MemoryPlayoffAdvanceStore } from "@app/commish-core/advanceStore";
import { MemoryNotifyStore } from "@app/notify";
import type { ScoreInputBundle } from "@app/recompute";

/**
 * The auto-fire IO orchestrator (feat/autofire-round-cut). It NEVER re-implements a cut — it drives the
 * untouched `runRoundAdvance` (data-complete? → dry-run → classify → apply) and, on a boundary tie, a
 * ledgered commissioner alert. Exercised end-to-end against the real `MemoryPlayoffAdvanceStore` +
 * `MemoryNotifyStore` doubles so the fire / alert / completeness / idempotency wiring is proven without a DB.
 */

const LAST_FT = new Date("2026-07-04T20:00:00.000Z").getTime();
const SETTLE_MS = 5 * 60_000;
/** Settle window comfortably elapsed. */
const NOW = new Date(LAST_FT + SETTLE_MS + 60_000);
const SUB = { endpoint: "https://push.example/commish", p256dh: "key-p", auth: "key-a" };
const PERIOD_ID = "p-R32";

const silentLog: AutoFireLog = { debug() {}, info() {}, warn() {}, error() {} };

function koRound(over: Partial<AutoFireRoundRow> = {}): AutoFireRoundRow {
  return {
    periodId: PERIOD_ID,
    label: "R32",
    status: "closed",
    lastFtMs: LAST_FT,
    alreadyCut: false,
    ...over,
  };
}

/** A player who appears (team-in-match + a real stat line) — the reused participant gate returns true. */
function appearedBundle(playerId: string): ScoreInputBundle {
  const stat = Object.fromEntries(
    Object.keys({
      minutesPlayed: 0,
      goals: 0,
      assists: 0,
      keyPasses: 0,
      dribblesAttempted: 0,
      dribblesCompleted: 0,
      duelsWon: 0,
      duelsLost: 0,
      passesTotal: 0,
      passesAccurate: 0,
      longBallsTotal: 0,
      longBallsAccurate: 0,
      wasFouled: 0,
      clearances: 0,
      blockedShots: 0,
      interceptions: 0,
      tacklesWon: 0,
      saves: 0,
      savesInsideBox: 0,
      punches: 0,
      highClaims: 0,
      possessionLost: 0,
      shotsOnTarget: 0,
      ballRecoveries: 0,
      bigChancesCreated: 0,
      crossesAccurate: 0,
      touches: 0,
    }).map((k) => [k, null]),
  ) as unknown as NonNullable<ScoreInputBundle["stat"]>;
  return {
    playerId,
    role: "MID",
    rating: null,
    ratingSource: null,
    stat: { ...stat, minutesPlayed: 90 },
    manual: null,
    events: [],
    shots: [],
    team: {
      playerTeamId: "home",
      homeTeamId: "home",
      awayTeamId: "away",
      homeScore: 1,
      awayScore: 0,
      teamByPlayerId: {},
    },
  };
}

/** A data-complete round: one completed fixture with one appeared + rated player, swept, drained. */
function completeRound(): RoundCompletenessInput {
  return {
    fixtures: [
      {
        matchId: "fx1",
        status: "completed",
        bundles: [appearedBundle("pa")],
        ratedPlayerIds: new Set(["pa"]),
        hasDirtyInput: false,
      },
    ],
    pendingManagerPeriodDirty: 0,
  };
}

/** A data-incomplete round: the appeared player is unrated (ratings still landing). */
function incompleteRound(): RoundCompletenessInput {
  return {
    fixtures: [
      {
        matchId: "fx1",
        status: "completed",
        bundles: [appearedBundle("pa")],
        ratedPlayerIds: new Set(),
        hasDirtyInput: false,
      },
    ],
    pendingManagerPeriodDirty: 0,
  };
}

/** A determined R32: m1 (1) + m2 (2) are the clear bottom 2 → cut both. frozenAt:null proves the
 *  allowIncomplete:true path crosses an unfrozen-but-closed round. */
function determinedAdvance(): MemoryPlayoffAdvanceStore {
  return new MemoryPlayoffAdvanceStore({
    leagueId: "league-1",
    rounds: [{ label: "R32", cutCount: 2, frozenAt: null }],
    entries: [{ managerId: "m1" }, { managerId: "m2" }, { managerId: "m3" }, { managerId: "m4" }],
    roundScores: { R32: { m1: 1, m2: 2, m3: 30, m4: 40 } },
    cumulativeTotals: { m1: 1, m2: 2, m3: 30, m4: 40 },
    rosters: { m1: ["m1-p1", "m1-p2"], m2: ["m2-p1"] },
  });
}

/** A boundary tie: cutCount 1 but m1 & m2 are tied lowest (5) with equal cumulative (0) → needsCommissioner. */
function tieAdvance(): MemoryPlayoffAdvanceStore {
  return new MemoryPlayoffAdvanceStore({
    leagueId: "league-1",
    rounds: [{ label: "R32", cutCount: 1, frozenAt: null }],
    entries: [{ managerId: "m1" }, { managerId: "m2" }, { managerId: "m3" }],
    roundScores: { R32: { m1: 5, m2: 5, m3: 50 } },
    cumulativeTotals: {},
  });
}

function makeDeps(over: {
  advanceStore?: MemoryPlayoffAdvanceStore;
  notify?: MemoryNotifyStore;
  autofire?: MemoryAutoFireStore;
  /** Round data-completeness for PERIOD_ID; default complete. Ignored when `autofire` is overridden. */
  completeness?: RoundCompletenessInput;
  enabled?: boolean;
  now?: Date;
  advance?: AutoFireDeps["advance"];
  alert?: AutoFireDeps["alert"];
}): AutoFireDeps {
  const advanceStore =
    over.advanceStore ?? new MemoryPlayoffAdvanceStore({ rounds: [], entries: [] });
  return {
    now: over.now ?? NOW,
    enabled: over.enabled ?? true,
    settleMs: SETTLE_MS,
    store:
      over.autofire ??
      new MemoryAutoFireStore({
        rounds: [koRound()],
        teamNames: { m1: "Team 1", m2: "Team 2", m3: "Team 3", m4: "Team 4" },
        commissionerManagerIds: ["commish"],
        completenessByPeriod: { [PERIOD_ID]: over.completeness ?? completeRound() },
      }),
    // The apply store is built per-run; the memory double ignores the audit ctx (audit is gated-PG-tested).
    makeAdvanceStore: () => advanceStore,
    notify: over.notify ?? new MemoryNotifyStore(),
    log: silentLog,
    advance: over.advance,
    alert: over.alert,
  };
}

describe("dispatchAutoFireCut — the resident-tick auto-fire driver", () => {
  it("determined cut → APPLIES the cut + release via runRoundAdvance", async () => {
    const advanceStore = determinedAdvance();
    const out = await dispatchAutoFireCut(makeDeps({ advanceStore }));

    expect(out).toEqual({ action: "fired", label: "R32", status: "applied" });
    expect(advanceStore.applyCount).toBe(1);
    expect(advanceStore.entries.get("m1")!.status).toBe("eliminated");
    expect(advanceStore.entries.get("m2")!.status).toBe("eliminated");
    expect(advanceStore.entries.get("m3")!.status).toBe("alive");
    expect(advanceStore.entries.get("m4")!.status).toBe("alive");
    // The just-cut managers' rosters were shed to the wire (the release rode the cut transaction).
    expect(advanceStore.rosters["m1"]).toEqual([]);
    expect(advanceStore.rosters["m2"]).toEqual([]);
  });

  it("re-tick after the cut is a no-op — the idempotent claim blocks a second apply", async () => {
    const advanceStore = determinedAdvance();
    const deps = makeDeps({ advanceStore });

    const first = await dispatchAutoFireCut(deps);
    const second = await dispatchAutoFireCut(deps);

    expect(first).toMatchObject({ action: "fired", status: "applied" });
    expect(second.action).toBe("skipped"); // dry-run now sees alreadyCut → resolution null → skip
    expect(advanceStore.applyCount).toBe(1); // exactly one apply across both ticks
  });

  it("boundary tie → NO cut + ONE ledgered commissioner alert", async () => {
    const advanceStore = tieAdvance();
    const notify = new MemoryNotifyStore();
    await notify.addSubscription("commish", SUB);

    const out = await dispatchAutoFireCut(makeDeps({ advanceStore, notify }));

    expect(out).toEqual({ action: "alerted", label: "R32", recipients: 1, sent: 1 });
    expect(advanceStore.applyCount).toBe(0); // NEVER auto-cut a tie
    expect(notify.hasLedger("commish", "cut_needs_review", "R32")).toBe(true);
    expect(notify.sends).toHaveLength(1);
    expect(notify.sends[0]!.payload.tag).toBe("cut_needs_review:R32");
  });

  it("re-tick on a tie → no duplicate alert (the notification_sent ledger collapses it)", async () => {
    const advanceStore = tieAdvance();
    const notify = new MemoryNotifyStore();
    await notify.addSubscription("commish", SUB);
    const deps = makeDeps({ advanceStore, notify });

    await dispatchAutoFireCut(deps);
    const second = await dispatchAutoFireCut(deps);

    expect(second).toMatchObject({ action: "alerted", sent: 0 });
    expect(notify.sends).toHaveLength(1); // exactly one alert across both ticks
    expect(advanceStore.applyCount).toBe(0);
  });

  it("disabled → none, before any IO (the byte-identical no-op default)", async () => {
    const out = await dispatchAutoFireCut(
      makeDeps({ enabled: false, advanceStore: determinedAdvance() }),
    );
    expect(out).toEqual({ action: "none", reason: "disabled" });
  });

  it("settle window not elapsed → none (never fires early)", async () => {
    const now = new Date(LAST_FT + SETTLE_MS - 1_000);
    const out = await dispatchAutoFireCut(makeDeps({ advanceStore: determinedAdvance(), now }));
    expect(out).toMatchObject({ action: "none" });
    expect(determinedAdvance().applyCount).toBe(0);
  });

  it("no closed knockout round → none", async () => {
    const autofire = new MemoryAutoFireStore({ rounds: [koRound({ status: "open" })] });
    const advanceStore = determinedAdvance();
    const out = await dispatchAutoFireCut(makeDeps({ autofire, advanceStore }));
    expect(out).toMatchObject({ action: "none" });
    expect(advanceStore.applyCount).toBe(0);
  });

  it("data-INCOMPLETE round → HOLDS (never fires, never resolves) — the FIX 1 safety gate", async () => {
    const advanceStore = determinedAdvance();
    const out = await dispatchAutoFireCut(
      makeDeps({ advanceStore, completeness: incompleteRound() }),
    );
    expect(out.action).toBe("holding");
    expect(advanceStore.applyCount).toBe(0); // never even resolves an incomplete round
  });

  it("isolation: a thrown error propagates so the scheduler's own try/catch can swallow it", async () => {
    // scheduler.ts wraps this whole step in its own try/catch (the autofire block) → a failure logs and the
    // tick continues; here we prove the error reaches that boundary rather than being silently eaten.
    const throwing: NonNullable<AutoFireDeps["advance"]> = async () => {
      throw new Error("boom");
    };
    const deps = makeDeps({ advanceStore: determinedAdvance(), advance: throwing });
    await expect(dispatchAutoFireCut(deps)).rejects.toThrow("boom");
  });
});
