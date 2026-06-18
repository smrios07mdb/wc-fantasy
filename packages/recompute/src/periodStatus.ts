/**
 * Period status-lifecycle selector — PURE (DECISIONS.md §2; sibling of {@link ./freeze}).
 *
 * The `period.status` lifecycle (pending → open → closed; `PERIOD_STATUSES` in @app/shared) advances
 * a matchday wave from "not yet live" to "live (set lineups / drop free agents)" to "over". This pure
 * fn takes a snapshot of every period + its fixtures and returns the transitions to apply NOW:
 * `toClose` (waves whose last match has finished) and `toOpen` (the next wave promoted to live).
 *
 * DECOUPLED FROM FREEZE. Freeze (`frozen_at`, {@link ./freeze.selectPeriodsToFreeze}) gates
 * commissioner-only restatement and waits `result_freeze_hours` after the last FT. Status-close keys
 * purely on "every fixture completed" — a wave is over the moment its matches are done, regardless of
 * the freeze window. Dropping a played player after close is safe: his locked lineup slot stays
 * (scoring reads the slot), only unlocked slots release. So the two clocks are independent.
 *
 * INVARIANT — exactly one open period. `toOpen` promotes the EARLIEST (canonical tournament order,
 * {@link @app/shared.comparePeriodLabels}) period that is not closed-and-not-closing, and only when it
 * is still `pending`. This:
 *   • hands off cleanly: close MD1 ⟹ open MD2 (one open at a time);
 *   • is a no-op in steady state (the current period is already `open`, so nothing to promote);
 *   • self-heals a bootstrap with no open period (the earliest pending is promoted);
 *   • yields no opens once every period is closed (tournament end).
 *
 * Designed to be called hourly by the period-close cron; idempotent because it reads the live status
 * and never re-emits a transition already applied.
 */
import { comparePeriodLabels, type PeriodStatus } from "@app/shared";
import { selectAnomalyPeriods, type FreezeFixture, type FreezePeriod } from "./freeze";

/**
 * Minimal period view the selector needs. Extends the freeze view ({@link FreezePeriod}) — `frozenAt`
 * rides along so the shared {@link selectAnomalyPeriods} can be reused — with the canonical-order
 * `label` and the `status` column being advanced.
 */
export interface TransitionPeriod extends FreezePeriod {
  /** Canonical-order label (e.g. "MD1", "R32", "Final") — drives the earliest-current pick. */
  label: string;
  /** Lifecycle status being transitioned (the column this selector advances). */
  status: PeriodStatus;
}

/**
 * Fixture view — identical to the freeze selector's. Only `status` drives the close decision; the
 * `kickoffAt` field rides along so {@link selectAnomalyPeriods} can be reused without reshaping.
 */
export type TransitionFixture = FreezeFixture;

/** The transitions to apply: period IDs to close, period IDs to open. */
export interface PeriodStatusTransitions {
  toClose: string[];
  toOpen: string[];
}

/**
 * Compute the period status transitions to apply now.
 *
 * @param periods           All periods in the league (closed ones INCLUDED — the earliest-current
 *                          computation needs the full set, unlike the freeze query).
 * @param fixturesByPeriod  Map from period id → fixtures within that period.
 */
export function selectPeriodStatusTransitions(
  periods: TransitionPeriod[],
  fixturesByPeriod: Record<string, TransitionFixture[]>,
): PeriodStatusTransitions {
  // Anomaly periods (a postponed/abandoned fixture) are not cleanly over — never close them; the
  // cron already logs them for commissioner resolution. Reuse the freeze module's helper so the
  // anomaly definition stays single-sourced.
  const anomalyIds = new Set(selectAnomalyPeriods(periods, fixturesByPeriod));

  const toClose: string[] = [];
  for (const period of periods) {
    if (period.status === "closed") continue; // already closed — idempotent
    if (anomalyIds.has(period.id)) continue; // postponed/abandoned — leave for the commissioner

    const fixtures = fixturesByPeriod[period.id] ?? [];
    if (fixtures.length === 0) continue; // no fixtures — can't tell whether it's over
    if (!fixtures.every((f) => f.status === "completed")) continue; // still scheduled / in_progress

    toClose.push(period.id);
  }

  // afterClosed = periods that will be closed once this run applies (existing-closed ∪ toClose). The
  // CURRENT period is the earliest (canonical order) not in that set; promote it to "open" only if it
  // is still "pending" — maintaining exactly one open period, self-healing on bootstrap, and emitting
  // nothing once every period is closed.
  const afterClosed = new Set<string>(toClose);
  for (const period of periods) {
    if (period.status === "closed") afterClosed.add(period.id);
  }

  const current = [...periods]
    .filter((p) => !afterClosed.has(p.id))
    .sort((a, b) => comparePeriodLabels(a.label, b.label))[0];

  const toOpen: string[] = current && current.status === "pending" ? [current.id] : [];

  return { toClose, toOpen };
}
