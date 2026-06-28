/**
 * The typed props the pool SERVER loader (`./loadPool.ts`) hands the CLIENT (`./PoolClient.tsx`) — the
 * /pool pick'em screen (Prompt 42). The client NEVER touches Prisma: it renders these shapes and
 * round-trips every pick through the gated `POST /api/pool/pick` (Prompt 40 §3), then `router.refresh()`
 * (form-driven CRUD — NO Realtime, NO polling; the Realtime subscription is Prompt 43). Kept in `src/`
 * so the loader, the client, the pure view logic, and the Vitest suite all agree on ONE contract
 * (mirrors `@/src/waivers/types`).
 *
 * Dates cross the server→client boundary as ISO strings (trivially serialisable + testable without
 * `Date` fixtures); the client seeds a live clock from `nowIso` so a fixture flips to "locked" the
 * instant kickoff passes without a hydration mismatch.
 */
import type { MatchStatus, PeriodKind, PoolPrediction } from "@app/shared";
import type { TournamentPhase } from "@/src/dashboard/selectTournamentPhase";

export type { PoolPrediction } from "@app/shared";

/** One side of a fixture — a World Cup nation. `null` is an undecided (TBD) bracket slot, never invented. */
export interface PoolTeam {
  readonly name: string;
  /** Raw country value (alpha-2 / FIFA-3 / English name) for `<Flag>` + the kit chip; null when unknown. */
  readonly code: string | null;
}

/** Another manager's revealed pick on a fixture (others' picks are revealed ONLY after kickoff — §3). */
export interface PoolOtherPick {
  readonly managerId: string;
  readonly managerName: string;
  readonly prediction: PoolPrediction;
}

/** A fixture as the pick'em screen renders it (a DB-free projection of `fifa_match` + its `period`). */
export interface PoolFixture {
  readonly matchId: string;
  /** Home/away nation; null only inside a TBD bracket slot (which carries no real fixture). */
  readonly home: PoolTeam | null;
  readonly away: PoolTeam | null;
  /** ISO kickoff (UTC) — the lock instant; the client compares it to its live clock. */
  readonly kickoffAt: string;
  readonly status: MatchStatus;
  /** Resolved from `fifa_match.periodId → period.kind` (NEVER `round`); null when the period is unseeded. */
  readonly periodKind: PeriodKind | null;
  /** Canonical `period.label` (MD1…/R32…); null when unseeded. */
  readonly periodLabel: string | null;
  /** Settled 1X2 / advancer result (server-derived via `@app/pool` derivePoolResult); null until scored. */
  readonly result: PoolPrediction | null;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  /** The viewer's OWN pick — always revealed; null if not yet picked. */
  readonly myPick: PoolPrediction | null;
  /** Other managers' picks the server chose to reveal (post-kickoff only). */
  readonly others: readonly PoolOtherPick[];
}

/** Group stage, grouped by matchday label (MD1…MD3). */
export interface PoolMatchdaySection {
  readonly label: string;
  readonly fixtures: readonly PoolFixture[];
}

/**
 * One column of the knockout bracket (R32 → Final). In knockout phase the full five-round frame is always
 * present; a round with no seeded fixtures renders its slot(s) as honest TBD (never a fabricated matchup).
 */
export interface PoolBracketRound {
  readonly label: string;
  readonly fixtures: readonly PoolFixture[];
}

/** The structured Picks tab: group matchday lists + (in knockout phase) the full bracket skeleton. */
export interface PoolPicksView {
  readonly matchdays: readonly PoolMatchdaySection[];
  /** Empty in group phase; the fixed R32→Final frame once the tournament reaches knockout phase. */
  readonly bracket: readonly PoolBracketRound[];
  /** Fixtures whose period isn't linked yet (periodKind null) — shown honestly, never guessed into a phase. */
  readonly unscheduled: readonly PoolFixture[];
  /** Completed group matches ≥24h past kickoff — pulled out of their matchday into a bottom archive (kickoff-desc). */
  readonly completed: readonly PoolFixture[];
}

/** One leaderboard row (ranked points desc → name). All league members appear (non-pickers at 0/0/0). */
export interface PoolLeaderRow {
  readonly managerId: string;
  readonly managerName: string;
  readonly isMe: boolean;
  readonly played: number;
  readonly correct: number;
  readonly points: number;
}

/** Everything the client renders, assembled server-side by `loadPool`. */
export interface PoolView {
  readonly managerId: string;
  /**
   * Tournament phase from the reused P38 `selectTournamentPhase` — frames the page. The knockout bracket
   * NO LONGER gates on this (it returns "group" through the R32 pre-kickoff window); the bracket gates on
   * playoff_entry existence (`playoffActive`) instead — see `selectPoolPicksView` / `loadPool`.
   */
  readonly phase: TournamentPhase;
  /**
   * playoff_entry EXISTENCE (the atomic twin of `league.status='playoff'`) — true from the group→playoff
   * transition onward. Gates the knockout bracket AND drives the Picks-tab render-layer hide of the group
   * phase (group matchday lists / Completed archive / unscheduled). The pure `picks` buckets stay FULL so
   * the leaderboard drill-in keeps every manager's settled history; only the Picks tab hides them.
   */
  readonly playoffActive: boolean;
  readonly picks: PoolPicksView;
  readonly leaderboard: readonly PoolLeaderRow[];
  /** Server render time (ISO) — seeds the client's live clock so SSR + hydration agree (no mismatch). */
  readonly nowIso: string;
}
