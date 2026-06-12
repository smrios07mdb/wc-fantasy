/**
 * Framework-agnostic orchestration behind GET /api/player-box. Returns plain { status, body }.
 * Auth posture mirrors handleVsField (ARCHITECTURE §5): 401 no-session, 403 not-a-league-member,
 * NO 403-not-your-manager — this is a league-scoped read. Any league member can view any player's
 * breakdown (same all-play-all posture as /api/vsfield).
 */
import type { SessionManagerOutcome } from "@app/auth";
import type { PlayerBoxView } from "@app/player-box";

export interface PlayerBoxHandlerResult {
  status: number;
  body: unknown;
}

export interface PlayerBoxHandlerDeps {
  resolveManager: () => Promise<SessionManagerOutcome>;
  load: (
    viewerManagerId: string,
    periodId: string,
    playerId: string,
  ) => Promise<PlayerBoxView | null>;
}

export async function handlePlayerBox(
  deps: PlayerBoxHandlerDeps,
  periodId: string | null,
  playerId: string | null,
): Promise<PlayerBoxHandlerResult> {
  if (!periodId || !playerId) {
    return { status: 400, body: { error: "missing_params" } };
  }

  const outcome = await deps.resolveManager();
  if (outcome.kind === "no-session") return { status: 401, body: { error: "no_session" } };
  if (outcome.kind === "not-allowlisted")
    return { status: 403, body: { error: "not_allowlisted" } };
  if (outcome.kind === "no-manager") return { status: 403, body: { error: "no_manager" } };

  const view = await deps.load(outcome.manager.id, periodId, playerId);
  if (!view) return { status: 404, body: { error: "not_found" } };
  return { status: 200, body: view };
}
