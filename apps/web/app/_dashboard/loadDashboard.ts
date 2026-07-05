/**
 * Server-side data loader for the dashboard home — thin IO edge that assembles the phase-aware
 * `DashboardData` the home page hydrates. Reuses `loadDraftRoom` DIRECTLY (no second source, no
 * re-derivation of draft state — the exact same shape that /draft reads). When the draft is
 * complete the loader ALSO:
 *   1. reads a minimal `fifa_match` summary (status + period.kind/label + kickoffAt) to derive the
 *      tournament phase via the pure `selectTournamentPhase` selector (Prompt 38; the group↔knockout
 *      discriminator is `period.kind`, NEVER `fifa_match.round` — Prompt 44),
 *   2. calls `loadVsField` READ-ONLY for the group-phase module data, and
 *   3. in the knockout window (selectTournamentPhase ∈ {playoff, complete}) calls `loadPlayoffs`
 *      READ-ONLY for the playoff/complete module data — the exact mirror of (2). `PlayoffsView.complete`
 *      (champion playoff_entry written) is then the AUTHORITATIVE playoff↔complete render discriminator
 *      via the pure `resolveKnockoutPhase`; the loader writes nothing (no `league.status`).
 *
 * No scoring/engine touch, no RLS bypass beyond the established loader posture.
 *
 * Like the other loaders (loadDraftRoom / loadVsField / loadPlayoffs) this edge has no unit test (it
 * needs a live DB); `tsc` + the pure-selector suites cover the shapes it produces.
 */
import { prisma } from "@app/db";
import { loadDraftRoom } from "../draft/loadDraftRoom";
import { loadVsField } from "../vsfield/loadVsField";
import { loadPlayoffs, type PlayoffsView } from "../playoffs/loadPlayoffs";
import {
  selectDashboardPhase,
  type DashboardPhase,
} from "../../src/dashboard/selectDashboardPhase";
import { selectTournamentPhase } from "../../src/dashboard/selectTournamentPhase";
import { resolveKnockoutPhase } from "../../src/dashboard/resolveKnockoutPhase";
import type { DraftRoomState } from "../../src/draft/types";
import type { VsFieldView } from "@app/vsfield";

export interface DashboardData {
  /** The resolved display phase for this render. */
  phase: DashboardPhase;
  /**
   * The authoritative draft snapshot. Null only when no draft record exists yet (edge case:
   * league provisioned but no draft row written). Pre-draft shows "waiting for commissioner".
   */
  draft: DraftRoomState | null;
  /**
   * Full vs-the-field view — populated for the "group" phase only; null otherwise.
   * Contains: field (current-period field entries), season (standings), matches, currentPeriod.
   */
  vsField: VsFieldView | null;
  /**
   * Full playoff (guillotine) view — populated for the "playoff" and "complete" phases only; null
   * otherwise. The READ-ONLY mirror of `vsField`: the same `PlayoffsView` the /playoffs theater renders
   * (engine + read-model byte-untouched, consumed only). Its `complete` flag is the authoritative
   * playoff↔complete render discriminator (see `resolveKnockoutPhase`).
   */
  playoffs: PlayoffsView | null;
  /**
   * ISO datetime of the earliest scheduled group kickoff — populated for "pre-kickoff" only.
   * Used for the real countdown display in the PrimaryBanner. Null = no fixtures loaded yet.
   */
  earliestGroupKickoff: string | null;
  /**
   * The league's IANA timezone (T15-6) — read-only display input threaded to every dashboard surface
   * that renders an instant (MatchdayModule kickoff times, PrimaryBanner kickoff labels) via the shared
   * `formatInLeagueTz*` formatters. Resolved SERVER-SIDE (never the machine's local zone) so SSR and
   * hydration render identically. Falls back to "UTC" (the waivers-exemplar pattern).
   */
  timezone: string;
}

