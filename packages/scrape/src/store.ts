/**
 * The scraper's IO PORT — the ONLY DB surface the scraper needs. Deliberately tiny (the scraper "writes
 * rating only"): list candidates, write a scrape rating (+ dirty), and read paired ratings for the
 * comparison tool. The Prisma impl ({@link ./prismaStore}) re-dirties via the SHARED `@app/db` invariant
 * (no `@app/ingest` import). Orchestration is store-agnostic and unit-testable against {@link ./memoryStore}.
 */
import type { ScrapeCandidate } from "./target";
import type { RatingPair } from "./compare";

export interface ScrapeStore {
  /** Candidate (match,player) rows for scraping: completed matches with a stored sofascore_match_id and
   *  their players with a stored sofascore_player_id; `hasScrapeRating` flags those already done. */
  listScrapeCandidates(): Promise<ScrapeCandidate[]>;
  /** Upsert the `source='scrape'` rating + re-dirty (match,player) so the existing sweep recomputes. */
  writeScrapeRating(matchId: string, playerId: string, rating: number): Promise<void>;
  /** Paired ratings where BOTH `scrape` and `balldontlie` exist (for the comparison tool). */
  listRatingPairs(): Promise<RatingPair[]>;
}
