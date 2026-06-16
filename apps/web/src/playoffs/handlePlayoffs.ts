import type { SessionManagerOutcome } from "@app/auth";
import type { PlayoffsView } from "@/app/playoffs/loadPlayoffs";

export interface PlayoffsHandlerResult {
  status: number;
  body: unknown;
}

export interface PlayoffsHandlerDeps {
  /** Reads the request's Supabase session → the league manager outcome (the edge's IO). */
  resolveManager: () => Promise<SessionManagerOutcome>;
  /** League-scoped WHOLE-FIELD playoff load for the resolved viewer; null when there is no playoff yet. */
  load: (viewerManagerId: string) => Promise<PlayoffsView | null>;
}

/**
 * The testable orchestration behind `GET /api/playoffs` (framework-agnostic — returns a plain
 * `{ status, body }`), the snapshot the live screen REFETCHES on a Realtime change-nudge / poll tick. It
 * mirrors `handleVsField` exactly: a LEAGUE-SCOPED read — a member sees the WHOLE guillotine field, so
 * there is NO own-manager target and therefore NO `canActAsManager` / 403-not-your-manager step. Identity
 * still gates: no session → 401; not a league member (not-allowlisted / no linked manager) → 403. The
 * session manager is resolved ONLY to populate `me` inside the snapshot. A null load (no knockout
 * ladder/seeded field yet — pre-playoff) → 404; the page renders the pre-playoff state on the SSR null.
 */
export async function handlePlayoffs(deps: PlayoffsHandlerDeps): Promise<PlayoffsHandlerResult> {
  const outcome = await deps.resolveManager();
  if (outcome.kind === "no-session") return { status: 401, body: { error: "no_session" } };
  if (outcome.kind === "not-allowlisted")
    return { status: 403, body: { error: "not_allowlisted" } };
  if (outcome.kind === "no-manager") return { status: 403, body: { error: "no_manager" } };

  // Authenticated league member → the whole league's guillotine field. NO canActAsManager (no target).
  const view = await deps.load(outcome.manager.id);
  if (!view) return { status: 404, body: { error: "no_playoffs" } };
  return { status: 200, body: view };
}
