/**
 * Pure view logic for the /pool pick'em screen (Prompt 42) — IO-free, no React, no Prisma, no clock
 * beyond an injected `now` (mirrors `@app/pool` + `selectTournamentPhase`). The loader (`./loadPool.ts`)
 * does the Prisma reads, maps rows into these shapes, and calls these functions; the same functions are
 * unit-tested directly. Three responsibilities:
 *
 *   - selectPoolPicksView : split fixtures into the group matchday lists + the knockout bracket frame.
 *       Group phase shows matchday lists only; knockout phase ALSO renders the fixed R32→Final skeleton
 *       (a round with no seeded fixtures is present but fixture-less — an honest TBD, never a fabricated
 *       matchup; the Guillotine "projected, not invented" principle). The group↔knockout split keys off
 *       `period.kind` (NEVER `fifa_match.round` — DECISIONS → Pool).
 *   - buildPoolLeaderboardView : the pure leaderboard for the screen. Wraps `@app/pool`'s engine
 *       (untouched) and LEFT-JOINS the full league membership, so every member appears — non-pickers
 *       padded to 0/0/0 — ranked points desc → name (the engine itself only emits managers who picked).
 *   - isFixtureLocked : the lock predicate the pick controls disable on (reuses `@app/pool` isPickLocked).
 */
import {
  buildPoolLeaderboard,
  isPickLocked,
  weightForPeriod,
  type LeaderboardMatch,
  type PoolPick,
} from "@app/pool";
import type { TournamentPhase } from "@/src/dashboard/selectTournamentPhase";
import type {
  PoolBracketRound,
  PoolFixture,
  PoolLeaderRow,
  PoolMatchdaySection,
  PoolPicksView,
} from "./types";

/** The fixed knockout bracket frame, left→right. The skeleton is always rendered in knockout phase. */
export const KNOCKOUT_ROUND_ORDER = ["R32", "R16", "QF", "SF", "Final"] as const;

/** Stable id ordering — the final deterministic tiebreak (mirrors @app/pool `cmpId`). */
const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Kickoff-ascending sort for fixtures within a section/round. */
function byKickoff(a: PoolFixture, b: PoolFixture): number {
  return cmpStr(a.kickoffAt, b.kickoffAt) || cmpStr(a.matchId, b.matchId);
}

/** Kickoff-descending sort (most recent first) — the Completed archive ordering. */
function byKickoffDesc(a: PoolFixture, b: PoolFixture): number {
  return -byKickoff(a, b);
}

/** A completed group match drops to the Completed bucket once its kickoff is ≥24h in the past. */
const ARCHIVE_AFTER_MS = 24 * 60 * 60 * 1000;
function isArchived(f: PoolFixture, now: Date): boolean {
  return (
    f.status === "completed" && now.getTime() - new Date(f.kickoffAt).getTime() >= ARCHIVE_AFTER_MS
  );
}

/** A pick is locked once kickoff arrives or the match leaves `scheduled` (server time authoritative). */
export function isFixtureLocked(fixture: PoolFixture, now: Date): boolean {
  return isPickLocked({ status: fixture.status, kickoffAt: new Date(fixture.kickoffAt) }, now);
}

/**
 * Split fixtures into the Picks-tab structure. Phase (from the reused P38 `selectTournamentPhase`) gates
 * the bracket: it appears only once the tournament reaches knockout phase. The split is by `period.kind`.
 */
export function selectPoolPicksView(
  fixtures: readonly PoolFixture[],
  phase: TournamentPhase,
  now: Date,
): PoolPicksView {
  // Completed group matches ≥24h old leave their matchday and collect in one bottom archive, so the
  // Picks tab stops accumulating a scroll-tail of finished group fixtures as the tournament advances.
  const allGroupFixtures = fixtures.filter((f) => f.periodKind === "group_md");
  const groupFixtures = allGroupFixtures.filter((f) => !isArchived(f, now));
  const completed = allGroupFixtures
    .filter((f) => isArchived(f, now))
    .slice()
    .sort(byKickoffDesc);
  const knockoutFixtures = fixtures.filter((f) => f.periodKind === "knockout_round");
  const unscheduled = fixtures
    .filter((f) => f.periodKind === null)
    .slice()
    .sort(byKickoff);

  // ── group → matchday sections, keyed by period label, sorted by label then kickoff ──
  // (archived fixtures already removed above; a matchday left empty after filtering is dropped) ──
  const byLabel = new Map<string, PoolFixture[]>();
  for (const f of groupFixtures) {
    const label = f.periodLabel ?? "—";
    const list = byLabel.get(label) ?? [];
    list.push(f);
    byLabel.set(label, list);
  }
  const matchdays: PoolMatchdaySection[] = [...byLabel.entries()]
    .sort(([a], [b]) => cmpStr(a, b))
    .map(([label, list]) => ({ label, fixtures: list.slice().sort(byKickoff) }));

  // ── knockout → the fixed R32→Final skeleton (knockout phase only) ──
  const inKnockoutPhase = phase === "playoff" || phase === "complete";
  let bracket: PoolBracketRound[] = [];
  if (inKnockoutPhase) {
    const koByLabel = new Map<string, PoolFixture[]>();
    for (const f of knockoutFixtures) {
      const label = f.periodLabel ?? "—";
      const list = koByLabel.get(label) ?? [];
      list.push(f);
      koByLabel.set(label, list);
    }
    // The canonical frame — every round present (empty rounds render TBD; never a fabricated matchup).
    bracket = KNOCKOUT_ROUND_ORDER.map((label) => ({
      label,
      fixtures: (koByLabel.get(label) ?? []).slice().sort(byKickoff),
    }));
    koByLabel.delete("—");
    // Defensive: surface any knockout round whose label is outside the canonical set rather than drop it.
    for (const label of [...koByLabel.keys()].sort(cmpStr)) {
      if (!(KNOCKOUT_ROUND_ORDER as readonly string[]).includes(label)) {
        bracket.push({ label, fixtures: koByLabel.get(label)!.slice().sort(byKickoff) });
      }
    }
  }

  return { matchdays, bracket, unscheduled, completed };
}

/**
 * The leaderboard for the screen: the engine's per-manager aggregate LEFT-JOINED onto the full league
 * membership, so every member appears (non-pickers padded to 0/0/0). Ranked points desc → name → id
 * (the engine sorts by id; the screen's contract is points desc → name).
 */
export function buildPoolLeaderboardView(
  picks: PoolPick[],
  matches: LeaderboardMatch[],
  managers: ReadonlyArray<{ id: string; displayName: string }>,
  viewerManagerId: string,
): PoolLeaderRow[] {
  const engine = buildPoolLeaderboard(picks, matches, weightForPeriod);
  const byId = new Map(engine.map((r) => [r.managerId, r] as const));

  return managers
    .map((m): PoolLeaderRow => {
      const agg = byId.get(m.id);
      return {
        managerId: m.id,
        managerName: m.displayName,
        isMe: m.id === viewerManagerId,
        played: agg?.played ?? 0,
        correct: agg?.correct ?? 0,
        points: agg?.points ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        cmpStr(a.managerName, b.managerName) ||
        cmpStr(a.managerId, b.managerId),
    );
}
