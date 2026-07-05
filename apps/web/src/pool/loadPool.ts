/**
 * Server-side data loader for the /pool pick'em screen (Prompt 42) — the thin owner-bypass Prisma edge
 * that assembles everything `PoolClient` renders (mirrors `loadVsField` / `loadWaivers`). READS ONLY:
 * every pick mutation is a `POST /api/pool/pick` round-trip (Prompt 40 §3) followed by `router.refresh()`.
 * Like the other loaders this IO edge has no unit test (it needs a live DB); `tsc` + the pure `poolView`
 * suite cover the shapes, and a source-contract smoke pins the reveal source.
 *
 * Two pick-read paths, deliberately:
 *   - PICKS VIEW reveal — `store.readVisiblePicks` (own picks ALWAYS + others' ONLY post-kickoff). The
 *     anti-copying time gate lives in that query (Prompt 40 §3), not in RLS (RLS has no clock).
 *   - LEADERBOARD — ALL league picks read directly. Safe: the leaderboard aggregates only COMPLETED
 *     matches (`derivePoolResult` is null otherwise), and completed ⊆ kicked-off ⊆ revealable, so no
 *     unrevealed individual pick is exposed — only per-manager counts.
 *
 * The group↔knockout split + every result derivation key off `period.kind` (NEVER `fifa_match.round`;
 * DECISIONS → Pool). As of Prompt 44 the reused `selectTournamentPhase` ALSO keys on `period.kind`
 * (it no longer takes `round`), so this loader no longer touches `fifa_match.round` at all.
 */
import { prisma } from "@app/db";
import { derivePoolResult, type LeaderboardMatch, type PoolPick } from "@app/pool";
// Playoff phase = playoff_entry EXISTENCE (the atomic twin of league.status='playoff'), reused from the
// FAAB read path — the SAME helper the waivers/dashboard loaders honor. Gates the Picks-tab bracket so
// it renders through the R32 pre-kickoff window, which `selectTournamentPhase` mis-reads as "group".
import { loadPlayoffPhaseActive } from "@app/faab/prisma";
import { selectTournamentPhase } from "@/src/dashboard/selectTournamentPhase";
import { createPrismaPoolPickStore } from "./prismaStore";
import { resolvePoolPeriod } from "./resolvePoolPeriod";
import { selectPoolPicksView, buildPoolLeaderboardView } from "./poolView";
import type { PoolFixture, PoolOtherPick, PoolTeam, PoolView } from "./types";

/** The fifa_match select shared by the fixtures + the leaderboard projection. */
const MATCH_SELECT = {
  id: true,
  status: true,
  kickoffAt: true,
  homeScore: true,
  awayScore: true,
  homeScoreEt: true,
  awayScoreEt: true,
  homeScorePens: true,
  awayScorePens: true,
  period: { select: { kind: true, label: true } },
  // T-3RD: the 3rd-place play-off marker. period_id stays NULL (invisible to lineups/playoffs/guillotine);
  // `resolvePoolPeriod` reads this flag to synthesize a knockout_round/"3P" period for the pool engine.
  isThirdPlace: true,
  homeTeam: { select: { name: true, country: true } },
  awayTeam: { select: { name: true, country: true } },
} as const;

function team(t: { name: string; country: string | null } | null): PoolTeam | null {
  // code = the raw country value for the flag resolver, falling back to the name (which IS the country
  // for a World Cup side, e.g. "England") so the resolver / home-nation SVG path can still fire.
  return t ? { name: t.name, code: t.country ?? t.name } : null;
}

