/**
 * The resident-tick WC TEAM-ELIMINATION driver (feat/auto-team-elimination; DECISIONS.md "auto-derived team
 * elimination"). Called each worker tick AFTER the settle/ingest steps so it reads current results: read the
 * freeze-gated completed knockout fixtures, derive the union of losers via the UNCHANGED pure
 * `selectEliminatedTeamIds`, and flag them through the store's guarded, set-only, GLOBAL write.
 *
 * TICK-ONLY — no cron, no dual-writer. Unlike the P1a period status-open second writer (a CLOSING FA window
 * ⇒ a missed `pending → open` is a permanent SPOF, so it needs the cron + the tick), a missed elimination
 * flag is SELF-HEALING: the idempotent tick re-derives it every 60s and the guarded write (`WHERE eliminated
 * = false`) is a no-op once a team is flagged. There is no closing window to miss, so a single tick writer
 * with no cron backstop is sufficient. A stalled period-close cron only DELAYS the freeze that gates the read
 * (elimination waits for the round to be final) — it never breaks it.
 *
 * Idempotent by the guard: in steady state every loser is already `eliminated = true`, so `flagEliminated`
 * flips 0 rows and returns `[]` — the tick emits no log. Group-stage steady state (no frozen knockout round)
 * short-circuits before any write, since the loser union is empty.
 */
import { selectEliminatedTeamIds } from "./selectEliminatedTeams";
import type { TeamEliminationStore } from "./store";

export interface TeamEliminationOutcome {
  /** The `fifa_team.id`s newly flagged `eliminated = true` THIS tick (empty in steady state). */
  flagged: string[];
}

export async function dispatchTeamElimination(
  store: TeamEliminationStore,
): Promise<TeamEliminationOutcome> {
  const matches = await store.loadFrozenCompletedKnockoutMatches();
  const losers = selectEliminatedTeamIds(matches);

  // No frozen knockout round yet (the group-stage steady state) ⇒ empty union ⇒ nothing to flag; skip the
  // write entirely. Once knockouts freeze, `losers` carries the historical loser set and the guarded
  // `flagEliminated` narrows it to the not-yet-flagged teams (so a re-tick flips nothing and returns []).
  if (losers.length === 0) return { flagged: [] };

  const flagged = await store.flagEliminated(losers);
  return { flagged };
}
