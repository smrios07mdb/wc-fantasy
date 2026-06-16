/**
 * Server-side data loader for the playoff (guillotine) screen — the thin owner-bypass Prisma edge that
 * gathers the rows and hands them to the PURE `buildPlayoffsView` (@app/recompute), mirroring
 * `loadVsField` / `loadWaivers` / `loadPool`. READS ONLY: the playoff ladder is a derived projection of
 * `playoff_entry` + `score_manager_period` + the knockout `period` rows — this loader writes NOTHING (no
 * status flip, no `league.status`, no recompute). The `league.status → complete` routing is still an OPEN
 * decision OWNED BY THE SCREENS THREAD (DECISIONS → Playoff per-round cut application → Scope); here we only
 * DERIVE "complete" from the data (every round cut + a `champion` entry).
 *
 * The pure builder houses all classification/derivation (past | live | future + the provisional cut via the
 * SAME `resolveRoundCut` the apply path calls); this edge only fetches + threads the two REUSED reads —
 * the viewer's reduced playoff XI (`loadLineup`, mode-selected by `period.kind = knockout_round`) and the
 * FAAB reinforcement state (`loadWaivers`: the reset-$100 budget + carried claims). Neither is reimplemented.
 *
 * Like the other loaders this IO edge has no unit test (it needs a live DB); `tsc` + the pure
 * `buildPlayoffsView` suite cover the shapes, a source-contract smoke pins the reuse sites, and a gated
 * real-Postgres test pins the reads end-to-end.
 */
import { prisma } from "@app/db";
import { buildPlayoffsView, type PlayoffsViewCore } from "@app/recompute";
import { loadCumulativeTournamentTotals } from "@app/recompute/prisma";
import { KNOCKOUT_ROUNDS, type KnockoutRound } from "@app/shared";
import { loadLineup } from "../lineup/loadLineup";
import { loadWaivers } from "../waivers/loadWaivers";
import type { SetLineupState } from "../../src/lineup/types";
import type { WaiversView } from "../../src/waivers/types";

/** The full §21 view — the pure core + the two REUSED reads the loader attaches (§21 under-specified
 *  their exact shape as "from @app/lineup" / "from @app/faab"; realized as the existing loaders' outputs). */
export type PlayoffsView = PlayoffsViewCore & {
  managerId: string;
  /** The viewer's reduced (7+2) playoff XI reference — `loadLineup`'s output (null if no squad/window). */
  reducedLineup: SetLineupState | null;
  /** The FAAB reinforcement surface (reset-$100 budget, carried claims, waiver order) — `loadWaivers`'s. */
  reinforcement: WaiversView | null;
};

export async function loadPlayoffs(viewerManagerId: string): Promise<PlayoffsView | null> {
  const manager = await prisma.manager.findUnique({
    where: { id: viewerManagerId },
    select: { id: true, leagueId: true },
  });
  if (!manager) return null;
  const leagueId = manager.leagueId;

  // The knockout ladder, the group periods (→ final standings), and the seeded field.
  const [knockoutPeriods, groupPeriodRows, entries] = await Promise.all([
    prisma.period.findMany({
      where: { leagueId, kind: "knockout_round" },
      select: { id: true, label: true, cutCount: true },
    }),
    prisma.period.findMany({
      where: { leagueId, kind: "group_md" },
      select: { id: true },
    }),
    prisma.playoffEntry.findMany({
      where: { leagueId },
      select: { managerId: true, seed: true, status: true, eliminatedRound: true },
    }),
  ]);

  // No knockout ladder, or no seeded field yet → there is no playoff read surface (the page renders the
  // non-playoff state). Mirrors `loadLineup` returning null when there is nothing to set.
  if (knockoutPeriods.length === 0 || entries.length === 0) return null;

  // Order the ladder by the canonical KNOCKOUT_ROUNDS index — the loader owns this ordering; the pure
  // builder treats the given order as authoritative (and never imports @app/shared).
  const orderIdx = (label: string): number => {
    const i = KNOCKOUT_ROUNDS.indexOf(label as KnockoutRound);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const orderedRounds = [...knockoutPeriods].sort((a, b) => orderIdx(a.label) - orderIdx(b.label));

  const participantIds = entries.map((e) => e.managerId);
  const knockoutIds = orderedRounds.map((p) => p.id);
  const labelByPeriodId = new Map(orderedRounds.map((p) => [p.id, p.label] as const));
  const groupIds = groupPeriodRows.map((p) => p.id);

  const [knockoutScores, groupScores, cumulativeTotals] = await Promise.all([
    // Each knockout round's per-manager score (0 where no row).
    knockoutIds.length
      ? prisma.scoreManagerPeriod.findMany({
          where: { periodId: { in: knockoutIds }, managerId: { in: participantIds } },
          select: { periodId: true, managerId: true, points: true },
        })
      : [],
    // The group periods' scores → final group standings (gW/gL/gPts) via the pure `computeStandings`.
    groupIds.length
      ? prisma.scoreManagerPeriod.findMany({
          where: { periodId: { in: groupIds } },
          select: { periodId: true, managerId: true, points: true },
        })
      : [],
    // Cumulative tournament total (the live boundary tiebreak): Σ points over ALL the league's periods, via
    // the SINGLE canonical helper the WRITE path (`advanceStore.loadRoundContext`) shares — so the displayed
    // "facing-the-blade" zone and the eventual `commish:advance` cut use one derivation and cannot drift.
    loadCumulativeTournamentTotals(prisma, leagueId, participantIds),
  ]);

  // roundScores: roundLabel → managerId → points.
  const roundScores: Record<string, Record<string, number>> = {};
  for (const s of knockoutScores) {
    const label = labelByPeriodId.get(s.periodId);
    if (!label) continue;
    (roundScores[label] ??= {})[s.managerId] = s.points;
  }

  // groupPeriods: one `PeriodScores` per group period for `computeStandings`.
  const groupScoresByPeriod = new Map<string, { managerId: string; points: number }[]>();
  for (const s of groupScores) {
    const list = groupScoresByPeriod.get(s.periodId) ?? [];
    list.push({ managerId: s.managerId, points: s.points });
    groupScoresByPeriod.set(s.periodId, list);
  }
  const groupPeriods = groupIds.map((id) => ({
    periodId: id,
    scores: groupScoresByPeriod.get(id) ?? [],
  }));

  // The two REUSED reads — the viewer's reduced playoff XI + the FAAB reinforcement state. Threaded
  // verbatim (no reimplementation); they are pass-throughs the builder never sees.
  const [reducedLineup, reinforcement] = await Promise.all([
    loadLineup(viewerManagerId),
    loadWaivers(viewerManagerId),
  ]);

  const core = buildPlayoffsView({
    viewerManagerId,
    rounds: orderedRounds.map((p) => ({ label: p.label, cutCount: p.cutCount })),
    entries: entries.map((e) => ({
      managerId: e.managerId,
      seed: e.seed,
      status: e.status,
      eliminatedRound: e.eliminatedRound,
    })),
    roundScores,
    cumulativeTotals,
    groupPeriods,
  });

  return { managerId: viewerManagerId, ...core, reducedLineup, reinforcement };
}
