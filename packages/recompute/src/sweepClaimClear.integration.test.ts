/**
 * Real-Postgres integration suite for the recompute sweep's claim-then-clear path (fix/sweep-claim-clear-race).
 * Covers BOTH defects of this branch:
 *   1. the TOCTOU lost-update the claim closes (a raw write in the read→clear window), and
 *   2. the lost-on-failure regression the claim introduced (a recompute that throws after its key was
 *      claim-cleared) and its Phase-1 failure isolation.
 *
 * WHY ONE FILE: `sweep` is the SINGLE serial sweeper in prod, and `claimDirtyPlayerMatches` claims EVERY
 * dirty row in the database (not scoped to a match). Two sweep tests in separate files would race for each
 * other's claimed rows under Vitest's file parallelism. Keeping them in ONE file runs them serially — one
 * sweep at a time, the production invariant — so the suite is deterministic.
 *
 * WHY A REAL DATABASE: the {@link MemoryStore} models `dirty` as a single in-memory Set per (match,
 * player), so it cannot reproduce a raw write cleared-without-incorporation (defect 1) or the per-table
 * `updateManyAndReturn` claim atomicity. This drives the REAL `sweep` through the REAL Prisma store.
 *
 * GATED on RECOMPUTE_PG_TEST_URL (a THROWAWAY DB — the suite TRUNCATEs tables); skipped in normal
 * `pnpm test`. To run it:
 *
 *   docker run -d --name wc-recompute-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=recompute_test -p 5466:5432 postgres:16
 *   export RECOMPUTE_PG_TEST_URL="postgresql://postgres:postgres@127.0.0.1:5466/recompute_test"
 *   DATABASE_URL="$RECOMPUTE_PG_TEST_URL" DIRECT_URL="$RECOMPUTE_PG_TEST_URL" \
 *     pnpm --filter @app/db exec prisma db push --skip-generate
 *   pnpm vitest run packages/recompute/src/sweepClaimClear.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@app/db";
import type { ScoreBreakdown } from "@app/scoring";
import { sweep } from "./recompute";
import { createPrismaStore } from "./prismaStore";
import type { RecomputeStore } from "./store";

const TEST_URL = process.env.RECOMPUTE_PG_TEST_URL;

const hasRatingLine = (b: ScoreBreakdown | null | undefined): boolean =>
  !!b?.lines?.some((l) => l.category === "rating");

describe.skipIf(!TEST_URL)("recompute sweep — claim-then-clear (real Postgres)", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_URL });
    await db.$connect();
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  // Global reset before EACH test. The file runs tests serially, so there is only ever one sweep in
  // flight — wiping every table is safe and keeps each test hermetic against the global claim.
  beforeEach(async () => {
    await db.scorePlayerMatch.deleteMany({});
    await db.ratingPlayerMatch.deleteMany({});
    await db.manualStatPlayerMatch.deleteMany({});
    await db.statPlayerMatch.deleteMany({});
    await db.recomputeDirty.deleteMany({});
    await db.fifaMatch.deleteMany({});
    await db.player.deleteMany({});
    await db.fifaTeam.deleteMany({});
  });

  // ── Defect 1: the TOCTOU lost-update closed by the claim ──────────────────────────────────────────
  describe("TOCTOU: a rating committed in the read→clear window", () => {
    const HOME = "t-home";
    const AWAY = "t-away";
    const PLAYER = "p-1";
    const MATCH = "m-1";
    const RATING = 8.2; // band 8.0–8.5 → +3; a clear "rating" line once folded in

    beforeEach(async () => {
      await db.fifaTeam.createMany({
        data: [
          { id: HOME, balldontlieId: 9001, name: "Home" },
          { id: AWAY, balldontlieId: 9002, name: "Away" },
        ],
      });
      await db.player.create({
        data: { id: PLAYER, balldontlieId: 9010, displayName: "T", position: "MID", teamId: HOME },
      });
      await db.fifaMatch.create({
        data: {
          id: MATCH,
          balldontlieId: 9100,
          kickoffAt: new Date("2026-06-15T12:00:00Z"),
          homeTeamId: HOME,
          awayTeamId: AWAY,
          homeScore: 0,
          awayScore: 0,
          periodId: null, // no period → getAffectedManagerPeriods() is [] → Phase 1 in isolation
        },
      });
      // The only dirty input: a real (90') stat line. NO rating row yet — the rating arrives mid-sweep.
      await db.statPlayerMatch.create({
        data: { matchId: MATCH, playerId: PLAYER, minutesPlayed: 90, dirty: true },
      });
    });

    /** Inject the concurrent scraper rating write AFTER the read (no rating yet), BEFORE the would-be clear.
     *  One-shot so a later sweep folds it in rather than re-racing. */
    function racingStore(): RecomputeStore {
      const real = createPrismaStore(db);
      let injected = false;
      return {
        ...real,
        async getPlayerMatchInput(matchId, playerId) {
          const bundle = await real.getPlayerMatchInput(matchId, playerId);
          if (!injected && matchId === MATCH && playerId === PLAYER) {
            injected = true;
            await db.ratingPlayerMatch.upsert({
              where: { matchId_playerId_source: { matchId, playerId, source: "scrape" } },
              create: { matchId, playerId, source: "scrape", rating: RATING, dirty: true },
              update: { rating: RATING, dirty: true },
            });
          }
          return bundle;
        },
      };
    }

    const readState = async () => {
      const rating = await db.ratingPlayerMatch.findUnique({
        where: { matchId_playerId_source: { matchId: MATCH, playerId: PLAYER, source: "scrape" } },
      });
      const score = await db.scorePlayerMatch.findUnique({
        where: { matchId_playerId: { matchId: MATCH, playerId: PLAYER } },
      });
      return {
        rating,
        breakdown: (score?.breakdownJson as unknown as ScoreBreakdown | undefined) ?? null,
      };
    };

    it("is never left dirty=false AND unincorporated", async () => {
      const store = racingStore();
      await sweep(store);

      const { rating, breakdown } = await readState();
      expect(rating).not.toBeNull();
      expect(breakdown).not.toBeNull();

      // EITHER folded into the score OR still dirty for the next tick — never silently cleared. The OLD
      // read→compute→clear shape clears it without folding in → this fails RED against the old code.
      const frozenAndUnincorporated = rating!.dirty === false && !hasRatingLine(breakdown);
      expect(frozenAndUnincorporated).toBe(false);
    });

    it("converges into the score on the next sweep", async () => {
      const store = racingStore();
      await sweep(store); // rating lands in the window; under the fix it stays dirty
      await sweep(store); // the still-dirty rating is claimed and folded in (no re-injection)

      const { rating, breakdown } = await readState();
      expect(hasRatingLine(breakdown)).toBe(true);
      expect(rating!.dirty).toBe(false);
    });
  });

  // ── Defect 2: Phase-1 failure isolation (re-dirty on throw, no orphaning) ─────────────────────────
  describe("failure isolation: a recompute that throws", () => {
    const HOME = "fi-home";
    const AWAY = "fi-away";
    const MATCH = "fi-m";
    const PLAYERS = ["fi-1", "fi-2", "fi-3", "fi-4"] as const; // claimed in order; fi-2 is the poison
    const POISON = "fi-2";

    beforeEach(async () => {
      await db.fifaTeam.createMany({
        data: [
          { id: HOME, balldontlieId: 9301, name: "Home" },
          { id: AWAY, balldontlieId: 9302, name: "Away" },
        ],
      });
      await db.player.createMany({
        data: PLAYERS.map((id, i) => ({
          id,
          balldontlieId: 9310 + i,
          displayName: id,
          position: "MID" as const,
          teamId: HOME,
        })),
      });
      await db.fifaMatch.create({
        data: {
          id: MATCH,
          balldontlieId: 9300,
          kickoffAt: new Date("2026-06-15T12:00:00Z"),
          homeTeamId: HOME,
          awayTeamId: AWAY,
          homeScore: 0,
          awayScore: 0,
          periodId: null,
        },
      });
      await db.statPlayerMatch.createMany({
        data: PLAYERS.map((playerId) => ({
          matchId: MATCH,
          playerId,
          minutesPlayed: 90,
          dirty: true,
        })),
      });
    });

    /** Real store, but (1) `getPlayerMatchInput` throws once for the poison key, and (2)
     *  `claimDirtyPlayerMatches` returns the keys by playerId so the poison is NOT last — making the bare
     *  loop's orphaning of the keys after it deterministic. */
    function poisonStore(): RecomputeStore {
      const real = createPrismaStore(db);
      let failsLeft = 1;
      return {
        ...real,
        async claimDirtyPlayerMatches() {
          const claimed = await real.claimDirtyPlayerMatches();
          return claimed.sort((a, b) => a.playerId.localeCompare(b.playerId));
        },
        async getPlayerMatchInput(matchId, playerId) {
          if (playerId === POISON && failsLeft > 0) {
            failsLeft -= 1;
            throw new Error(`forced recompute failure for ${playerId}`);
          }
          return real.getPlayerMatchInput(matchId, playerId);
        },
      };
    }

    const dirtyOf = async (playerId: string): Promise<boolean | undefined> =>
      (
        await db.statPlayerMatch.findUnique({
          where: { matchId_playerId: { matchId: MATCH, playerId } },
        })
      )?.dirty;
    const scoredOf = (playerId: string) =>
      db.scorePlayerMatch.findUnique({ where: { matchId_playerId: { matchId: MATCH, playerId } } });

    it("re-dirties the failed key for retry while every sibling is still processed (no orphaning)", async () => {
      const store = poisonStore();
      // OLD bare loop: the poison throw rejects out of sweep, orphaning fi-3/fi-4. The fix catches it,
      // re-dirties fi-2, and processes the whole batch — `.catch` lets us inspect state either way.
      const first = await sweep(store).catch(() => null);

      // (b) NO ORPHANING: the siblings after (and before) the poison were processed and cleared.
      expect(await scoredOf("fi-3")).not.toBeNull();
      expect(await scoredOf("fi-4")).not.toBeNull();
      expect(await dirtyOf("fi-3")).toBe(false);
      expect(await dirtyOf("fi-4")).toBe(false);
      expect(await scoredOf("fi-1")).not.toBeNull();

      // (a) THE INVARIANT for the failed key: dirty=true for retry, never dirty=false-and-stale.
      expect(await dirtyOf(POISON)).toBe(true);
      expect(await scoredOf(POISON)).toBeNull();
      expect(first?.playerMatchFailures).toBe(1);

      // ...and a follow-up sweep folds the re-dirtied key in (poison exhausted).
      const second = await sweep(store);
      expect(second.playerMatchFailures).toBe(0);
      expect(await scoredOf(POISON)).not.toBeNull();
      expect(await dirtyOf(POISON)).toBe(false);
    });
  });
});
