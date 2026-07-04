/**
 * PURE WC national-team elimination derivation (feat/auto-team-elimination). NO IO, no clock, no DB/feed
 * imports — every function is a pure function of its arguments, exactly like `packages/pool/src/pool.ts`
 * and `packages/recompute/src/standing.ts`. The worker tick's Prisma store ({@link ./store}) does the
 * freeze-gated read and the guarded write; this module only decides WHO lost.
 *
 * A national team is eliminated the MOMENT it LOSES a knockout match. The loser is the NON-advancer under
 * the SAME full-time → extra-time → penalties semantics as `@app/pool`'s `knockoutAdvancer` /
 * `derivePoolResult` (packages/pool/src/pool.ts). That logic is DELIBERATELY DUPLICATED here (a co-located
 * ~6-line pure helper) rather than imported, to avoid a worker → @app/pool package coupling for the sake of
 * two numeric comparisons. The unit test mirrors pool.test.ts's advancer cases so any drift between the two
 * derivations is caught — if the knockout tie-break rules ever change, BOTH this helper and `@app/pool`'s
 * `knockoutAdvancer` must change together.
 */
import type { MatchStatus } from "@app/shared";

/**
 * The minimum an elimination decision needs from a `fifa_match` row: its lifecycle status, the two team
 * FKs, and the three score phases. A `null` score is the feed's "not recorded" — a phase that did not
 * happen (e.g. no extra time), or a match not yet played.
 */
export interface KnockoutMatchResult {
  status: MatchStatus;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeScoreEt: number | null;
  awayScoreEt: number | null;
  homeScorePens: number | null;
  awayScorePens: number | null;
}

/** Which side of a decided knockout is the elimination target. */
type LoserSide = "home" | "away";

/**
 * A single decisive comparison: the LOWER side loses; null if a value is missing or the two are level.
 * Inverse mirror of `@app/pool`'s `decidedBy` (which names the advancer instead).
 */
function loserOf(home: number | null, away: number | null): LoserSide | null {
  if (home === null || away === null || home === away) return null;
  return home > away ? "away" : "home";
}

/**
 * The knockout loser side via full-time → extra-time → penalties; never a draw (a level phase falls
 * through to the next), null when no phase produced a decider. Mirror of `@app/pool`'s `knockoutAdvancer`.
 */
function knockoutLoserSide(m: KnockoutMatchResult): LoserSide | null {
  return (
    loserOf(m.homeScore, m.awayScore) ??
    loserOf(m.homeScoreEt, m.awayScoreEt) ??
    loserOf(m.homeScorePens, m.awayScorePens)
  );
}

/**
 * The `fifa_team.id` of the team eliminated by this knockout match, or null when no team is (yet)
 * eliminated by it:
 *  - status !== "completed" → null. Defense-in-depth: the store read is already `status='completed'`-gated,
 *    but a one-way `eliminated = true` write must NEVER fire on a live/provisional score.
 *  - no decider at FT / ET / pens → null (skip, never guess).
 *  - a decider whose LOSING side has a null team FK → null (skip, never guess a null team).
 */
export function deriveKnockoutLoserTeamId(m: KnockoutMatchResult): string | null {
  if (m.status !== "completed") return null;
  const side = knockoutLoserSide(m);
  if (side === null) return null;
  return side === "home" ? m.homeTeamId : m.awayTeamId;
}

/**
 * The UNION of the losers across a set of matches — the `fifa_team.id`s to flag `eliminated = true`. The
 * caller (the worker tick's store) supplies only FROZEN, completed, `knockout_round` fixtures; a match with
 * no derivable loser contributes nothing. Deduped and sorted for a deterministic result and log line.
 */
export function selectEliminatedTeamIds(matches: KnockoutMatchResult[]): string[] {
  const losers = new Set<string>();
  for (const m of matches) {
    const loser = deriveKnockoutLoserTeamId(m);
    if (loser !== null) losers.add(loser);
  }
  return [...losers].sort();
}
