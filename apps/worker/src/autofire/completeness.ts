/**
 * The PURE data-completeness gate for the playoff round auto-fire (feat/autofire-round-cut, FIX 1).
 *
 * This REPLACES the earlier clock-only settle window as the PRIMARY fire gate. The clock gate
 * (`lastFT + settle`) was effectively "the first tick after close" — with no completed-at column it could
 * fire on a final match whose RATINGS had not yet landed, and the round score (the cut criterion) depends
 * on ratings, the LAST-arriving scoring input (ARCHITECTURE.md → recompute/sweep: "rating lands near/after
 * FT, stats lag hours"). So the auto-cut now fires only when the round is SCORE-COMPLETE.
 *
 * A round is score-complete iff EVERY fixture in its period is:
 *   1. `completed` (the match is over), AND
 *   2. populated — it has ≥1 APPEARED player (a real match always does; zero ⇒ feed not yet ingested), AND
 *   3. fully rated — every APPEARED player (the reused {@link playerAppearedInMatch} participant gate — NOT
 *      reinvented here) has a rating ingested (provisional is fine; ABSENT is not), AND
 *   4. swept — no dirty stat/rating input rows remain for the fixture,
 * AND the round's period has no pending `manager_period` recompute (its `score_manager_period` is drained).
 *
 * FAIL-SAFE (the safety mechanism): when completeness cannot be POSITIVELY confirmed — no fixtures, a
 * fixture not completed / empty / unrated / mid-sweep, or a pending aggregation — this returns
 * `{ complete: false }`. The caller then HOLDS (never fires); manual `commish:advance --allow-incomplete`
 * is always the fallback. This is what justifies passing `allowIncomplete: true` to `runRoundAdvance`: at
 * fire time the scores are all PRESENT (just not yet frozen), not absent.
 *
 * THE NEVER-RATED-PLAYER EDGE (documented rule): if an appeared player never receives a rating, condition
 * (3) never clears, so the round never auto-fires — it HOLDS for manual resolution indefinitely rather than
 * firing on incomplete data. The caller emits a per-tick `log.warn` carrying the reason (so the hold is
 * VISIBLE, not silent) and the round stays plainly un-cut in the console; the commissioner resolves it with
 * `commish:advance --allow-incomplete`. We deliberately do NOT auto-escalate on a timer (that would
 * reintroduce the clock this fix removes and risk firing on incomplete data). Fail-safe beats liveness for
 * an unattended irreversible cut.
 */
import { playerAppearedInMatch, type ScoreInputBundle } from "@app/recompute";
import type { MatchStatus } from "@app/shared";

/** One fixture's completeness inputs. `bundles` are store-shaped (one per candidate player); appearance is
 *  DECIDED here via the reused {@link playerAppearedInMatch}, so the gate is single-sourced with scoring. */
export interface FixtureCompleteness {
  matchId: string;
  status: MatchStatus;
  /** One minimal {@link ScoreInputBundle} per candidate player (union of stat/event/shot participants). */
  bundles: readonly ScoreInputBundle[];
  /** playerIds carrying a `rating_player_match` row with a non-null rating (any source) — "rating ingested". */
  ratedPlayerIds: ReadonlySet<string>;
  /** True iff any `stat_player_match` / `rating_player_match` row for this fixture is still `dirty` (mid-sweep). */
  hasDirtyInput: boolean;
}

export interface RoundCompletenessInput {
  fixtures: readonly FixtureCompleteness[];
  /** Unprocessed `recompute_dirty` (scope `manager_period`) rows for the round's period — its
   *  `score_manager_period` aggregation is not yet drained. >0 ⇒ the round score may still move. */
  pendingManagerPeriodDirty: number;
}

export type RoundCompleteness = { complete: true } | { complete: false; reason: string };

/**
 * Decide whether a knockout round is SCORE-COMPLETE enough to auto-fire its cut. Pure — every row is
 * injected. Fails closed: the FIRST unmet condition returns `{ complete: false, reason }`.
 */
export function selectRoundDataComplete(input: RoundCompletenessInput): RoundCompleteness {
  const { fixtures, pendingManagerPeriodDirty } = input;

  // Fail-safe: no fixtures ⇒ cannot positively confirm anything ⇒ hold.
  if (fixtures.length === 0) return { complete: false, reason: "round has no fixtures" };

  // The round's aggregation is mid-flight — its score_manager_period may still change.
  if (pendingManagerPeriodDirty > 0) {
    return {
      complete: false,
      reason: `${pendingManagerPeriodDirty} manager-period recompute(s) pending for the round`,
    };
  }

  for (const f of fixtures) {
    if (f.status !== "completed") {
      return { complete: false, reason: `fixture ${f.matchId} not completed (status=${f.status})` };
    }
    const appeared = f.bundles.filter((b) => playerAppearedInMatch(b));
    // A completed real match always fields appeared players; zero ⇒ the feed has not landed yet ⇒ hold.
    if (appeared.length === 0) {
      return {
        complete: false,
        reason: `fixture ${f.matchId} has no appeared players — match data not yet ingested`,
      };
    }
    // A dirty input means the sweep has not yet folded the latest stat/rating into the score.
    if (f.hasDirtyInput) {
      return { complete: false, reason: `fixture ${f.matchId} has dirty (unswept) inputs` };
    }
    // Every appeared player must have a rating ingested (the last-arriving input; the cut criterion).
    const unrated = appeared.map((b) => b.playerId).filter((id) => !f.ratedPlayerIds.has(id));
    if (unrated.length > 0) {
      return {
        complete: false,
        reason: `fixture ${f.matchId} has ${unrated.length} unrated appeared player(s): ${unrated.join(", ")}`,
      };
    }
  }

  return { complete: true };
}
