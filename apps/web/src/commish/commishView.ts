/**
 * PURE view model + shapers for the commissioner console (`/commish`). No Prisma, no clock — the loader
 * (apps/web/app/commish/loadCommish.ts) does the IO and calls these to shape the render props, so the
 * mapping is unit-testable without a database. Presentation (colors/glyphs) lives in the components; this
 * file is data only.
 */
import type { Position } from "@app/shared";

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
