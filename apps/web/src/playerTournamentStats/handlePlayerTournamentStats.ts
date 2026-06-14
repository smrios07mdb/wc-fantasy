/**
 * Framework-agnostic orchestration behind GET /api/player-tournament-stats. Returns plain
 * { status, body }. Auth posture is IDENTICAL to handlePlayerBox (league-scoped read): 401 no
 * session, 403 not-a-league-member, NO 403-not-your-manager — any league member can view any
 * player's tournament stats (same all-play-all visibility).
 *
 * Player-scoped only: the sole param is playerId (no periodId). Tournament stats are
 * period-independent.
 */
import type { SessionManagerOutcome } from "@app/auth";
import type { PlayerTournamentStats } from "@/src/playerTournamentStats/buildPlayerTournamentStats";

export interface PlayerTournamentStatsHandlerResult {
  status: number;
  body: unknown;
}

export interface PlayerTournamentStatsHandlerDeps {
  resolveManager: () => Promise<SessionManagerOutcome>;
  load: (playerId: string) => Promise<PlayerTournamentStats | null>;
}

export async function handlePlayerTournamentStats(
  deps: PlayerTournamentStatsHandlerDeps,
  playerId: string | null,
): Promise<PlayerTournamentStatsHandlerResult> {
  if (!playerId) {
    return { status: 400, body: { error: "missing_params" } };
  }

  const outcome = await deps.resolveManager();
  if (outcome.kind === "no-session") return { status: 401, body: { error: "no_session" } };
  if (outcome.kind === "not-allowlisted")
    return { status: 403, body: { error: "not_allowlisted" } };
  if (outcome.kind === "no-manager") return { status: 403, body: { error: "no_manager" } };

  const view = await deps.load(playerId);
  if (!view) return { status: 404, body: { error: "not_found" } };
  return { status: 200, body: view };
}
