/**
 * The worker-local read PORT for the playoff round auto-fire (feat/autofire-round-cut). It carries only
 * the reads the auto-fire step needs and that the pure selector / the untouched `runRoundAdvance` do not
 * already own — kept as a port (not raw Prisma) so the IO orchestrator ({@link ./dispatch}) is unit-testable
 * against the in-memory double ({@link ./memoryStore}), the same arrangement as the period / faab / notify
 * stores.
 *
 * The DECISION lives in the pure {@link ./selectors.selectAutoFireCut}; the CUT + RELEASE + AUDIT live in the
 * untouched `runRoundAdvance` orchestrator (`@app/commish-core`); the ALERT transport lives in `@app/notify`.
 * This store only surfaces the round facts, the team names (for `runRoundAdvance`'s `nameOf`), and the
 * commissioner recipients for the tie-hold alert — it decides and writes NOTHING.
 */
import type { PeriodStatus } from "@app/shared";
import type { RoundCompletenessInput } from "./completeness";

/**
 * One knockout-round period, reduced to the auto-fire decision facts — the {@link AutoFireRound} the pure
 * selector consumes, MINUS the injected resolution (the worker resolves that via a dry-run `runRoundAdvance`).
 */
export interface AutoFireRoundRow {
  periodId: string;
  /** Canonical bracket label — R32 | R16 | QF | SF | Final. */
  label: string;
  /** Lifecycle status — `closed` == every fixture completed (the reused status-close output). */
  status: PeriodStatus;
  /** `max(kickoffAt)` among the round's fixtures — the freeze-proxy last-FT (`@app/recompute/freeze`, P45:
   *  `fifa_match` stores no completed-at instant). null when the round has no fixtures. */
  lastFtMs: number | null;
  /** True iff this round was already cut (≥1 `playoff_entry` stamped `eliminated_round == label`) — the SAME
   *  migration-free signal `createPrismaPlayoffAdvanceStore` reads. */
  alreadyCut: boolean;
}

export interface AutoFireStore {
  /** The single live league's id (mirrors the periodClose / periodStatus league scoping), or null. */
  loadLeagueId(): Promise<string | null>;
  /** Every knockout-round period with the auto-fire decision facts. */
  loadKnockoutRounds(leagueId: string): Promise<AutoFireRoundRow[]>;
  /** managerId → display name — `runRoundAdvance`'s `nameOf` (plan + audit labels). */
  loadTeamNames(leagueId: string): Promise<Record<string, string>>;
  /** The flagged-commissioner managerIds (`manager.is_commissioner`) — the tie-hold alert recipients. */
  loadCommissionerManagerIds(leagueId: string): Promise<string[]>;
  /** The DATA-COMPLETENESS inputs for one knockout round's period (FIX 1): per-fixture appearance bundles +
   *  rated set + dirty flags, and the round's pending `manager_period` recompute count. Fed to the pure
   *  {@link selectRoundDataComplete}. Reuses `playerAppearedInMatch`'s bundle shape (no appearance reinvented). */
  loadRoundCompleteness(roundPeriodId: string): Promise<RoundCompletenessInput>;
}
