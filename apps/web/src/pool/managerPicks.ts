/**
 * Pure projection for the "click a manager on the leaderboard → see their picks" drill-in (T4).
 * IO-free, no React, no Prisma, no clock — it RE-PROJECTS the already-loaded `PoolView` by manager.
 *
 * THE REVEAL GATE IS INHERITED, NOT RE-IMPLEMENTED. Every per-manager prediction in `PoolView` lives in
 * `fixture.myPick` (the viewer's own — always revealed) and `fixture.others[*]` (other managers' picks the
 * server chose to reveal — ONLY for matches past kickoff; the Prompt 40 §3 anti-copying read in
 * `store.readVisiblePicks`). `loadPool` builds those two fields SOLELY from that gated read. So this
 * function reads only what the gate already exposed: a not-yet-kicked-off pick of ANOTHER manager is simply
 * absent from `fixture.others`, so it can never appear here. There is NO new read path — opening the panel
 * does not fetch, query, or hit `/api`; it derives entirely from the props the server already handed down.
 *
 * Self vs others is the only branch:
 *   - viewer (managerId === view.managerId) → their pick is `fixture.myPick` (own picks always revealed,
 *     including pre-kickoff — the viewer is allowed to see their own predictions before lock).
 *   - any other manager → their pick is the `fixture.others` entry for that managerId, if the server
 *     revealed one; absence means "not yet revealed" (pre-kickoff) and is rendered as nothing.
 */
import type { MatchStatus, PoolPrediction } from "@app/shared";
import type { PoolFixture, PoolPicksView, PoolTeam, PoolView } from "./types";

/** Grading of a revealed pick once (and only once) the match result has settled. */
export type PickOutcome = "correct" | "wrong" | "pending";

/** One revealed pick by the selected manager, projected for the drill-in panel. */
export interface ManagerPickRow {
  readonly matchId: string;
  readonly home: PoolTeam | null;
  readonly away: PoolTeam | null;
  readonly kickoffAt: string;
  readonly status: MatchStatus;
  readonly periodLabel: string | null;
  /** The manager's revealed prediction on this match (the gate guarantees it is revealable). */
  readonly prediction: PoolPrediction;
  /** Settled 1X2 / advancer result; null until the match is scored. */
  readonly result: PoolPrediction | null;
  /** correct/wrong once `result` is in; "pending" while the match is unscored. */
  readonly outcome: PickOutcome;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
}

/** Everything the drill-in panel renders for one manager — all derived from the already-gated view. */
export interface ManagerPicksView {
  readonly managerId: string;
  readonly managerName: string;
  readonly isMe: boolean;
  /** Revealed picks, chronological (kickoff asc); empty when the manager has nothing revealed yet. */
  readonly rows: readonly ManagerPickRow[];
}

const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Every real fixture across the Picks-tab structure, INCLUDING the Completed archive (a manager's
 * settled group picks must still be reachable from the drill-in). Distinct from `poolLive`'s
 * `flattenPickFixtures`, which intentionally omits `completed` (the reveal clock only walks future
 * kickoffs); this projection wants the full history.
 */
function allFixtures(picks: PoolPicksView): PoolFixture[] {
  return [
    ...picks.matchdays.flatMap((s) => s.fixtures),
    ...picks.bracket.flatMap((r) => r.fixtures),
    ...picks.unscheduled,
    ...picks.completed,
  ];
}

/** Resolve the manager's display name from the leaderboard rows (left-joined → every member present). */
function nameOf(view: PoolView, managerId: string): string {
  return view.leaderboard.find((r) => r.managerId === managerId)?.managerName ?? "Manager";
}

function gradeOutcome(prediction: PoolPrediction, result: PoolPrediction | null): PickOutcome {
  if (result === null) return "pending";
  return result === prediction ? "correct" : "wrong";
}

/**
 * Project the already-loaded `view` into the selected manager's REVEALED picks. For the viewer this is
 * every match where they have a `myPick`; for any other manager it is every match where the server
 * revealed their pick (`fixture.others`). Pre-kickoff picks of OTHER managers are not in the view, so
 * they are never surfaced — the anti-copying gate is enforced upstream and simply inherited here.
 */
export function selectManagerPicks(view: PoolView, managerId: string): ManagerPicksView {
  // `isViewer` is the SINGLE source of truth for both the data branch (myPick vs others) AND the
  // displayed owner (title), so the picks shown can never diverge from whose name labels them. The
  // leaderboard supplies only the display name.
  const isViewer = managerId === view.managerId;
  const managerName = nameOf(view, managerId);

  const rows: ManagerPickRow[] = [];
  for (const f of allFixtures(view.picks)) {
    const prediction: PoolPrediction | null = isViewer
      ? f.myPick
      : (f.others.find((o) => o.managerId === managerId)?.prediction ?? null);
    if (prediction === null) continue; // no revealed pick on this match → not shown
    rows.push({
      matchId: f.matchId,
      home: f.home,
      away: f.away,
      kickoffAt: f.kickoffAt,
      status: f.status,
      periodLabel: f.periodLabel,
      prediction,
      result: f.result,
      outcome: gradeOutcome(prediction, f.result),
      homeScore: f.homeScore,
      awayScore: f.awayScore,
    });
  }
  rows.sort((a, b) => cmpStr(a.kickoffAt, b.kickoffAt) || cmpStr(a.matchId, b.matchId));

  return { managerId, managerName, isMe: isViewer, rows };
}
