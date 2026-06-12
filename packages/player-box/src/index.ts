/**
 * @app/player-box — the PURE player box-score view-model.
 *
 * `buildPlayerBox` transforms injected DB rows (score_player_match, stat_player_match, player
 * identity, fixture) into the display model the PlayerScoreSheet modal renders. No IO.
 * The IO edge lives in apps/web (GET /api/player-box + the client fetch-on-open).
 */
export * from "./types";
export { buildPlayerBox } from "./buildPlayerBox";
