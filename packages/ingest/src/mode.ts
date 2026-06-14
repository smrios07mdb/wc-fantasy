/**
 * PURE scheduler mode-decision (ARCHITECTURE.md §3). A pure function of (matches, now) — the worker
 * supplies the clock. Each tick maps each match to at most one per-match action; idle matches are
 * dropped. Schedule-sync is a global pull handled by the worker on a slow cadence, not here.
 */
export type MatchMode = "pre_match" | "live" | "settle";

export interface ModeMatch {
  bdlId: number;
  status: "scheduled" | "in_progress" | "completed" | "postponed" | "abandoned";
  kickoffMs: number;
  /** Whether a balldontlie rating row already exists (settle stop signal). */
  hasRating: boolean;
  /** Whether the pre-match lineup pull already ran (so pre_match fires ONCE). */
  lineupPulled: boolean;
  /** Whether the pre-KICKOFF availability peek already landed rows (so the T-75 peek stops re-firing).
   *  True once a `match_lineup_entry` exists for the match. ORTHOGONAL to `lineupPulled` (kickoff lock):
   *  the peek writes only the availability snapshot, never a lock. OPTIONAL so the existing
   *  scheduler-mode fixtures stay byte-untouched; an absent value ⇒ not peeked (the peek re-fires).
   *  Production always populates it (the stores derive it from the EXISTS). */
  lineupPeeked?: boolean;
}

export interface MatchAction {
  bdlId: number;
  mode: MatchMode;
}

/** How long after kickoff a not-yet-live match is still eligible for the pre-match lineup pull. */
const PRE_MATCH_GRACE_MS = 30 * 60_000;
/** How long after kickoff a completed match keeps settling while the rating is still missing. */
const SETTLE_MAX_MS = 12 * 60 * 60_000;

export function decideMatchModes(matches: readonly ModeMatch[], now: Date): MatchAction[] {
  const t = now.getTime();
  const out: MatchAction[] = [];
  for (const m of matches) {
    if (m.status === "in_progress") {
      out.push({ bdlId: m.bdlId, mode: "live" });
      continue;
    }
    if (m.status === "scheduled") {
      // At/after kickoff (within grace) and not yet pulled → pull the confirmed XI once.
      if (!m.lineupPulled && t >= m.kickoffMs && t <= m.kickoffMs + PRE_MATCH_GRACE_MS) {
        out.push({ bdlId: m.bdlId, mode: "pre_match" });
      }
      continue;
    }
    if (m.status === "completed") {
      // Keep settling until the rating lands (or we give up after the max window).
      if (!m.hasRating && t <= m.kickoffMs + SETTLE_MAX_MS) {
        out.push({ bdlId: m.bdlId, mode: "settle" });
      }
      continue;
    }
    // postponed / abandoned → idle (schedule-sync keeps status fresh).
  }
  return out;
}

/**
 * True when any fixture's kickoff sits within [now - postMs, now + preMs] — its "match window". The
 * worker tightens schedule-sync to this window so a just-kicked-off match flips to in_progress (and its
 * subs start locking) promptly, instead of waiting for the slow hourly sync (ARCHITECTURE.md §8).
 */
export function anyMatchInLiveWindow(
  matches: readonly ModeMatch[],
  now: Date,
  preMs: number,
  postMs: number,
): boolean {
  const t = now.getTime();
  return matches.some((m) => m.kickoffMs - preMs <= t && t <= m.kickoffMs + postMs);
}

/** Matches in a live window whose last successful live poll is older than `graceMs` (or never). §8. */
export function pollerSilentMatches(
  matches: readonly ModeMatch[],
  lastLivePollByMatch: ReadonlyMap<number, number>,
  now: Date,
  graceMs: number,
): MatchAction[] {
  const t = now.getTime();
  const out: MatchAction[] = [];
  for (const m of matches) {
    if (m.status !== "in_progress") continue;
    const last = lastLivePollByMatch.get(m.bdlId);
    if (last === undefined || t - last > graceMs) out.push({ bdlId: m.bdlId, mode: "live" });
  }
  return out;
}

/**
 * Availability-peek selector (Set Lineup badge). Returns the bdlIds of SCHEDULED matches whose kickoff
 * sits in the pre-kickoff window `[kickoff - leadMs, kickoff)` and that have NOT yet been peeked
 * (`!lineupPeeked`). National-team sheets publish ~75 min out, so the worker pulls `match_lineups` here
 * to persist a Starting / Not-starting snapshot BEFORE kickoff — independent of `decideMatchModes`'
 * `pre_match` arm, which fires only at/after kickoff and is the kickoff LOCK path.
 *
 * This is deliberately a SEPARATE pure fn (alongside `anyMatchInLiveWindow` / `pollerSilentMatches`): it
 * emits NO `pre_match` / `live` / `settle` / lock action — just the ids to peek. It re-fires every tick
 * across the window until entries land (then `lineupPeeked` flips true and it stops), and never fires
 * at/after kickoff (the lower bound is strict `< kickoff`, leaving the at-kickoff XI pull to `pre_match`).
 */
export function matchesNeedingLineupPeek(
  matches: readonly ModeMatch[],
  now: Date,
  leadMs: number,
): number[] {
  const t = now.getTime();
  const out: number[] = [];
  for (const m of matches) {
    if (m.status !== "scheduled") continue;
    if (m.lineupPeeked) continue;
    if (m.kickoffMs - leadMs <= t && t < m.kickoffMs) out.push(m.bdlId);
  }
  return out;
}
