/**
 * In-memory {@link ScrapeStore} — the test double. Models the scrape-rating + stat-dirty surface so
 * seeding here exercises the real scraper orchestration with NO database. Mirrors the production
 * semantics: writeScrapeRating overwrites the rating + re-dirties (match,player) WITHOUT touching an
 * existing stat row (the shared `STAT_DIRTY_UPDATE` on-conflict invariant — a late scrape must not
 * clobber landed stats).
 */
import type { ScrapeStore } from "./store";
import type { ScrapeCandidate } from "./target";
import type { RatingPair } from "./compare";

const pk = (a: string, b: string): string => `${a} ${b}`;

export class MemoryScrapeStore implements ScrapeStore {
  private scrapeRatings = new Map<string, number>();
  private stats = new Map<string, Record<string, number>>();
  private dirty = new Set<string>();
  private candidates: ScrapeCandidate[] = [];
  private pairs: RatingPair[] = [];

  // ── seeding / assertions ──
  seedStat(m: string, p: string, stat: Record<string, number>): void {
    this.stats.set(pk(m, p), stat);
  }
  seedCandidate(c: ScrapeCandidate): void {
    this.candidates.push(c);
  }
  seedPair(pair: RatingPair): void {
    this.pairs.push(pair);
  }
  scrapeRating(m: string, p: string): number | undefined {
    return this.scrapeRatings.get(pk(m, p));
  }
  stat(m: string, p: string): Record<string, number> | undefined {
    return this.stats.get(pk(m, p));
  }
  isDirty(m: string, p: string): boolean {
    return this.dirty.has(pk(m, p));
  }
  clearDirty(m: string, p: string): void {
    this.dirty.delete(pk(m, p));
  }

  // ── ScrapeStore ──
  listScrapeCandidates(): Promise<ScrapeCandidate[]> {
    return Promise.resolve([...this.candidates]);
  }
  writeScrapeRating(matchId: string, playerId: string, rating: number): Promise<void> {
    this.scrapeRatings.set(pk(matchId, playerId), rating);
    // re-dirty WITHOUT touching an existing stat row (mirrors STAT_DIRTY_UPDATE's on-conflict invariant)
    this.dirty.add(pk(matchId, playerId));
    return Promise.resolve();
  }
  listRatingPairs(): Promise<RatingPair[]> {
    return Promise.resolve([...this.pairs]);
  }
}