export async function loadPool(viewerManagerId: string): Promise<PoolView | null> {
  const manager = await prisma.manager.findUnique({
    where: { id: viewerManagerId },
    // league.timezone (T15-6): read-only display input for the client's kickoff labels — the shared
    // formatter renders the league-local wall clock with a real EDT/EST label (never a hardcoded zone).
    select: { id: true, leagueId: true, league: { select: { timezone: true } } },
  });
  if (!manager) return null;
  const leagueId = manager.leagueId;
  const timezone = manager.league?.timezone ?? "UTC";

  const store = createPrismaPoolPickStore(prisma);
  const now = new Date();

  const [matchRows, managerRows, visiblePicks, allPickRows, playoffActive] = await Promise.all([
    prisma.fifaMatch.findMany({ select: MATCH_SELECT, orderBy: { kickoffAt: "asc" } }),
    prisma.manager.findMany({
      where: { leagueId },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    // Reveal-gated: own always + others only once their match has kicked off.
    store.readVisiblePicks({ leagueId, managerId: viewerManagerId, now }),
    // Full league picks for the (aggregate-only, completed-match) leaderboard.
    prisma.poolPick.findMany({
      where: { leagueId },
      select: { managerId: true, matchId: true, prediction: true },
    }),
    // Playoff-phase gate for the knockout bracket — playoff_entry existence, NOT `selectTournamentPhase`
    // (which returns "group" through the R32 pre-kickoff window). One count query, league-scoped.
    loadPlayoffPhaseActive(prisma, leagueId),
  ]);

  const nameById = new Map(managerRows.map((m) => [m.id, m.displayName] as const));

  // Per-fixture revealed picks: the viewer's own + every other manager's revealed pick on that match.
  const myPickByMatch = new Map<string, PoolFixture["myPick"]>();
  const othersByMatch = new Map<string, PoolOtherPick[]>();
  for (const p of visiblePicks) {
    if (p.managerId === viewerManagerId) {
      myPickByMatch.set(p.matchId, p.prediction);
    } else {
      const list = othersByMatch.get(p.matchId) ?? [];
      list.push({
        managerId: p.managerId,
        managerName: nameById.get(p.managerId) ?? "Manager",
        prediction: p.prediction,
      });
      othersByMatch.set(p.matchId, list);
    }
  }

  const fixtures: PoolFixture[] = matchRows.map((m) => {
    // T-3RD: synthesize the 3rd-place play-off's knockout_round/"3P" period at the loader boundary so the
    // pure engine sees it as a 2-way knockout (period_id is NULL in the DB); every other fixture passes through.
    const { periodKind, periodLabel } = resolvePoolPeriod(m);
    const result = derivePoolResult({
      status: m.status,
      kickoffAt: m.kickoffAt,
      periodKind,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      homeScoreEt: m.homeScoreEt,
      awayScoreEt: m.awayScoreEt,
      homeScorePens: m.homeScorePens,
      awayScorePens: m.awayScorePens,
    });
    return {
      matchId: m.id,
      home: team(m.homeTeam),
      away: team(m.awayTeam),
      kickoffAt: m.kickoffAt.toISOString(),
      status: m.status,
      periodKind,
      periodLabel,
      result,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      myPick: myPickByMatch.get(m.id) ?? null,
      others: (othersByMatch.get(m.id) ?? []).sort((a, b) =>
        a.managerName < b.managerName ? -1 : a.managerName > b.managerName ? 1 : 0,
      ),
    };
  });

  // Tournament phase is left on the RAW period.kind deliberately: the 3rd-place play-off must NOT influence
  // phase detection (it is a pool-only consolation fixture). Harmless either way — the bracket's real gate is
  // `playoffActive` (playoff_entry existence), and phase only contributes via `phase === "complete"`, which
  // keys on the "Final" label, not on "3P".
  const phase = selectTournamentPhase(
    matchRows.map((m) => ({
      status: m.status,
      periodKind: m.period?.kind ?? null,
      periodLabel: m.period?.label ?? null,
    })),
  );

  // The leaderboard projection: a LeaderboardMatch per fixture (result derivation + canonical label). T-3RD:
  // route through resolvePoolPeriod too — this is a SEPARATE read of period.kind from the fixtures projection,
  // so without it the 3rd-place pick would derive a null result and the +1 would never count.
  const leaderboardMatches: LeaderboardMatch[] = matchRows.map((m) => {
    const { periodKind, periodLabel } = resolvePoolPeriod(m);
    return {
      matchId: m.id,
      status: m.status,
      kickoffAt: m.kickoffAt,
      periodKind,
      periodLabel,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      homeScoreEt: m.homeScoreEt,
      awayScoreEt: m.awayScoreEt,
      homeScorePens: m.homeScorePens,
      awayScorePens: m.awayScorePens,
    };
  });
  const allPicks: PoolPick[] = allPickRows.map((p) => ({
    managerId: p.managerId,
    matchId: p.matchId,
    prediction: p.prediction,
  }));

  return {
    managerId: viewerManagerId,
    phase,
    // `playoffActive` (playoff_entry existence) gates the knockout bracket AND drives the Picks-tab
    // render-layer hide of the group phase (PoolClient); the pure `picks` buckets stay full for the
    // leaderboard drill-in. `now` (same instant as the reveal read) drives the ≥24h Completed cutoff.
    playoffActive,
    picks: selectPoolPicksView(fixtures, phase, now, playoffActive),
    leaderboard: buildPoolLeaderboardView(
      allPicks,
      leaderboardMatches,
      managerRows,
      viewerManagerId,
    ),
    nowIso: now.toISOString(),
    timezone,
  };
}
