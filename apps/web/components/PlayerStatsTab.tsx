"use client";

/**
 * The SHARED, period-less Stats body for the player card (extracted from `PlayerScoreSheet` in
 * Prompt 56 so the standalone Free Agents / Waivers card can reuse it without duplicating either the
 * fetch or the render).
 *
 *  • `usePlayerTournamentStats(playerId)` — the eager tournament-stats fetch (GET
 *    /api/player-tournament-stats), keyed by player only (period-independent). Fires on mount, so the
 *    Stats tab is hot the instant it's switched to. Returns `{ stats, loading, error }`; a fetch
 *    failure degrades to `error` (never throws), so the host card never breaks.
 *  • `<PlayerStatsTab/>` — the position-aware tiles + tournament game log, rendered into the design's
 *    `.pc-*` markup. Purely presentational over the hook's three values.
 *
 * Consumed by BOTH `PlayerScoreSheet` (vsfield + lineup) and `FaPlayerCardSheet` (waivers). The move
 * is behaviour-preserving: the fetch URL, the null-safe `.pc-*` markup, and the quiet loading/error
 * states are byte-identical to the pre-extraction `PlayerScoreSheet` Stats branch.
 */
import { useEffect, useState } from "react";
import { Flag } from "@/app/draft/Flag";
import type {
  PlayerTournamentStats,
  PlayerTournamentGame,
} from "@/src/playerTournamentStats/buildPlayerTournamentStats";

export interface PlayerTournamentStatsState {
  stats: PlayerTournamentStats | null;
  loading: boolean;
  error: boolean;
}

/**
 * Eager + parallel tournament-stats fetch (keyed by player only). Identical to the
 * `PlayerScoreSheet` Stats `useEffect` it replaced — fires on mount so switching to Stats is instant,
 * and never blocks/affects the Points tab.
 */
export function usePlayerTournamentStats(playerId: string): PlayerTournamentStatsState {
  const [stats, setStats] = useState<PlayerTournamentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setStats(null);
    fetch(`/api/player-tournament-stats?playerId=${encodeURIComponent(playerId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: PlayerTournamentStats) => {
        if (!cancelled) {
          setStats(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return { stats, loading, error };
}

/**
 * The Stats tab body — position-aware tiles + tournament game log, in the design's `.pc-*` markup.
 * Degrades quietly (a quiet inline message) while loading or on a fetch error; it never throws and
 * never affects the Points tab.
 */
export function PlayerStatsTab({
  loading,
  error,
  stats,
}: {
  loading: boolean;
  error: boolean;
  stats: PlayerTournamentStats | null;
}) {
  if (loading) {
    return (
      <div className="pc-stats">
        <div className="pc-foot" style={{ margin: "2px 0 0" }}>
          Loading stats…
        </div>
      </div>
    );
  }
  if (error || !stats) {
    return (
      <div className="pc-stats">
        <div className="pc-foot" style={{ margin: "2px 0 0" }}>
          Couldn&apos;t load stats.
        </div>
      </div>
    );
  }

  const { tiles, games } = stats;
  return (
    <div className="pc-stats">
      <div className="pc-tiles">
        {tiles.map((tile) => (
          <div key={tile.key} className={"pc-tile" + (tile.key === "points" ? " pc-tile-pts" : "")}>
            <b className="mono">{tile.value}</b>
            <span>{tile.label}</span>
          </div>
        ))}
      </div>

      <div className="pc-loghead t-label">Completed matches · this matchday is live in Points</div>
      <div className="pc-log">
        {games.length === 0 ? (
          <div className="pc-foot" style={{ margin: "2px 0 0" }}>
            No completed matches yet.
          </div>
        ) : (
          games.map((game, i) => <GameRow key={i} game={game} />)
        )}
      </div>
      <div className="pc-foot">Tournament to date</div>
    </div>
  );
}

/** One completed-match row in the Stats game log. A null line cell renders "—"; a genuine 0 is
 *  omitted (the design's compact statline), so unknown data is never shown as a misleading zero. */
function GameRow({ game }: { game: PlayerTournamentGame }) {
  const iso2 = game.opponentIso2;
  const ptsClass = "pc-lpts mono" + (game.points < 0 ? " is-neg" : "");
  return (
    <div className="pc-lrow">
      <div className="pc-lrow-top">
        <span className="pc-md mono">{game.periodLabel}</span>
        <span className="pc-opp">
          <span className="pc-vs">{game.isHome ? "vs" : "@"}</span>
          {iso2 && <Flag code={iso2} label={game.opponentTeamName} />}
          <b>{game.opponentTeamName}</b>
        </span>
        {game.result && <span className={"wld wld-" + game.result}>{game.result}</span>}
        {game.scoreline && <span className="pc-score mono">{game.scoreline}</span>}
        <span className={ptsClass}>
          {game.points >= 0 ? "+" : ""}
          {game.points}
        </span>
      </div>
      <div className="pc-statline">
        <span className="pc-min mono">{game.minutes === null ? "—" : `${game.minutes}'`}</span>
        {game.lines.map((line) =>
          line.value === null ? (
            <span className="pc-stat" key={line.key}>
              <b className="mono">—</b>
              {line.label}
            </span>
          ) : line.value !== 0 ? (
            <span className="pc-stat" key={line.key}>
              <b className="mono">{line.value}</b>
              {line.label}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}
