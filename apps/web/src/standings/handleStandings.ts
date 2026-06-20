import type { SessionManagerOutcome } from "@app/auth";
import type { StandingsView } from "@app/recompute";

export interface StandingsHandlerResult {
  status: number;
  body: unknown;
}

export interface StandingsHandlerDeps {
  /** Reads the request's Supabase session → the league manager outcome (the edge's IO). */
  resolveManager: () => Promise<SessionManagerOutcome>;
  /** League-scoped WHOLE-FIELD standings load for the resolved viewer; null if the manager is gone. */
  load: (viewerManagerId: string) => Promise<StandingsView | null>;
}

/**
 * The testable orchestration behind `GET /api/standings` (framework-agnostic — returns a plain
 * `{ status, body }`), the snapshot the live screen REFETCHES on a Realtime change-nudge / poll tick.
 * It mirrors `handleVsField` exactly: a LEAGUE-SCOPED read — a member sees the WHOLE field (all-play-
 * all), so there is NO own-manager target and therefore NO `canActAsManager` / 403-not-your-manager
 * step. Identity still gates: no session → 401; not a league member (not-allowlisted / no linked
 * manager) → 403. The session manager is resolved ONLY to populate `meId` inside the snapshot.
 */
export async function handleStandings(deps: StandingsHandlerDeps): Promise<StandingsHandlerResult> {
  const outcome = await deps.resolveManager();
  if (outcome.kind === "no-session") return { status: 401, body: { error: "no_session" } };
  if (outcome.kind === "not-allowlisted")
    return { status: 403, body: { error: "not_allowlisted" } };
  if (outcome.kind === "no-manager") return { status: 403, body: { error: "no_manager" } };

  // Authenticated league member → the whole league's standings. NO canActAsManager (no target manager).
  const view = await deps.load(outcome.manager.id);
  if (!view) return { status: 404, body: { error: "no_standings" } };
  return { status: 200, body: view };
}
