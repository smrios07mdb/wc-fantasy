/**
 * Period-freeze selector — PURE (DECISIONS.md §2 — INVARIANT 5).
 *
 * No IO, no clock, no Prisma: takes a snapshot of period + fixture state and returns the subset of
 * period IDs ready to have `frozen_at` stamped. Designed to be called hourly by the period-close
 * cron; idempotency is enforced by the `frozenAt` field (already-frozen periods are skipped).
 *
 * A period is freezable when:
 *   1. It has not already been frozen (`frozenAt === null`).
 *   2. It has at least one fixture.
 *   3. Every fixture has a final result (`status === "completed"`).
 *      Any `postponed` or `abandoned` fixture is an anomaly → the period is NOT frozen; the caller
 *      should log it for manual (commissioner) override.
 *   4. `now >= max(kickoffAt among the period's fixtures) + freezeHours`.
 *      `kickoffAt` is used as the proxy for the last FT whistle (the actual FT timestamp is not
 *      stored in the schema). Since `resultFreezeHours` defaults to 6, even a 90-min + ET match is
 *      well within the window.
 *
 * // TODO(confirm): frozen_at is stamped as `now` (the instant the cron runs), NOT the computed
 * //   threshold `max(kickoffAt) + freezeHours`. This records WHEN the period was actually frozen,
 * //   which is the right audit-trail value. The threshold is only the gate.
 *
 * // TODO(confirm): "all fixtures final" = every fixture status is "completed". A single
 * //   `postponed` or `abandoned` fixture blocks the whole period (anomaly path).
 */
import type { MatchStatus } from "@app/shared";

/** Minimal period view the selector needs. */
export interface FreezePeriod {
  id: string;
  frozenAt: Date | null;
}

/** Minimal fixture view the selector needs. */
export interface FreezeFixture {
  kickoffAt: Date;
  status: MatchStatus;
}

/** Fixture statuses that are anomalies — they block the period from freezing. */
const ANOMALY_STATUSES: MatchStatus[] = ["postponed", "abandoned"];

/**
 * Returns the IDs of periods that should be frozen NOW.
 *
 * @param periods           All periods to evaluate (the cron queries only `frozenAt: null`, but the
 *                          fn is defensive for testability — already-frozen periods are skipped).
 * @param fixturesByPeriod  Map from period id → fixtures within that period.
 * @param freezeHours       League's `resultFreezeHours` (runtime DB value, not the seed default).
 * @param now               Current instant (injected so the fn stays pure).
 */
export function selectPeriodsToFreeze(
  periods: FreezePeriod[],
  fixturesByPeriod: Record<string, FreezeFixture[]>,
  freezeHours: number,
  now: Date,
): string[] {
  const result: string[] = [];

  for (const period of periods) {
    // Idempotent: already frozen
    if (period.frozenAt !== null) continue;

    const fixtures = fixturesByPeriod[period.id] ?? [];

    // No fixtures — can't determine a freeze threshold
    if (fixtures.length === 0) continue;

    // Anomaly: any postponed/abandoned fixture blocks the whole period
    if (fixtures.some((f) => ANOMALY_STATUSES.includes(f.status))) continue;

    // Not yet fully settled (any scheduled or in_progress match)
    if (!fixtures.every((f) => f.status === "completed")) continue;

    // Freeze threshold: max(kickoffAt) + freeze window
    const lastKickoffMs = Math.max(...fixtures.map((f) => f.kickoffAt.getTime()));
    const thresholdMs = lastKickoffMs + freezeHours * 60 * 60 * 1_000;

    if (now.getTime() >= thresholdMs) {
      result.push(period.id);
    }
  }

  return result;
}

/**
 * Returns the IDs of unfrozen periods that have anomalous fixtures (postponed or abandoned).
 * The cron body logs these for manual operator / commissioner resolution.
 */
export function selectAnomalyPeriods(
  periods: FreezePeriod[],
  fixturesByPeriod: Record<string, FreezeFixture[]>,
): string[] {
  return periods
    .filter(
      (p) =>
        p.frozenAt === null &&
        (fixturesByPeriod[p.id] ?? []).some((f) => ANOMALY_STATUSES.includes(f.status)),
    )
    .map((p) => p.id);
}
