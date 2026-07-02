/**
 * PURE view model + shapers for the commissioner console (`/commish`). No Prisma, no clock — the loader
 * (apps/web/app/commish/loadCommish.ts) does the IO and calls these to shape the render props, so the
 * mapping is unit-testable without a database. Presentation (colors/glyphs) lives in the components; this
 * file is data only.
 */
import type { Position } from "@app/shared";
import type { OverridableStatKey } from "@app/recompute";

/** One audit-log row, shaped for the AuditLog component. `whenLabel` is computed SERVER-side from a threaded
 *  `now` so the server and client render the identical relative string (no hydration mismatch). */
export interface CommishAuditView {
  id: string;
  /** CommishActionType, widened to string — a future slice may write a type this build's union predates. */
  actionType: string;
  summary: string;
  detail: string | null;
  reason: string | null;
  delta: string | null;
  reversible: boolean;
  reversed: boolean;
  /** Actor display label (displayName ?? email), or null for a 'system'/automated row. */
  actorLabel: string | null;
  createdAtIso: string;
  whenLabel: string;
}

/** The read-only System-status card: real, cheaply-readable league facts (no live-poller invention). */
export interface CommishSystemStatus {
  managerCount: number;
  periodCount: number;
  frozenPeriodCount: number;
  auditEntryCount: number;
}

/** A league manager, for the ViewAsSwitcher. */
export interface CommishManagerOption {
  managerId: string;
  displayName: string;
  isCommissioner: boolean;
  /** True for the viewing commissioner's own seat (the switcher's "your seat" option). */
  isViewer: boolean;
}

export interface CommishRosterPlayer {
  playerId: string;
  name: string;
  position: Position;
  country: string | null;
  teamName: string | null;
}

/** The read-only view-as inspector for one selected manager. Record/seed are null when standings are
 *  unavailable (no group periods yet). NEVER carries commissioner controls — it is a read-only inspector. */
export interface CommishManagerInspector {
  managerId: string;
  displayName: string;
  isCommissioner: boolean;
  record: { w: number; l: number; d: number; points: number } | null;
  seed: number | null;
  rank: number | null;
  qualified: boolean | null;
  faabBudget: number;
  rosterCount: number;
  roster: CommishRosterPlayer[];
}

/** Thread 2 · Stat-corrections tab — one scoreable match option (label + its fantasy period + freeze state). */
export interface CommishStatMatchOption {
  matchId: string;
  /** "Home vs Away" (team names; "TBD" when a fixture's team is unset). */
  label: string;
  /** The match's fantasy period label ("MD1" / "Round of 16" / …), or null when unlinked. */
  periodLabel: string | null;
  /** The match's period is frozen — a correction here is a commissioner override (surfaced in the panel). */
  periodFrozen: boolean;
  kickoffIso: string;
}

/** One selectable player in the chosen match (both squads). */
export interface CommishStatPlayerOption {
  playerId: string;
  name: string;
  position: Position;
  teamName: string | null;
}

/** The current stored correction state for the selected (match, player) — prefills the forms. */
export interface CommishStatCurrent {
  penaltyWon: number;
  penaltyCommitted: number;
  penaltyReason: string | null;
  /** The resolved rating + source AS SCORED (a manual override wins over balldontlie). */
  resolvedRating: number | null;
  resolvedRatingSource: string | null;
  /** A manual override row currently exists (so "Clear override" is meaningful). */
  hasManualRating: boolean;
  periodFrozen: boolean;
  /** 2b — the raw FEED value per overridable field (null when the column is null); the editor shows these
   *  as the "current" baseline. Absent keys render as "—". */
  feedStats: Partial<Record<OverridableStatKey, number | null>>;
  /** 2b — the current stored commissioner overlay (prefills the override inputs). */
  statOverrides: Partial<Record<OverridableStatKey, number>>;
  /** 2b — whether a feed `stat_player_match` row exists at all (drives the "no feed data yet → pending" hint). */
  hasStatRow: boolean;
}

/** 2b — one overridable stat field's display metadata (label + section), ordered for the editor. The `key`
 *  set mirrors `OVERRIDABLE_STAT_KEYS` (@app/recompute) — the allowlist-integrity test guards that set. */
export interface CommishStatFieldMeta {
  key: OverridableStatKey;
  label: string;
  group: string;
  /** Roles for which this line actually scores; a value entered for another role is a points no-op (hinted). */
  scoresFor: "all" | "outfield" | "gk";
}

