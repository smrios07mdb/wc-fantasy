/**
 * The worker-local WC TEAM-ELIMINATION store port (feat/auto-team-elimination; DECISIONS.md "auto-derived
 * team elimination"). Carries exactly the two IO operations the resident-tick derivation needs: the
 * FREEZE-GATED read of completed knockout-round fixtures, and the guarded, set-only, GLOBAL write of
 * `fifa_team.eliminated`.
 *
 * Kept as a port (not raw Prisma) so the dispatcher is unit-testable against the in-memory double — the
 * same arrangement as the period status-advance store ({@link ../period/store}) and the FAAB cadence store.
 * The DECISION (who lost) stays in the PURE {@link ./selectEliminatedTeams}; this store only carries the
 * reads/writes the pure module must not own.
 */
import type { KnockoutMatchResult } from "./selectEliminatedTeams";

export interface TeamEliminationStore {
  /**
   * The FREEZE-GATED read: completed knockout-round fixtures whose period is frozen — `fifa_match.status =
   * 'completed'` AND the joined `period.kind = 'knockout_round'` AND `period.frozen_at IS NOT NULL`. Freeze
   * is stamped by the `wc-fantasy-period-close` cron ~result_freeze_hours after a round's last full-time, so
   * a round's losers flag only once that round is FINAL (a stalled cron delays, never breaks, elimination —
   * consistent with freeze being cron-only). The period-less 3rd-place match (`period_id` NULL) is naturally
   * excluded by the knockout join — no special-casing; its two teams are already-flagged semifinal losers.
   */
  loadFrozenCompletedKnockoutMatches(): Promise<KnockoutMatchResult[]>;
  /**
   * Flag the given teams eliminated — set-only, guarded, GLOBAL (`fifa_team` is league-agnostic reference
   * data, so no league scope):
   *   UPDATE fifa_team SET eliminated = true WHERE id IN (teamIds) AND eliminated = false
   * NEVER sets `eliminated = false` — a post-freeze result correction that "un-loses" a team stays a
   * commissioner action (`commish:roster --allow-eliminated` / manual SQL), never an auto-revive. Returns
   * the ids ACTUALLY flipped this call (empty in steady state — every loser already flagged), so the tick
   * logs a `team.elimination.flagged` line only on a real change. An empty input is a no-op returning `[]`.
   */
  flagEliminated(teamIds: string[]): Promise<string[]>;
}
