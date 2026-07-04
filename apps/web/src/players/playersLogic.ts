/**
 * The PURE view-logic behind the /players browser — no React, no IO, no `Date.now()` baked in (the
 * caller passes `now`, so it is deterministic + unit-testable). Mirrors the `waiversLogic` pattern:
 * the client renders, these functions decide WHAT it renders (filter → sort → page → trailer).
 *
 * Filters are AND-composed; each is exported alone so the suite can pin it in isolation. The list is
 * NEVER re-derived from a second source — the loader hands one `PlPlayer[]` snapshot and everything
 * here is a pure transform of it.
 */
import type { AcquisitionWindow } from "@app/faab";
import type { Position } from "@app/shared";
import type { PlPlayer } from "./types";

/** The availability segment (design's AvailabilityFilter chips). */
export type Availability = "all" | "fa" | "rostered" | "mine";
/** The position segment (design's PositionSegmented). */
export type PosFilter = "ALL" | Position;
/** Sort direction on the season-points column (default desc; the SortControl toggles). */
export type SortDir = "desc" | "asc";

/** The full filter state the toolbar owns. */
export interface PlayersFilter {
  readonly query: string;
  readonly position: PosFilter;
  readonly availability: Availability;
  readonly nation: string | "ALL";
  /** The Active-teams toggle: when true, eliminated-nation players are collapsed away. */
  readonly activeTeamsOnly: boolean;
}

export const DEFAULT_PLAYERS_FILTER: PlayersFilter = {
  query: "",
  position: "ALL",
  availability: "all",
  nation: "ALL",
  activeTeamsOnly: false,
};

/** The paged-reveal page size (design: "Load 25 more", never the full ~1,200-row wall). */
export const PLAYERS_PAGE_SIZE = 25;

// ── participant scoping (PLAYERS-DATA-scope) ──────────────────────────────────────────────────
// The /players pool is scoped to WC PARTICIPANTS. The ONLY reliable participant signal is the
// fifa_match SCHEDULE: a team is in the tournament IFF it appears as home OR away in a fixture.
// `group_id` is NULL for every fifa_team row, and `eliminated` only marks knocked-out teams — so
// "not eliminated" wrongly reads as "in the tournament" for the non-WC nations the roster feed also
// carries. See loadPlayers / DECISIONS. These two pure helpers are the loader's scoping seam; they
// are unit-pinned (a synthetic non-participant player is excluded) so the code path is proven even
// though — on today's data — every player already sits on a scheduled team (the guard is a no-op).

/** The WC-participant team-id set: every team that appears as a home OR away FK in the fifa_match
 *  schedule (nulls skipped, deduped). The predicate reads schedule FKs, NOT group_id or eliminated. */
export function participantTeamIds(
  matches: readonly { homeTeamId: string | null; awayTeamId: string | null }[],
): Set<string> {
  const set = new Set<string>();
  for (const m of matches) {
    if (m.homeTeamId) set.add(m.homeTeamId);
    if (m.awayTeamId) set.add(m.awayTeamId);
  }
  return set;
}

/** Scope a player list to tournament participants: keep only players whose team is in the schedule
 *  participant set. A player with NO team, or a team absent from the schedule, is EXCLUDED. Pure +
 *  non-mutating; generic over the loader's row shape (only `teamId` is read). */
export function scopeToParticipants<T extends { teamId: string | null }>(
  players: readonly T[],
  participants: ReadonlySet<string>,
): T[] {
  return players.filter((p) => p.teamId !== null && participants.has(p.teamId));
}

// ── single-filter predicates (each pinned alone) ──────────────────────────────────────────────

/** Case-insensitive substring match on the full display name (empty query ⇒ always true). */
export function matchesSearch(p: PlPlayer, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === "" || p.name.toLowerCase().includes(q);
}

/** Position segment ("ALL" ⇒ always true). */
export function matchesPosition(p: PlPlayer, position: PosFilter): boolean {
  return position === "ALL" || p.position === position;
}

/**
 * Availability segment, from the viewer's vantage:
 *   all       — every player
 *   fa        — free agents only (no active roster row)
 *   rostered  — owned by ANY manager
 *   mine      — owned by the VIEWER
 */
export function matchesAvailability(
  p: PlPlayer,
  availability: Availability,
  viewerManagerId: string,
): boolean {
  switch (availability) {
    case "all":
      return true;
    case "fa":
      return p.owner === null;
    case "rostered":
      return p.owner !== null;
    case "mine":
      return p.owner?.managerId === viewerManagerId;
  }
}

