/**
 * The typed props the /players SERVER loader (`app/players/loadPlayers.ts`) hands the CLIENT
 * (`PlayersClient.tsx`). The client NEVER touches Prisma — it renders these shapes and is READ-ONLY
 * (no mutations of any kind; acquisition is single-sourced on /waivers via a `?bid=` hand-off). Kept
 * in `src/` so the loader, the client, and the Vitest suite all agree on one contract (mirrors how
 * `src/waivers/types.ts` exposes `WaiversView`).
 *
 * Dates cross the server→client boundary as ISO strings (trivially serialisable + testable).
 */
import type { AcquisitionWindow } from "@app/faab";
import type { Position } from "@app/shared";

/**
 * One player as the full-tournament browser needs him. A structural SUPERSET of the waivers
 * `WvPlayer` (id / name / shortName / position / nation / teamName / kickoffAt / seasonPoints), so the
 * SHARED view-only `FaPlayerCardSheet` consumes a `PlPlayer` directly — plus the browser-only
 * `owner` + `nationAlive`. Every value is REAL (see loadPlayers); nothing is fabricated.
 */
export interface PlPlayer {
  readonly id: string;
  /** Full display name, e.g. "Kylian Mbappé". */
  readonly name: string;
  /** First initial + surname, e.g. "K. Mbappé" — precomputed server-side. */
  readonly shortName: string;
  readonly position: Position;
  /**
   * Nation for the flag/kit chip — the `fifa_team.name` join, NEVER `player.country` (that column is
   * never populated by ingestion; see loadWaivers / loadLineup / loadDraftRoom). null when the player
   * has no linked team.
   */
  readonly nation: string | null;
  /** The player's WC national team name (same source as `nation`; kept for the card header). */
  readonly teamName: string | null;
  /**
   * ISO kickoff of his next still-acquirable fixture — the acquisition-cutoff clock (the SAME
   * `fifa_match.kickoff_at` the FAAB engine reads). null = no upcoming fixture. The client compares
   * this to its live clock to hide the bid trailer once his match starts.
   */
  readonly kickoffAt: string | null;
  /** Season fantasy total (the real `score_player_match` league aggregate); null renders as "—". */
  readonly seasonPoints: number | null;
  /** Derived from `fifa_team.eliminated` (`!eliminated`); a null-team player is treated as alive. */
  readonly nationAlive: boolean;
  /**
   * The owning manager, or null = FREE AGENT (live-unowned: no active `roster_player` row). The
   * manager display NAME is attached SERVER-SIDE (the loadGameDetail / loadPlayoffs.managerNames
   * precedent) — the browser never reads manager rows itself.
   */
  readonly owner: { readonly managerId: string; readonly name: string } | null;
}

/** Everything the /players client needs, assembled server-side. READ-ONLY page-load snapshot. */
export interface PlayersView {
  readonly viewerManagerId: string;
  readonly players: readonly PlPlayer[];
  /**
   * The current period's acquisition-window phase, derived from the SAME `acquisitionWindowState`
   * source loadWaivers uses (never re-derived). Gates the free-agent bid trailer: shown only in
   * `sealed-bid` / `free-agency`. null when no period is live (nothing open).
   */
  readonly windowPhase: AcquisitionWindow | null;
  /** The current period label (e.g. "R16") — the calm closed-window status line names it. */
  readonly windowLabel: string | null;
  /** IANA tz (league-local display of any time). */
  readonly timezone: string;
  /** Server render time (ISO) — seeds the client's live clock so SSR + hydration agree. */
  readonly nowIso: string;
}