/**
 * Load the dashboard snapshot for the session manager. Reuses `loadDraftRoom` so the dashboard
 * reads the SAME authoritative data as /draft — no parallel reads, no stale divergence.
 *
 * When the draft is complete, additionally reads `fifa_match` (minimal: status, period.kind/label,
 * kickoffAt) to derive the tournament phase, calls `loadVsField` for the group phase module data, and
 * `loadPlayoffs` for the playoff/complete module data.
 */
export async function loadDashboard(sessionManagerId: string): Promise<DashboardData> {
  // League timezone (T15-6): resolved here — the dashboard's own loader — via the session manager's
  // league, NOT by widening `DraftRoomState` (that shape is the /draft Realtime patch contract; a
  // display-only field doesn't belong on it). One-field read-only select, in parallel with the draft read.
  const [draft, tzRow] = await Promise.all([
    loadDraftRoom(sessionManagerId),
    prisma.manager.findUnique({
      where: { id: sessionManagerId },
      select: { league: { select: { timezone: true } } },
    }),
  ]);
  const timezone = tzRow?.league?.timezone ?? "UTC";

  if (!draft) {
    // No draft row: treat as pre-draft (the draft hasn't been configured yet).
    return {
      phase: "pre-draft",
      draft: null,
      vsField: null,
      playoffs: null,
      earliestGroupKickoff: null,
      timezone,
    };
  }

  const draftPhase = selectDashboardPhase(draft.status);

  // Pre-tournament phases don't need match data — return immediately.
  if (draftPhase !== "post-draft") {
    return {
      phase: draftPhase,
      draft,
      vsField: null,
      playoffs: null,
      earliestGroupKickoff: null,
      timezone,
    };
  }

  // Draft complete — derive tournament phase from fifa_match rows.
  // The match query is READ-ONLY and minimal: status + period.kind/label for phase detection (the
  // group↔knockout discriminator is period.kind, NEVER fifa_match.round — the feed labels group games
  // with the matchday number; Prompt 44), plus kickoffAt for the pre-kickoff countdown (NOT used for
  // phase logic). round is no longer read.
  const matchRows = await prisma.fifaMatch.findMany({
    select: { status: true, kickoffAt: true, period: { select: { kind: true, label: true } } },
  });

  const tournamentPhase = selectTournamentPhase(
    matchRows.map((m) => ({
      status: m.status,
      periodKind: m.period?.kind ?? null,
      periodLabel: m.period?.label ?? null,
    })),
  );

  if (tournamentPhase === "pre-kickoff") {
    // Find the earliest scheduled group kickoff for the real countdown display.
    const earliest = matchRows
      .filter((m) => m.period?.kind === "group_md" && m.status === "scheduled")
      .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime())[0];
    return {
      phase: tournamentPhase,
      draft,
      vsField: null,
      playoffs: null,
      earliestGroupKickoff: earliest?.kickoffAt.toISOString() ?? null,
      timezone,
    };
  }

  if (tournamentPhase === "group") {
    // Load the full vs-the-field snapshot: standings, current-period scores, starters, matches.
    // READ-ONLY — no scoring/engine touch. The same data /vsfield shows.
    const vsField = await loadVsField(sessionManagerId);
    return {
      phase: "group",
      draft,
      vsField,
      playoffs: null,
      earliestGroupKickoff: null,
      timezone,
    };
  }

  // playoff or complete (the knockout window): load the playoff view READ-ONLY — the same PlayoffsView
  // /playoffs renders (engine + read-model untouched). PlayoffsView.complete (champion entry written) is
  // the authoritative playoff↔complete discriminator: the Final match flipping to completed and the
  // worker writing the champion row can briefly disagree, so we never show the complete arm before its
  // champion data exists. The loader writes nothing — league.status routing stays an OPEN decision owned
  // by the worker/state-machine thread (DECISIONS).
  const playoffs = await loadPlayoffs(sessionManagerId);
  const phase = resolveKnockoutPhase(tournamentPhase, playoffs?.complete ?? null);
  return { phase, draft, vsField: null, playoffs, earliestGroupKickoff: null, timezone };
}
