/**
 * The batch controller — the thin orchestration the daily cron runs (DECISIONS.md §D). It carries NO
 * database dependency: it reads the league snapshot through the {@link FaabBatchStore} port, calls the
 * pure {@link resolveFaabBatch}, and applies the outcome through the same port. The store's
 * `commitBatch` is where the single atomic transaction (no double-spend, valid drop, waiver-order
 * contiguity) lives — the controller just sequences the steps and tallies the result.
 *
 * Idempotency is a property of the data, not a flag: a batch with nothing pending creates no row, and a
 * re-run after a clear finds the bids terminal (no longer pending) and is a clean no-op. A crash mid
 * way leaves the bids pending (the commit is one transaction → all-or-nothing), so the next run simply
 * re-clears them.
 */
import { resolveFaabBatch } from "./resolve";
import type { FaabBatchStore } from "./store";

export interface RunBatchSummary {
  leagueId: string;
  /** The created batch id, or null when there was nothing pending to clear (a no-op run). */
  batchId: string | null;
  bidsProcessed: number;
  won: number;
  lost: number;
  voided: number;
  waiverOrderChanged: boolean;
}

const EMPTY = (leagueId: string): RunBatchSummary => ({
  leagueId,
  batchId: null,
  bidsProcessed: 0,
  won: 0,
  lost: 0,
  voided: 0,
  waiverOrderChanged: false,
});

export async function runFaabBatch(
  store: FaabBatchStore,
  leagueId: string,
  now: Date,
  claimPeriodId: string,
): Promise<RunBatchSummary> {
  const ctx = await store.loadBatchContext(leagueId);
  if (!ctx || ctx.bids.length === 0) return EMPTY(leagueId);

  const outcome = resolveFaabBatch({
    now,
    managers: ctx.managers,
    bids: ctx.bids,
    ownedByLeague: ctx.ownedByLeague,
    rosterCap: ctx.rosterCap,
    // D4 (trim-down) participant gate: in the playoff phase the context carries the `alive` set and the
    // resolver voids + refunds every non-participant's still-pending bid (the backstop behind the
    // submission gate, for bids left pending across the group→playoff cutover). `null` in group ⇒ a
    // no-op (every bid competes), so group batches stay byte-identical. Threading this closes F-P0-01:
    // the controller previously omitted it, leaving the field `undefined` and the gate dead in prod.
    participantManagerIds: ctx.participantManagerIds,
  });

  // commitBatch claims the period (conditional, IS NULL) as the FIRST step of the apply transaction;
  // a null return means another worker/tick already cleared it → this run applied nothing (no-op).
  const batchId = await store.commitBatch({ leagueId, runAt: now, outcome, claimPeriodId });
  if (batchId === null) return EMPTY(leagueId);

  let won = 0;
  let lost = 0;
  let voided = 0;
  for (const r of outcome.resolutions) {
    if (r.outcome === "won") won += 1;
    else if (r.outcome === "lost") lost += 1;
    else voided += 1;
  }

  return {
    leagueId,
    batchId,
    bidsProcessed: outcome.resolutions.length,
    won,
    lost,
    voided,
    waiverOrderChanged: outcome.waiverOrderChanged,
  };
}
