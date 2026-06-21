/**
 * Shared pure helpers for the prior-matchday selector (T11) — the SINGLE source for "which periods may a
 * user select to view a prior matchday's stat sheet". Consumed by the lineup, vs-the-field, and waivers
 * loaders so all three agree on the started-set boundary, its canonical order, and read-only-ness.
 *
 * The selectable set is bounded by the EXISTING per-match started predicate — `isPickLocked` on the
 * period's FIRST fixture (@app/pool) — NOT by `period.status` (which stays `"pending"` in prod until the
 * hourly close cron runs, so it is not a reliable started/done signal). It deliberately EXCLUDES any
 * future/unstarted period: a period whose first fixture has not kicked off can never be selected, so a
 * not-yet-locked matchday's lineups can never be revealed via the selector. "Done" (fully completed →
 * strictly read-only) reuses the standings/vsfield wall-clock window (last kickoff + MATCH_DURATION_MS).
 *
 * No new clock predicate is introduced: `isPickLocked` and the MATCH_DURATION_MS window both already exist
 * (`loadVsField` / `loadStandings`), and ordering reuses `sortByPeriodOrder` (@app/shared).
 */
import { isPickLocked } from "@app/pool";
import { sortByPeriodOrder, type MatchStatus } from "@app/shared";

/**
 * Wall-clock window a period's matches stay "underway" after the last scheduled kickoff — mirrors
 * `loadVsField` / `loadStandings` (regulation + extra time). Beyond this the period is treated as done.
 */
export const MATCH_DURATION_MS = 120 * 60 * 1000;

/** The minimal period shape these helpers need: identity + this period's fixtures (kickoff-ascending). */
export interface PeriodForSelect {
  id: string;
  label: string;
  /** This period's fixtures ordered by kickoff ASC. Empty for an unseeded knockout round. */
  matches: { kickoffAt: Date; status: MatchStatus }[];
}

/** A selectable period option for a client selector (one per started period). */
export interface SelectablePeriod {
  id: string;
  label: string;
  /** Underway right now (started AND not yet fully completed). */
  isLive: boolean;
  /** Fully completed → its view is strictly read-only / historical. */
  isDone: boolean;
}

/**
 * Has this period's FIRST fixture kicked off? `isPickLocked` is the canonical per-match started predicate
 * (`now >= kickoffAt || status !== "scheduled"`, @app/pool) — server-time authoritative. A period with no
 * fixtures (e.g. an unseeded knockout round) has not started.
 */
export function periodHasStarted(p: PeriodForSelect, now: Date): boolean {
  const first = p.matches[0];
  if (!first) return false;
  return isPickLocked({ status: first.status, kickoffAt: first.kickoffAt }, now);
}

/**
 * Is this period fully completed (its LAST fixture's match window has elapsed)? → read-only / prior. This
 * is the inverse upper bound of `loadVsField`'s "is the current wave still live" check, so a period the
 * vsfield loader has already advanced past reads as done here.
 */
export function periodIsDone(p: PeriodForSelect, now: Date): boolean {
  const last = p.matches.at(-1);
  if (!last) return false;
  return now.getTime() >= last.kickoffAt.getTime() + MATCH_DURATION_MS;
}

/**
 * The selectable started-set: every period whose first fixture has kicked off (completed priors + the live
 * one), in canonical tournament order (MD1…MD3, R32…Final). Future/unstarted periods are excluded.
 *
 * `alwaysIncludeId` force-keeps one period even if it has not started yet — used for a surface's
 * DEFAULT/current period during the inter-matchday gap (it is already the default view, so including it in
 * the selector reveals nothing new). A genuinely future period is never a surface's default and never
 * started, so it stays excluded.
 */
export function selectableStartedPeriods(
  periods: readonly PeriodForSelect[],
  now: Date,
  alwaysIncludeId?: string | null,
): SelectablePeriod[] {
  const kept = periods.filter((p) => periodHasStarted(p, now) || p.id === alwaysIncludeId);
  return sortByPeriodOrder(kept, (p) => p.label).map((p) => ({
    id: p.id,
    label: p.label,
    isLive: periodHasStarted(p, now) && !periodIsDone(p, now),
    isDone: periodIsDone(p, now),
  }));
}

/**
 * Resolve which period a per-period surface should DISPLAY given an optional caller-requested id. Returns
 * the requested period ONLY when it exists AND has started — a future/unstarted request is rejected so the
 * selector can never surface a not-yet-locked matchday; otherwise it falls back to `defaultId` (the
 * surface's computed current/live period). This is the server-side enforcement of "future never
 * selectable", and it makes the no-request path byte-identical to the pre-T11 default.
 */
export function resolveDisplayedPeriodId(
  periods: readonly PeriodForSelect[],
  requestedId: string | null | undefined,
  defaultId: string | null,
  now: Date,
): string | null {
  if (requestedId) {
    const req = periods.find((p) => p.id === requestedId);
    if (req && periodHasStarted(req, now)) return req.id;
  }
  return defaultId;
}