export const STAT_FIELD_META: readonly CommishStatFieldMeta[] = [
  { key: "minutesPlayed", label: "Minutes", group: "Appearance", scoresFor: "all" },
  { key: "goals", label: "Goals", group: "Attacking", scoresFor: "all" },
  { key: "assists", label: "Assists", group: "Attacking", scoresFor: "all" },
  { key: "shotsOnTarget", label: "Shots on target", group: "Attacking", scoresFor: "all" },
  { key: "bigChancesCreated", label: "Big chances created", group: "Attacking", scoresFor: "all" },
  { key: "keyPasses", label: "Key passes", group: "Attacking", scoresFor: "all" },
  { key: "crossesAccurate", label: "Accurate crosses", group: "Attacking", scoresFor: "all" },
  { key: "dribblesCompleted", label: "Dribbles completed", group: "Possession", scoresFor: "all" },
  { key: "passesAccurate", label: "Accurate passes", group: "Possession", scoresFor: "all" },
  { key: "longBallsAccurate", label: "Accurate long balls", group: "Possession", scoresFor: "all" },
  { key: "touches", label: "Touches", group: "Possession", scoresFor: "all" },
  { key: "possessionLost", label: "Possession lost", group: "Possession", scoresFor: "all" },
  { key: "duelsWon", label: "Duels won", group: "Possession", scoresFor: "all" },
  { key: "wasFouled", label: "Fouls won", group: "Possession", scoresFor: "all" },
  { key: "clearances", label: "Clearances", group: "Defending", scoresFor: "outfield" },
  { key: "blockedShots", label: "Blocks", group: "Defending", scoresFor: "outfield" },
  { key: "interceptions", label: "Interceptions", group: "Defending", scoresFor: "outfield" },
  { key: "tacklesWon", label: "Tackles won", group: "Defending", scoresFor: "outfield" },
  { key: "ballRecoveries", label: "Ball recoveries", group: "Defending", scoresFor: "outfield" },
  { key: "saves", label: "Saves", group: "Goalkeeping", scoresFor: "gk" },
  { key: "savesInsideBox", label: "Saves inside box", group: "Goalkeeping", scoresFor: "gk" },
  { key: "punches", label: "Punches", group: "Goalkeeping", scoresFor: "gk" },
  { key: "highClaims", label: "High claims", group: "Goalkeeping", scoresFor: "gk" },
];

/** The Stat-corrections tab's data: the match picker, the (match-scoped) player picker, and the current state.
 *  Selection is URL-driven (`?match=&player=`) so it survives refresh; the write forms POST + `router.refresh`. */
export interface CommishStatCorrectionsView {
  matches: CommishStatMatchOption[];
  selectedMatchId: string | null;
  selectedPlayerId: string | null;
  players: CommishStatPlayerOption[];
  current: CommishStatCurrent | null;
}

export interface CommishConsoleView {
  leagueId: string;
  leagueName: string;
  /** The viewing commissioner's display name (for the ribbon/"your seat"). */
  commissionerName: string;
  status: CommishSystemStatus;
  audit: CommishAuditView[];
  managers: CommishManagerOption[];
  /** Present only when a valid `?as=<managerId>` (in this league) is selected. */
  inspector: CommishManagerInspector | null;
  /** Thread 2 Stat-corrections tab data (matches empty while inspecting a manager via `?as=`). */
  statCorrections: CommishStatCorrectionsView;
}

// ── pure shapers ──────────────────────────────────────────────────────────────────────────────────

/** A short "x ago" label from two instants (ms). Server-computed so it's mismatch-free; it does not tick. */
export function formatAgo(fromIso: string, now: Date): string {
  const from = new Date(fromIso).getTime();
  const deltaMs = now.getTime() - from;
  if (!Number.isFinite(from)) return "";
  if (deltaMs < 60_000) return "just now";
  const min = Math.floor(deltaMs / 60_000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Raw audit row (with its actor relation) → the AuditLog view row. */
export function toAuditView(
  row: {
    id: string;
    actionType: string;
    summary: string;
    detail: string | null;
    reason: string | null;
    delta: string | null;
    reversible: boolean;
    reversedAt: Date | null;
    createdAt: Date;
    actor: { displayName: string | null; email: string } | null;
  },
  now: Date,
): CommishAuditView {
  const createdAtIso = row.createdAt.toISOString();
  return {
    id: row.id,
    actionType: row.actionType,
    summary: row.summary,
    detail: row.detail,
    reason: row.reason,
    delta: row.delta,
    reversible: row.reversible,
    reversed: row.reversedAt != null,
    actorLabel: row.actor ? (row.actor.displayName ?? row.actor.email) : null,
    createdAtIso,
    whenLabel: formatAgo(createdAtIso, now),
  };
}

/** Assemble the read-only inspector from the selected manager's option + standings row + budget + roster. */
export function toInspector(
  option: CommishManagerOption,
  standingsRow: {
    w: number;
    l: number;
    d: number;
    points: number;
    seed: number | null;
    rank: number;
    qualified: boolean;
  } | null,
  faabBudget: number,
  roster: CommishRosterPlayer[],
): CommishManagerInspector {
  return {
    managerId: option.managerId,
    displayName: option.displayName,
    isCommissioner: option.isCommissioner,
    record: standingsRow
      ? { w: standingsRow.w, l: standingsRow.l, d: standingsRow.d, points: standingsRow.points }
      : null,
    seed: standingsRow ? standingsRow.seed : null,
    rank: standingsRow ? standingsRow.rank : null,
    qualified: standingsRow ? standingsRow.qualified : null,
    faabBudget,
    rosterCount: roster.length,
    roster,
  };
}
