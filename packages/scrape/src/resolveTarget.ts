/**
 * PURE scrape-time identity. Resolves a target ONLY from STORED Sofascore ids — never live name-matching.
 * Rationale: the resolver prefers `scrape` over `balldontlie`, so a wrong scrape row DISPLACES the safe
 * fallback with a wrong PRIMARY rating (silent, recurring, ~5-pt swings on the wrong manager). A
 * missing/absent id → null → no scrape row → balldontlie fallback. Verified ids come from the population pass.
 */
export interface StoredIds {
  sofascoreMatchId: number | null;
  sofascorePlayerId: number | null;
}
export interface ScrapeTargetId {
  sofascoreMatchId: number;
  sofascorePlayerId: number;
}

export function resolveTarget(stored: StoredIds): ScrapeTargetId | null {
  if (stored.sofascoreMatchId == null || stored.sofascorePlayerId == null) return null;
  return { sofascoreMatchId: stored.sofascoreMatchId, sofascorePlayerId: stored.sofascorePlayerId };
}
