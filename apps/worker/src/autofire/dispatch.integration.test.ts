/**
 * Real-Postgres integration suite for the playoff round AUTO-FIRE driver ({@link dispatchAutoFireCut},
 * feat/autofire-round-cut incl. FIX 1 data-completeness gate + FIX 2 durable audit). Pins the REAL wiring
 * against a live DB:
 *   1. a DATA-COMPLETE + DETERMINED round is cut + released atomically (rosters shed) AND a durable
 *      `auto_advance` `commish_audit` row is written IN THE SAME TX (actor_user_id NULL, round_advance
 *      target_ref); `allowIncomplete: true` crosses the UNFROZEN-but-closed round (provisional scores);
 *   2. a 2nd tick is a no-op (the round now reads already-cut) — no second cut, no duplicate audit;
 *   3. a DATA-INCOMPLETE round (an unrated appeared player) NEVER fires — no cut, no audit (FIX 1);
 *   4. a boundary-tie round is NEVER cut — one `cut_needs_review` ledger row, no duplicate on re-tick;
 *   5. a forced audit failure inside the apply tx rolls BOTH the cut and the release back (atomicity).
 *
 * GATED on PLAYOFF_PG_TEST_URL (a THROWAWAY DB — the suite wipes tables); skipped in normal `pnpm test`.
 * This thread adds NO migration (the `auto_advance` action_type is free TEXT), so the DB only needs the
 * existing schema applied. Run it:
 *
 *   docker run -d --name wc-playoff-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=playoff_test -p 5468:5432 postgres:16
 *   export PLAYOFF_PG_TEST_URL="postgresql://postgres:postgres@127.0.0.1:5468/playoff_test"
 *   DATABASE_URL="$PLAYOFF_PG_TEST_URL" DIRECT_URL="$PLAYOFF_PG_TEST_URL" \
 *     pnpm --filter @app/db exec prisma migrate deploy
 *   pnpm exec vitest run apps/worker/src/autofire/dispatch.integration.test.ts
 *
 * NOTE: this suite and `advanceStore.integration.test.ts` both wipe the SAME throwaway DB with global
 * deletes, so running BOTH gated suites at once needs `--no-file-parallelism` (else their beforeEach wipes
 * race). Alone, either runs fine.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@app/db";
import { createPrismaNotifyStore } from "@app/notify/prisma";
import type { NotifyStore } from "@app/notify";
import { dispatchAutoFireCut, type AutoFireLog } from "./dispatch";
import { createPrismaAutoFireStore } from "./prismaStore";
import { createPrismaAutoFireAdvanceStore } from "./advanceStore";

const TEST_URL = process.env.PLAYOFF_PG_TEST_URL;

const LEAGUE = "af-league";
const MD1 = "af-md1";
const R32 = "af-r32";
const FIXTURE = "af-fixture-1";
const HOME = "af-home";
const AWAY = "af-away";
const FROZEN = new Date("2026-07-01T12:00:00.000Z");
const KICKOFF = new Date("2026-07-04T18:00:00.000Z");
const SETTLE_MS = 5 * 60_000;
/** Well past KICKOFF + settle. */
const NOW = new Date(KICKOFF.getTime() + 30 * 60_000);

