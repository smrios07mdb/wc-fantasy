/**
 * buildVsField — the PURE "vs the field" view-model (ARCHITECTURE.md §5).
 *
 * Reuses the Prompt-04 pairwise helper (`comparePeriodPairwise` / `periodRecords` from
 * `@app/recompute`) for the provisional all-play-all record + per-opponent H2H — the locked W/L
 * rule (W = strictly outscored, L = strictly outscored-by, tie = NEITHER; Theme C) is consumed,
 * never re-derived. Every input is injected; no IO, clock, or env (see purity.test.ts).
 */
import {
  comparePeriodPairwise,
  periodRecords,
  type ManagerPeriodPoints,
  type PairwiseOutcome,
} from "@app/recompute";
import type { MatchStatus } from "@app/shared";
import type {
  BuildVsFieldInput,
  FieldEntry,
  H2HVsViewer,
  MatchView,
  ProvisionalRecord,
  SeasonEntry,
  SeasonPeriodChip,
  StarterState,
  StarterView,
  StillToCome,
  VsFieldView,
} from "./types";

const MINUTE_MS = 60_000;

/** Stable id ordering for deterministic tiebreaks (mirrors @app/recompute's cmpId). */
const cmpId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Map a starter's match status to his live display state + his mutually-exclusive count bucket.
 *
 * TODO(confirm): the "still to come" bucket boundary against §5. We treat `scheduled` as
 * yet-to-play (the headline "to play" count), `in_progress` as playing, `completed` as played, and
 * postponed/abandoned/unresolved (null team or no fixture) as `noMatch`. `lineup_slot.locked_at` is
 * carried per starter for node display but is NOT the bucket signal — §5 says the count derives from
 * "the status of each starter's match". Revisit once live data shows how in-progress vs
 * not-yet-appeared should split (lock-on-play can leave an in-progress starter still unplayed).
 */
function classifyStarter(status: MatchStatus | undefined): {
  state: StarterState;
  bucket: keyof StillToCome;
} {
  switch (status) {
    case "scheduled":
      return { state: "yet-to-play", bucket: "yetToPlay" };
    case "in_progress":
      return { state: "playing", bucket: "playing" };
    case "completed":
      return { state: "played", bucket: "played" };
    // postponed | abandoned | undefined (no team link / no fixture this period)
    default:
      return { state: "yet-to-play", bucket: "noMatch" };
  }
}

