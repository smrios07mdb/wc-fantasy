/**
 * Real-Postgres integration guard for the waivers loader's PHASE derivation (P2 contract fix). The pure
 * `waiversLogic` + `loadWaivers.contract` (source-shape) suites cover the rest; this pins the Prisma EDGE
 * end-to-end on the ONE thing that needs a live DB — that `loadWaivers` keys the roster cap / playoff phase
 * on playoff_entry EXISTENCE, not the `league.status` field.
 *
 * DISAGREEMENT fixture: alive playoff_entry rows exist while league.status still reads 'group' (the R32
 * pre-kickoff trim window). Old code (status read) → cap 15 / not-playoff; the fix (entry existence) → cap 9
 * / playoff. selectTournamentPhase would also have returned 'group' here and broken the trim — see DECISIONS §D.
 *
 * GATED on WAIVERS_PG_TEST_URL **and** DATABASE_URL pointing at the SAME throwaway DB (the loader reads via
 * the `@app/db` singleton, which binds DATABASE_URL — so the seed and the read must hit one DB). Skipped in
 * normal `pnpm test`. No migration in this thread; the DB only needs the existing schema applied. Run:
 *
 *   docker run -d --name wc-waivers-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres \
 *     -e POSTGRES_DB=waivers_test -p 5471:5432 postgres:16
 *   export WAIVERS_PG_TEST_URL="postgresql://postgres:postgres@127.0.0.1:5471/waivers_test"
 *   DATABASE_URL="$WAIVERS_PG_TEST_URL" DIRECT_URL="$WAIVERS_PG_TEST_URL" \
 *     pnpm --filter @app/db exec prisma migrate deploy
 *   DATABASE_URL="$WAIVERS_PG_TEST_URL" DIRECT_URL="$WAIVERS_PG_TEST_URL" \
 *     pnpm exec vitest run apps/web/app/waivers/loadWaivers.integration.test.ts
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@app/db";
import { loadWaivers } from "./loadWaivers";

const TEST_URL = process.env.WAIVERS_PG_TEST_URL;
// Safety latch: only run when the singleton the loader reads is bound to the SAME throwaway DB we seed.
const SAFE = !!TEST_URL && process.env.DATABASE_URL === TEST_URL;

const LEAGUE = "wv-load-league";
const MGR = "wv-mgr";

describe.skipIf(!SAFE)(
  "loadWaivers — playoff phase from playoff_entry existence (real Postgres)",
  () => {
    afterAll(async () => {
      await prisma.$disconnect();
    });

    beforeEach(async () => {
      // Wipe the FK chain this loader touches, child-first.
      await prisma.faabBid.deleteMany({});
      await prisma.faabBatch.deleteMany({});
      await prisma.rosterPlayer.deleteMany({});
      await prisma.lineupSlot.deleteMany({});
      await prisma.scoreManagerPeriod.deleteMany({});
      await prisma.scorePlayerMatch.deleteMany({});
      await prisma.fifaMatch.deleteMany({});
      await prisma.playoffEntry.deleteMany({});
      await prisma.period.deleteMany({});
      await prisma.player.deleteMany({});
      await prisma.fifaTeam.deleteMany({});
      await prisma.manager.deleteMany({});
      await prisma.league.deleteMany({});
    });

    it("alive entries + status='group' ⇒ cap 9 / playoff phase (NOT cap 15)", async () => {
      // The status field still lags: league.status='group', but the alive playoff_entry rows already exist.
      await prisma.league.create({
        data: { id: LEAGUE, name: "Waivers Load League", status: "group" },
      });
      await prisma.manager.create({ data: { id: MGR, leagueId: LEAGUE, displayName: "Trimmer" } });
      await prisma.playoffEntry.create({
        data: { leagueId: LEAGUE, managerId: MGR, seed: 1, status: "alive" },
      });

      const view = (await loadWaivers(MGR))!;
      expect(view).not.toBeNull();
      expect(view.isPlayoffPhase).toBe(true); // entry exists ⇒ playoff phase, despite status='group'
      expect(view.rosterCap).toBe(9); // RED on the old status read (it would be 15)
      expect(view.isParticipant).toBe(true); // the alive entry
    });

    it("no entries (group phase) ⇒ cap 15 / not playoff", async () => {
      await prisma.league.create({
        data: { id: LEAGUE, name: "Waivers Load League", status: "group" },
      });
      await prisma.manager.create({ data: { id: MGR, leagueId: LEAGUE, displayName: "Grouper" } });

      const view = (await loadWaivers(MGR))!;
      expect(view.isPlayoffPhase).toBe(false);
      expect(view.rosterCap).toBe(15);
      expect(view.isParticipant).toBe(true); // everyone participates outside the playoff phase
    });
  },
);