/** Nation filter ("ALL" ⇒ always true; matches the `fifa_team.name` token). */
export function matchesNation(p: PlPlayer, nation: string | "ALL"): boolean {
  return nation === "ALL" || p.nation === nation;
}

/** Active-teams toggle: when on, eliminated-nation players are excluded. */
export function matchesActiveTeams(p: PlPlayer, activeTeamsOnly: boolean): boolean {
  return !activeTeamsOnly || p.nationAlive;
}

// ── composition, sort, paging ─────────────────────────────────────────────────────────────────

/** AND-compose every filter. Pure over its inputs. */
export function filterPlayers(
  players: readonly PlPlayer[],
  filter: PlayersFilter,
  viewerManagerId: string,
): PlPlayer[] {
  return players.filter(
    (p) =>
      matchesSearch(p, filter.query) &&
      matchesPosition(p, filter.position) &&
      matchesAvailability(p, filter.availability, viewerManagerId) &&
      matchesNation(p, filter.nation) &&
      matchesActiveTeams(p, filter.activeTeamsOnly),
  );
}

/**
 * Sort by season points (default DESC), NULLS ALWAYS LAST in either direction (a player with no
 * recorded points sinks to the bottom, never floats to the top of an asc sort), with a stable
 * name tiebreak so the order is deterministic. Non-mutating.
 */
export function sortPlayers(players: readonly PlPlayer[], dir: SortDir = "desc"): PlPlayer[] {
  return [...players].sort((a, b) => {
    const av = a.seasonPoints;
    const bv = b.seasonPoints;
    if (av === null && bv === null) return a.name.localeCompare(b.name);
    if (av === null) return 1; // nulls last
    if (bv === null) return -1;
    const cmp = dir === "desc" ? bv - av : av - bv;
    return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
  });
}

/** The distinct nations present in a pool, sorted — the source for the collapsible NationFilter
 *  chips (mirrors how the draft/waivers pools derive their `nations` list). Skips null-nation. */
export function playersNations(players: readonly PlPlayer[]): string[] {
  const set = new Set<string>();
  for (const p of players) if (p.nation) set.add(p.nation);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** The paged reveal: the FIRST `page` pages (1-indexed) of `size` rows each. `page=1` ⇒ first 25. */
export function pageSlice(
  players: readonly PlPlayer[],
  page: number,
  size: number = PLAYERS_PAGE_SIZE,
): PlPlayer[] {
  const count = Math.max(0, page) * size;
  return players.slice(0, count);
}

// ── bid trailer (the ONLY acquisition affordance — a hand-off, not a write) ─────────────────────

/** True when the player's acquisition cutoff has passed (his match kicked off at/under `now`). */
export function isCutoffPassed(p: PlPlayer, now: Date): boolean {
  if (p.kickoffAt === null) return false;
  return new Date(p.kickoffAt).getTime() <= now.getTime();
}

/** True when the acquisition window is OPEN (sealed-bid or free-agency). */
export function isWindowOpen(phase: AcquisitionWindow | null): boolean {
  return phase === "sealed-bid" || phase === "free-agency";
}

/**
 * Whether a row shows the "Place bid" trailer: FREE AGENT ∧ nation ALIVE ∧ cutoff NOT passed ∧
 * window OPEN. Every clause matters — an eliminated-team player can't be added (the add-side
 * eliminated gate), a kicked-off player is past his cutoff, and a closed window offers no claim.
 * The trailer only NAVIGATES to /waivers?bid=; it never writes.
 */
export function shouldShowBidTrailer(
  p: PlPlayer,
  phase: AcquisitionWindow | null,
  now: Date,
): boolean {
  return p.owner === null && p.nationAlive && !isCutoffPassed(p, now) && isWindowOpen(phase);
}

// ── empty-state helper ─────────────────────────────────────────────────────────────────────────

/** Human labels for the active (non-default) filters — the empty state names what's excluding
 *  everything so the "Clear filters" offer is legible (design frame 5). */
export function activeFilterLabels(filter: PlayersFilter): string[] {
  const labels: string[] = [];
  if (filter.query.trim() !== "") labels.push(`“${filter.query.trim()}”`);
  if (filter.position !== "ALL") labels.push(filter.position);
  if (filter.availability !== "all") {
    labels.push(
      filter.availability === "fa"
        ? "Free agents"
        : filter.availability === "rostered"
          ? "Rostered"
          : "Your team",
    );
  }
  if (filter.nation !== "ALL") labels.push(filter.nation);
  if (filter.activeTeamsOnly) labels.push("Active teams only");
  return labels;
}