describe.skipIf(!TEST_URL)("playoff auto-fire — real Postgres", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  beforeEach(async () => {
    await db.$executeRawUnsafe("TRUNCATE TABLE lineup_slot");
    await db.notificationSent.deleteMany({});
    await db.pushSubscription.deleteMany({});
    await db.recomputeDirty.deleteMany({});
    await db.ratingPlayerMatch.deleteMany({});
    await db.statPlayerMatch.deleteMany({});
    await db.rosterPlayer.deleteMany({});
    await db.scoreManagerPeriod.deleteMany({});
    await db.commishAudit.deleteMany({});
    await db.playoffEntry.deleteMany({});
    await db.fifaMatch.deleteMany({});
    await db.player.deleteMany({});
    await db.period.deleteMany({});
    await db.manager.deleteMany({});
    await db.fifaTeam.deleteMany({});
    await db.league.deleteMany({});

    await db.league.create({
      data: { id: LEAGUE, name: "Auto-fire Test League", status: "playoff" },
    });
    for (const i of [1, 2, 3, 4]) {
      await db.manager.create({
        data: { id: `m${i}`, leagueId: LEAGUE, displayName: `Team ${i}` },
      });
    }
    await db.manager.create({
      data: { id: "commish", leagueId: LEAGUE, displayName: "Commish", isCommissioner: true },
    });
    await db.pushSubscription.create({
      data: {
        managerId: "commish",
        endpoint: "https://push.example/commish",
        p256dh: "kp",
        auth: "ka",
      },
    });
    await db.fifaTeam.create({ data: { id: HOME, balldontlieId: 8001, name: "Home FC" } });
    await db.fifaTeam.create({ data: { id: AWAY, balldontlieId: 8002, name: "Away FC" } });
    await db.period.create({
      data: { id: MD1, leagueId: LEAGUE, kind: "group_md", label: "MD1", frozenAt: FROZEN },
    });
  });

  /** R32 as a CLOSED, UNFROZEN knockout round with one completed fixture (its kickoff = the last-FT proxy). */
  async function seedR32(cutCount: number) {
    await db.period.create({
      data: {
        id: R32,
        leagueId: LEAGUE,
        kind: "knockout_round",
        label: "R32",
        status: "closed",
        cutCount,
        frozenAt: null, // UNFROZEN — the allowIncomplete:true provisional-score path
      },
    });
    await db.fifaMatch.create({
      data: {
        id: FIXTURE,
        balldontlieId: 7001,
        kickoffAt: KICKOFF,
        status: "completed",
        periodId: R32,
        homeTeamId: HOME,
        awayTeamId: AWAY,
      },
    });
  }

  /** Make the R32 fixture DATA-COMPLETE: two appeared players (one per team) with a swept stat line and,
   *  when `rateAway` is true, a rating for BOTH. `rateAway: false` leaves an appeared player unrated. */
  async function seedFixtureData({ rateAway }: { rateAway: boolean }) {
    async function appeared(playerId: string, bdl: number, teamId: string, rate: boolean) {
      await db.player.create({
        data: { id: playerId, balldontlieId: bdl, displayName: playerId, position: "MID", teamId },
      });
      await db.statPlayerMatch.create({
        data: { matchId: FIXTURE, playerId, minutesPlayed: 90, dirty: false },
      });
      if (rate) {
        await db.ratingPlayerMatch.create({
          data: { matchId: FIXTURE, playerId, source: "balldontlie", rating: 7.2, dirty: false },
        });
      }
    }
    await appeared("fp-home", 9001, HOME, true);
    await appeared("fp-away", 9002, AWAY, rateAway);
  }

  async function alive(managerId: string, seed: number) {
    await db.playoffEntry.create({ data: { leagueId: LEAGUE, managerId, seed, status: "alive" } });
  }
  async function score(managerId: string, points: number) {
    await db.scoreManagerPeriod.create({ data: { periodId: R32, managerId, points } });
  }
  async function roster(managerId: string, playerId: string, bdl: number) {
    await db.player.create({
      data: {
        id: playerId,
        balldontlieId: bdl,
        displayName: playerId,
        position: "MID",
        teamId: HOME,
      },
    });
    await db.rosterPlayer.create({ data: { leagueId: LEAGUE, managerId, playerId } });
  }
  function entry(managerId: string) {
    return db.playoffEntry.findUnique({
      where: { leagueId_managerId: { leagueId: LEAGUE, managerId } },
    });
  }

  /** The real notify store with only the web-push TRANSPORT stubbed (no VAPID in tests) — the ledger claim
   *  + subscription reads hit real Postgres, which is what the alert test pins. */
  function testDeps(over: { now?: Date } = {}) {
    const realNotify = createPrismaNotifyStore(db);
    const notify: NotifyStore = { ...realNotify, send: async () => ({ ok: true }) };
    const auditLines: string[] = [];
    const log: AutoFireLog = {
      debug: () => {},
      info: (_e, f) => {
        if (f?.line) auditLines.push(String(f.line));
      },
      warn: () => {},
      error: () => {},
    };
    return {
      auditLines,
      deps: {
        now: over.now ?? NOW,
        enabled: true,
        settleMs: SETTLE_MS,
        store: createPrismaAutoFireStore(db),
        makeAdvanceStore: (audit: { reason: string; nameOf: Readonly<Record<string, string>> }) =>
          createPrismaAutoFireAdvanceStore(db, audit),
        notify,
        log,
      },
    };
  }

  it("DATA-COMPLETE + DETERMINED → cut+release across an unfrozen-but-closed round + a durable auto_advance audit row", async () => {
    await seedR32(2);
    await seedFixtureData({ rateAway: true }); // fixture is score-complete
    for (const i of [1, 2, 3, 4]) await alive(`m${i}`, i);
    await score("m1", 1);
    await score("m2", 2);
    await score("m3", 30);
    await score("m4", 40);
    await roster("m1", "m1-owned", 3001); // released on the cut

    const { deps } = testDeps();
    const out = await dispatchAutoFireCut(deps);

    expect(out).toEqual({ action: "fired", label: "R32", status: "applied" });
    expect((await entry("m1"))!.status).toBe("eliminated");
    expect((await entry("m2"))!.status).toBe("eliminated");
    expect((await entry("m3"))!.status).toBe("alive");
    expect(await db.rosterPlayer.count({ where: { managerId: "m1", droppedAt: null } })).toBe(0);

    // The DURABLE audit row — one row, NULL actor (system), `auto_advance`, round_advance target_ref.
    const audits = await db.commishAudit.findMany({ where: { leagueId: LEAGUE } });
    expect(audits).toHaveLength(1);
    const a = audits[0]!;
    expect(a.actorUserId).toBeNull();
    expect(a.actionType).toBe("auto_advance");
    expect(a.reversible).toBe(false);
    const ref = a.targetRef as { roundLabel: string; eliminated: string[]; releasedCount: number };
    expect(ref.roundLabel).toBe("R32");
    expect(ref.eliminated.sort()).toEqual(["m1", "m2"]);
    expect(ref.releasedCount).toBe(1);
  });

  it("2nd tick on an already-cut round is a no-op — no second cut, no duplicate audit row", async () => {
    await seedR32(2);
    await seedFixtureData({ rateAway: true });
    for (const i of [1, 2, 3, 4]) await alive(`m${i}`, i);
    await score("m1", 1);
    await score("m2", 2);
    await score("m3", 30);
    await score("m4", 40);

    expect(await dispatchAutoFireCut(testDeps().deps)).toMatchObject({ action: "fired" });
    const second = await dispatchAutoFireCut(testDeps().deps);

    expect(second).toEqual({ action: "none", reason: "no closed, uncut knockout round" });
    expect(await db.commishAudit.count({ where: { leagueId: LEAGUE } })).toBe(1); // no duplicate
    expect(await db.playoffEntry.count({ where: { leagueId: LEAGUE, status: "eliminated" } })).toBe(
      2,
    );
  });

  it("DATA-INCOMPLETE (an unrated appeared player) → HOLDS: no cut, no audit (FIX 1 safety gate)", async () => {
    await seedR32(2);
    await seedFixtureData({ rateAway: false }); // fp-away appeared but is unrated → incomplete
    for (const i of [1, 2, 3, 4]) await alive(`m${i}`, i);
    await score("m1", 1);
    await score("m2", 2);
    await score("m3", 30);
    await score("m4", 40);

    const out = await dispatchAutoFireCut(testDeps().deps);

    expect(out.action).toBe("holding");
    expect(await db.playoffEntry.count({ where: { leagueId: LEAGUE, status: "alive" } })).toBe(4);
    expect(await db.commishAudit.count({ where: { leagueId: LEAGUE } })).toBe(0);
  });

  it("boundary TIE → NO cut + exactly ONE cut_needs_review ledger row; 2nd tick no duplicate", async () => {
    await seedR32(1);
    await seedFixtureData({ rateAway: true }); // data-complete, so it RESOLVES (to a tie)
    // m1 & m2 tie at the bottom (5 each) with equal cumulative (no group scores) → needsCommissioner.
    await alive("m1", 1);
    await alive("m2", 2);
    await alive("m3", 3);
    await score("m1", 5);
    await score("m2", 5);
    await score("m3", 50);

    const first = await dispatchAutoFireCut(testDeps().deps);
    expect(first).toMatchObject({ action: "alerted", label: "R32", recipients: 1, sent: 1 });
    expect(await db.playoffEntry.count({ where: { leagueId: LEAGUE, status: "alive" } })).toBe(3);
    expect(await db.commishAudit.count({ where: { leagueId: LEAGUE } })).toBe(0); // a tie writes no cut audit
    expect(
      await db.notificationSent.count({
        where: { managerId: "commish", kind: "cut_needs_review", subjectId: "R32" },
      }),
    ).toBe(1);

    const second = await dispatchAutoFireCut(testDeps().deps);
    expect(second).toMatchObject({ action: "alerted", sent: 0 });
    expect(
      await db.notificationSent.count({
        where: { managerId: "commish", kind: "cut_needs_review", subjectId: "R32" },
      }),
    ).toBe(1); // no duplicate alert
  });

  it("a forced audit failure inside the apply tx rolls BOTH the cut and the release back (atomic)", async () => {
    await seedR32(2);
    for (const i of [1, 2, 3, 4]) await alive(`m${i}`, i);
    await roster("m1", "m1-owned", 3001);

    // Fault injection: a Prisma proxy whose $transaction hands the callback a tx whose
    // `commishAudit.create` throws — so the DURABLE audit insert (the last statement) fails mid-tx.
    const withFailingAudit = (real: PrismaClient): PrismaClient =>
      new Proxy(real, {
        get(target, prop, receiver) {
          if (prop === "$transaction") {
            return (fn: (tx: unknown) => unknown, opts?: unknown) =>
              (target.$transaction as (f: (tx: unknown) => unknown, o?: unknown) => unknown)(
                (tx) => {
                  const txProxy = new Proxy(tx as object, {
                    get(t, p) {
                      if (p === "commishAudit") {
                        return {
                          create: async () => {
                            throw new Error("forced audit failure");
                          },
                        };
                      }
                      const v = (t as Record<string | symbol, unknown>)[p];
                      return typeof v === "function"
                        ? (v as (...a: unknown[]) => unknown).bind(t)
                        : v;
                    },
                  });
                  return fn(txProxy);
                },
                opts,
              );
          }
          return Reflect.get(target, prop, receiver);
        },
      }) as PrismaClient;

    const store = createPrismaAutoFireAdvanceStore(withFailingAudit(db), {
      reason: "x",
      nameOf: {},
    });
    await expect(
      store.applyRoundCut({
        leagueId: LEAGUE,
        roundLabel: "R32",
        roundPeriodId: R32,
        eliminated: ["m1", "m2"],
        champion: null,
        at: NOW,
      }),
    ).rejects.toThrow("forced audit failure");

    // NOTHING committed: entries still alive, roster still active, no audit row.
    expect((await entry("m1"))!.status).toBe("alive");
    expect((await entry("m2"))!.status).toBe("alive");
    expect(await db.rosterPlayer.count({ where: { managerId: "m1", droppedAt: null } })).toBe(1);
    expect(await db.commishAudit.count({ where: { leagueId: LEAGUE } })).toBe(0);
  });
});
