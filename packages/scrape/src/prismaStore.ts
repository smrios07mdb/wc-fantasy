/**
 * Prisma-backed {@link ScrapeStore} — the ONLY DB-touching file in @app/scrape. Writes the
 * `source='scrape'` rating and re-dirties via the SHARED `@app/db` invariant (`markStatPlayerDirty`) —
 * NO `@app/ingest` import (physical isolation). No unit test (needs a live DB); covered by typecheck +
 * the Memory store's behavioural tests (idempotent write + no-clobber dirty).
 */
import type { PrismaClient } from "@app/db";
import { markStatPlayerDirty } from "@app/db";
import type { ScrapeStore } from "./store";
import type { ScrapeCandidate } from "./target";
import type { RatingPair } from "./compare";

type Db = PrismaClient;

export function createPrismaScrapeStore(prisma: Db): ScrapeStore {
  return {
    async listScrapeCandidates(): Promise<ScrapeCandidate[]> {
      // Completed matches with a stored sofascore_match_id; their players that played (have a
      // stat_player_match row) + a stored sofascore_player_id; flag those already given a scrape rating.
      const matches = await prisma.fifaMatch.findMany({
        where: { status: "completed", sofascoreMatchId: { not: null } },
        select: {
          id: true,
          sofascoreMatchId: true,
          kickoffAt: true,
          status: true,
          playerStats: {
            select: { playerId: true, player: { select: { sofascorePlayerId: true } } },
          },
          ratings: { where: { source: "scrape" }, select: { playerId: true } },
        },
      });
      const out: ScrapeCandidate[] = [];
      for (const m of matches) {
        if (m.sofascoreMatchId == null) continue;
        const scraped = new Set(m.ratings.map((r) => r.playerId));
        for (const s of m.playerStats) {
          const sofa = s.player.sofascorePlayerId;
          if (sofa == null) continue;
          out.push({
            matchId: m.id,
            playerId: s.playerId,
            sofascoreMatchId: m.sofascoreMatchId,
            sofascorePlayerId: sofa,
            status: m.status,
            kickoffMs: m.kickoffAt.getTime(),
            hasScrapeRating: scraped.has(s.playerId),
          });
        }
      }
      return out;
    },

    async writeScrapeRating(matchId, playerId, rating): Promise<void> {
      await prisma.ratingPlayerMatch.upsert({
        where: { matchId_playerId_source: { matchId, playerId, source: "scrape" } },
        create: { matchId, playerId, source: "scrape", rating, dirty: true },
        update: { rating, dirty: true },
      });
      await markStatPlayerDirty(prisma, matchId, playerId);
    },

    async listRatingPairs(): Promise<RatingPair[]> {
      const rows = await prisma.ratingPlayerMatch.findMany({
        where: { source: { in: ["scrape", "balldontlie"] }, rating: { not: null } },
        select: { matchId: true, playerId: true, source: true, rating: true },
      });
      const byKey = new Map<string, { scrape?: number; balldontlie?: number }>();
      for (const r of rows) {
        const k = `${r.matchId} ${r.playerId}`;
        const e = byKey.get(k) ?? {};
        if (r.source === "scrape") e.scrape = r.rating ?? undefined;
        else if (r.source === "balldontlie") e.balldontlie = r.rating ?? undefined;
        byKey.set(k, e);
      }
      const pairs: RatingPair[] = [];
      for (const e of byKey.values()) {
        if (e.scrape != null && e.balldontlie != null) {
          pairs.push({ scrape: e.scrape, balldontlie: e.balldontlie });
        }
      }
      return pairs;
    },
  };
}