export function buildVsField(input: BuildVsFieldInput): VsFieldView {
  const hasPeriod = input.currentPeriod !== null;

  // A team plays exactly one match per matchday → team id resolves to one fixture's status.
  const statusByTeam = new Map<string, MatchStatus>();
  for (const m of input.matchStatuses) {
    if (m.homeTeamId) statusByTeam.set(m.homeTeamId, m.status);
    if (m.awayTeamId) statusByTeam.set(m.awayTeamId, m.status);
  }

  const scoreByManager = new Map(
    input.currentPeriodScores.map((s) => [s.managerId, s.points] as const),
  );
  const lineupByManager = new Map(
    input.lineupsForPeriod.map((l) => [l.managerId, l.starters] as const),
  );

  // The full field the all-play-all helper compares over: EVERY manager, missing → 0 (inactive
  // managers are a free win for everyone strictly above — no special case; Theme C, and the explicit
  // Prompt-11 inactive-0 requirement). NOTE (reconciliation caveat): the persisted `standing` is
  // computed by the recompute sweeper over only the managers that actually have a
  // `score_manager_period` row that period (it does not materialize 0 rows for inactive members), so a
  // fully-inactive manager's LIVE field record here (padded to 0) can differ from that period's
  // contribution to the season `standing`. Aligning the two means the sweeper writing 0 rows per
  // member — a recompute/standings-layer change, out of this prompt's scope (no signature churn). The
  // live field intentionally follows the prompt's inactive-0 rule; the season view reads `standing`.
  const fullScores: ManagerPeriodPoints[] = hasPeriod
    ? input.managers.map((m) => ({
        managerId: m.managerId,
        points: scoreByManager.get(m.managerId) ?? 0,
      }))
    : [];

  const recordByManager = new Map(
    (hasPeriod ? periodRecords(fullScores) : []).map((r) => [r.managerId, r] as const),
  );

  // The viewer's directed outcome vs each opponent (filter the helper, do not re-derive).
  const viewerVsOpponent = new Map<string, PairwiseOutcome>();
  if (hasPeriod) {
    for (const o of comparePeriodPairwise(fullScores)) {
      if (o.managerId === input.viewerManagerId) viewerVsOpponent.set(o.opponentId, o);
    }
  }
  const opponents = hasPeriod ? Math.max(0, input.managers.length - 1) : 0;

  const field: FieldEntry[] = input.managers.map((m) => {
    const rec = recordByManager.get(m.managerId);
    const w = rec?.w ?? 0;
    const l = rec?.l ?? 0;
    const record: ProvisionalRecord = { w, l, d: Math.max(0, opponents - w - l) };

    const counts: StillToCome = { yetToPlay: 0, playing: 0, played: 0, noMatch: 0 };
    const starters: StarterView[] = (lineupByManager.get(m.managerId) ?? []).map((s) => {
      const { state, bucket } = classifyStarter(s.teamId ? statusByTeam.get(s.teamId) : undefined);
      counts[bucket] += 1;
      return { playerId: s.playerId, role: s.role, state, locked: s.locked };
    });

    const isMe = m.managerId === input.viewerManagerId;
    let h2hVsViewer: H2HVsViewer | null = null;
    if (!isMe) {
      const o = viewerVsOpponent.get(m.managerId);
      if (o) {
        h2hVsViewer = {
          result: o.result,
          points: o.points,
          opponentPoints: o.opponentPoints,
          margin: o.points - o.opponentPoints,
        };
      }
    }

    return {
      managerId: m.managerId,
      displayName: m.displayName,
      isMe,
      rank: 0,
      points: scoreByManager.get(m.managerId) ?? 0,
      record,
      starters,
      counts,
      h2hVsViewer,
    };
  });
  // Current-period order: running score desc, then a stable id tiebreak.
  field.sort((a, b) => b.points - a.points || cmpId(a.managerId, b.managerId));
  field.forEach((e, i) => {
    e.rank = i + 1;
  });

  // Season view: W/L/points/seed come from the authoritative `standing` rows; the per-period chips
  // (+ win%) enrich from perPeriodScores when supplied.
  const standingByManager = new Map(input.standings.map((s) => [s.managerId, s] as const));
  const perPeriod = (input.perPeriodScores ?? []).map((p) => ({
    periodId: p.periodId,
    byManager: new Map(periodRecords(p.scores).map((r) => [r.managerId, r] as const)),
  }));

  const seasonEntries: SeasonEntry[] = input.managers.map((m) => {
    const st = standingByManager.get(m.managerId);
    const w = st?.allPlayAllW ?? 0;
    const l = st?.allPlayAllL ?? 0;
    const byPeriod: SeasonPeriodChip[] = perPeriod.map((p) => {
      const r = p.byManager.get(m.managerId);
      return { periodId: p.periodId, w: r?.w ?? 0, l: r?.l ?? 0, points: r?.points ?? 0 };
    });
    return {
      managerId: m.managerId,
      displayName: m.displayName,
      isMe: m.managerId === input.viewerManagerId,
      seed: st?.seed ?? null,
      rank: 0,
      allPlayAllW: w,
      allPlayAllL: l,
      totalPoints: st?.totalPoints ?? 0,
      winPct: w + l > 0 ? w / (w + l) : 0,
      byPeriod,
    };
  });
  // Season order: seed asc (unseeded last), then the locked Theme-C tiebreak (W desc, points desc).
  seasonEntries.sort((a, b) => {
    const sa = a.seed ?? Number.POSITIVE_INFINITY;
    const sb = b.seed ?? Number.POSITIVE_INFINITY;
    return (
      sa - sb ||
      b.allPlayAllW - a.allPlayAllW ||
      b.totalPoints - a.totalPoints ||
      cmpId(a.managerId, b.managerId)
    );
  });
  seasonEntries.forEach((e, i) => {
    e.rank = i + 1;
  });

  const matches: MatchView[] = [...input.matchStatuses]
    .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime() || cmpId(a.matchId, b.matchId))
    .map((m) => ({
      matchId: m.matchId,
      homeTeamName: m.homeTeamName,
      awayTeamName: m.awayTeamName,
      status: m.status,
      kickoffAt: m.kickoffAt.toISOString(),
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      startsInMinutes:
        m.status === "scheduled"
          ? Math.round((m.kickoffAt.getTime() - input.now.getTime()) / MINUTE_MS)
          : null,
    }));

  return {
    asOf: input.now.toISOString(),
    leagueId: input.leagueId,
    viewerManagerId: input.viewerManagerId,
    currentPeriod: input.currentPeriod,
    field,
    season: seasonEntries,
    matches,
  };
}
