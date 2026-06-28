/**
 * Canonical tournament progression order for periods (the SINGLE source used to order period selectors —
 * the set-lineup matchday tabs today; any future period picker tomorrow). The provision seed creates
 * periods in exactly this sequence: the group matchdays (MD1, MD2, MD3, …) first, by matchday number,
 * then the knockout rounds in BRACKET order (R32, R16, QF, SF, Final — {@link KNOCKOUT_ROUNDS}).
 *
 * Why a dedicated rank instead of the obvious sorts:
 *  • NOT alphabetical — string collation orders the knockout labels "Final, QF, R16, R32, SF", which is
 *    tournament-nonsensical (that was the lineup tab bug).
 *  • NOT by `opens_at` — that column is null until fixtures sync, so an `opens_at ASC, label ASC` order
 *    silently degrades to the alphabetical bug for freshly-seeded periods.
 * The rank is a pure function of the LABEL, so it is correct regardless of when fixtures land.
 */
import { KNOCKOUT_ROUNDS, type KnockoutRound } from "./constants";

/** Group matchdays occupy ranks [1, GROUP_BAND); knockout rounds start at GROUP_BAND. */
const GROUP_BAND = 1000;
/** Unknown / unrecognised labels sort to the very back (stable, never crashes). */
const UNKNOWN_RANK = Number.MAX_SAFE_INTEGER;

const KNOCKOUT_INDEX: Readonly<Record<string, number>> = Object.fromEntries(
  KNOCKOUT_ROUNDS.map((r, i) => [r, i]),
);

/**
 * A monotonic sort rank for a period label in canonical tournament order. Group matchdays "MD<n>" rank by
 * their number (`MD1` → 1, `MD2` → 2, …); knockout rounds rank by their bracket index after every group
 * matchday (`R32` → 1000, `R16` → 1001, … `Final` → 1004). Anything unrecognised ranks last.
 */
export function periodOrderRank(label: string): number {
  const trimmed = label.trim();
  const md = /^MD\s*(\d+)$/i.exec(trimmed);
  if (md) return Number(md[1]);
  const k = KNOCKOUT_INDEX[trimmed as KnockoutRound];
  if (k !== undefined) return GROUP_BAND + k;
  return UNKNOWN_RANK;
}

/** Comparator over period labels in canonical order — `labels.sort(comparePeriodLabels)`. */
export function comparePeriodLabels(a: string, b: string): number {
  return periodOrderRank(a) - periodOrderRank(b);
}

/**
 * Return a NEW array of `items` ordered canonically by each item's period label (does not mutate the
 * input). `labelOf` extracts the label from an item so callers can sort their own period shapes.
 */
export function sortByPeriodOrder<T>(items: readonly T[], labelOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => comparePeriodLabels(labelOf(a), labelOf(b)));
}

/**
 * Select the current scoring period: the first OPEN period (if any), else the earliest PENDING
 * period (by first fixture kickoff) that `isCurrent` considers active, else null.
 *
 * `opensAt` is never populated by the provisioning CLI, so `ORDER BY opens_at ASC` degrades to
 * `label ASC` (alphabetical), which puts "Final" (F) before "Group MD1" (G). This helper avoids
 * that by sorting in JS on `matches[0].kickoffAt` — populated by the schedule sync. Periods with
 * no fixtures sort last (Infinity).
 *
 * `isCurrent` is injected because different screens have different lifecycle semantics:
 *  - Waivers: `p => p.batchClearedAt === null` — the batch has not yet cleared for this period.
 *  - Vs-the-field: `p => now < lastKickoff(p) + MATCH_DURATION_MS` — at least one match is still
 *    live. Using `batchClearedAt` for vsfield would drop the live wave ~6h before first kickoff
 *    (the batch timestamp), showing an empty next period while MD1 matches are being played.
 *
 * `status === "open"` is the fast-path for the wave the hourly `wc-fantasy-period-close` cron has
 * promoted live. That cron (`apps/worker/src/jobs/periodClose.ts`, via
 * `selectPeriodStatusTransitions`) is the SOLE writer of `status === "open"`: it opens each wave —
 * every group matchday AND each knockout round (R16→QF→SF→Final) — once the prior wave's fixtures
 * all reach `completed`, ~1 day before that wave's first kickoff. So this arm is LIVE, not dead.
 * (An earlier version of this comment said `period.status` "stays pending from provision to freeze —
 * the open branch is dead"; that predated the 2026-06-17 `feat/period-status-lifecycle` merge and was
 * wrong. Do not re-derive that premise.)
 */
export function selectCurrentPeriod<
  T extends {
    status: string;
    matches: Array<{ kickoffAt: Date }>;
  },
>(periods: readonly T[], isCurrent: (p: T) => boolean): T | null {
  const sorted = [...periods].sort((a, b) => {
    const aT = a.matches[0]?.kickoffAt.getTime() ?? Infinity;
    const bT = b.matches[0]?.kickoffAt.getTime() ?? Infinity;
    return aT - bT;
  });
  return (
    sorted.find((p) => p.status === "open") ??
    sorted.find((p) => p.status === "pending" && isCurrent(p)) ??
    null
  );
}
