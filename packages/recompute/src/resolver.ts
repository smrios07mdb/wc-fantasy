/**
 * Rating resolver — pure (ARCHITECTURE.md §3, DECISIONS.md → Data source Amendment 2a).
 *
 * The scoring engine reads the rating through ONE resolver with a configurable source priority per
 * (match, player). Default `[manual, scrape, balldontlie]`: Sofascore `scrape` is the calibrated
 * primary; `balldontlie` is the automatic fallback; a `manual` override beats both. The resolver is
 * a pure function of the source-tagged `rating_player_match` rows for one (match, player).
 */
import { DEFAULT_RATING_SOURCE_PRIORITY, type RatingSource } from "@app/shared";

/** One source-tagged rating for a (match, player) — mirrors `rating_player_match`. */
export interface RatingRow {
  source: RatingSource;
  /** The 0–10 value, or null/absent when that source has no rating for this player-match. */
  rating: number | null;
}

/** The chosen rating plus which source supplied it (null/null when every source is empty). */
export interface ResolvedRating {
  rating: number | null;
  source: RatingSource | null;
}

/**
 * First non-null rating in the configured source priority, with the winning source (for the audit
 * trail / breakdown detail). Sources absent from `rows` are simply skipped.
 */
export function pickRating(
  rows: readonly RatingRow[],
  priority: readonly RatingSource[] = DEFAULT_RATING_SOURCE_PRIORITY,
): ResolvedRating {
  for (const source of priority) {
    const row = rows.find((r) => r.source === source);
    // `!= null` rejects both null and undefined; a present-but-null row falls through to the next.
    if (row && row.rating != null) return { rating: row.rating, source };
  }
  return { rating: null, source: null };
}

/**
 * The headline resolver (ARCHITECTURE.md §3 signature): the chosen rating or null. Sofascore
 * `scrape` leads, `balldontlie` is the fallback, `manual` overrides — reorderable via `priority`.
 */
export function resolveRating(
  rows: readonly RatingRow[],
  priority: readonly RatingSource[] = DEFAULT_RATING_SOURCE_PRIORITY,
): number | null {
  return pickRating(rows, priority).rating;
}
