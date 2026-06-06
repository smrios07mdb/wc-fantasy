import type { SessionManagerOutcome } from "@app/auth";
import type { VsFieldView } from "@app/vsfield";

export interface VsFieldHandlerResult {
  status: number;
  body: unknown;
}

export interface VsFieldHandlerDeps {
  /** Reads the request's Supabase session → the league manager outcome (the edge's IO). */
  resolveManager: () => Promise<SessionManagerOutcome>;
  /** League-scoped WHOLE-FIELD load for the resolved viewer (re-reads leagueId); null if no field. */
  load: (viewerManagerId: string) => Promise<VsFieldView | null>;
}

/**
 * The testable orchestration behind `GET /api/vsfield` (framework-agnostic — returns a plain
 * `{ status, body }`). It mirrors the Prompt-07 resolve gate but is a LEAGUE-SCOPED read: a league
 * member sees the WHOLE field (all-play-all), so there is NO own-manager target and therefore NO
 * `canActAsManager` / 403-not-your-manager step (the part of the draft/lineup gate that does NOT apply
 * here). Identity still gates: no session → 401; not a league member (not-allowlisted / no linked
 * manager) → 403 — exactly the resolve layer the lineup/draft routes use.
 */
export async function handleVsField(deps: VsFieldHandlerDeps): Promise<VsFieldHandlerResult> {
  const outcome = await deps.resolveManager();
  if (outcome.kind === "no-session") return { status: 401, body: { error: "no_session" } };
  if (outcome.kind === "not-allowlisted")
    return { status: 403, body: { error: "not_allowlisted" } };
  if (outcome.kind === "no-manager") return { status: 403, body: { error: "no_manager" } };

  // Authenticated league member → the whole league's field. NO canActAsManager (no target manager).
  const view = await deps.load(outcome.manager.id);
  if (!view) return { status: 404, body: { error: "no_field" } };
  return { status: 200, body: view };
}
