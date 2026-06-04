/**
 * PURE settle target-selection (ARCHITECTURE.md §3 settle row). A pure function of (candidates, now):
 * the Sofascore rating lands near/after FT, so target FT players who lack a `scrape` row, grouped per
 * Sofascore match (one page fetch covers all its players), dropping stale matches. Inject `now`.
 * TODO(confirm): whether Sofascore exposes a usable LIVE rating — if so, widen the status filter to live.
 */
export interface ScrapeCandidate {
  matchId: string;
  playerId: string;
  sofascoreMatchId: number;
  sofascorePlayerId: number;
  status: string;
  kickoffMs: number;
  hasScrapeRating: boolean;
}
export interface ScrapeTarget {
  sofascoreMatchId: number;
  players: Array<{ matchId: string; playerId: string; sofascorePlayerId: number }>;
}

/** Stop retrying a match this long after kickoff (the rating has either landed or won't). */
const STALE_AFTER_MS = 24 * 60 * 60_000;

export function selectScrapeTargets(
  candidates: readonly ScrapeCandidate[],
  now: Date,
): ScrapeTarget[] {
  const t = now.getTime();
  const byMatch = new Map<number, ScrapeTarget>();
  for (const c of candidates) {
    if (c.status !== "completed") continue; // FT only (TODO(confirm): live rating)
    if (c.hasScrapeRating) continue; // already scraped
    if (t > c.kickoffMs + STALE_AFTER_MS) continue; // stale → give up
    let target = byMatch.get(c.sofascoreMatchId);
    if (!target) {
      target = { sofascoreMatchId: c.sofascoreMatchId, players: [] };
      byMatch.set(c.sofascoreMatchId, target);
    }
    target.players.push({
      matchId: c.matchId,
      playerId: c.playerId,
      sofascorePlayerId: c.sofascorePlayerId,
    });
  }
  return [...byMatch.values()];
}
