"use client";

/**
 * Surface-agnostic player card. A `.pc-seg` tab strip toggles between:
 *   • Points — the per-period score breakdown (GET /api/player-box): grouped scored lines, tracked
 *     context stats, season total, and the opt-in "Bench & forfeit" action. Behaviour UNCHANGED
 *     from before the tab strip landed (Prompt 54).
 *   • Stats  — the player's tournament-to-date game log (GET /api/player-tournament-stats):
 *     position-aware tiles + per-match lines, rendered into the design's `.pc-*` markup.
 *
 * Shared single source — consumed by Set Lineup (with forfeitProps) and Vs-the-Field (info-only,
 * NO forfeitProps). Lives in apps/web/components alongside the other shared UI; each host route
 * supplies the `.sl-sm-*` modal styles, and the `.pc-*` Stats classes live in the global ds.css.
 *
 * Both fetches fire EAGERLY in parallel on open (the Stats tab is hot the instant it's switched to);
 * a Stats fetch failure degrades quietly inside the Stats tab and never affects Points.
 *
 * Auth: league-scoped read — any manager can view any player's card.
 * Server-only data: score_player_match and stat_player_match never flow to the browser directly.
 */
import { useEffect, useState } from "react";
import type { PlayerBoxView, SectionView, ScoreLineView } from "@app/player-box";
import type { Position } from "@app/shared";
import { Flag } from "@/app/draft/Flag";
import { toIso2 } from "@/src/draft/flag";
import type {
  PlayerTournamentStats,
  PlayerTournamentGame,
} from "@/src/playerTournamentStats/buildPlayerTournamentStats";

/** Position badge (ds.css `.pos-*`). Inlined so this shared modal has no route-local dependency. */
function Pos({ position }: { position: Position }) {
  return <span className={`pos pos-${position}`}>{position}</span>;
}

export interface ForfeitProps {
  playerName: string;
  /** Points the player has earned this period; 0 means score row hasn't landed yet. */
  pointsAtStake: number;
  onForfeit: () => void;
}

export interface PlayerScoreSheetProps {
  periodId: string;
  playerId: string;
  onClose: () => void;
  /** Present only for played starters — renders the "Bench & forfeit" action inside the modal. */
  forfeitProps?: ForfeitProps;
}

export function PlayerScoreSheet({
  periodId,
  playerId,
  onClose,
  forfeitProps,
}: PlayerScoreSheetProps) {
  const [tab, setTab] = useState<"points" | "stats">("points");

  // Points tab — the existing per-period breakdown (keyed by period + player).
  const [view, setView] = useState<PlayerBoxView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Stats tab — tournament-to-date game log (keyed by player only; period-independent).
  const [stats, setStats] = useState<PlayerTournamentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setView(null);
    const url = `/api/player-box?periodId=${encodeURIComponent(periodId)}&playerId=${encodeURIComponent(playerId)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: PlayerBoxView) => {
        if (!cancelled) {
          setView(data);
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
  }, [periodId, playerId]);

  // EAGER + PARALLEL: the tournament-stats fetch fires on open alongside the player-box fetch (not
  // lazily on Stats-tab activation), so switching to Stats is instant. It never blocks Points.
  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    setStatsError(false);
    setStats(null);
    fetch(`/api/player-tournament-stats?playerId=${encodeURIComponent(playerId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: PlayerTournamentStats) => {
        if (!cancelled) {
          setStats(data);
          setStatsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatsError(true);
          setStatsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return (
    <div className="sl-forfeit-overlay" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={view ? `${view.header.displayName} — score breakdown` : "Score breakdown"}
        className="sl-scoremodal card"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="btn btn-ghost btn-sm sl-sm-close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        <div className="pc-seg" role="tablist" aria-label="Player card view">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "points"}
            className={"pc-seg-btn" + (tab === "points" ? " is-active" : "")}
            onClick={() => setTab("points")}
          >
            Points
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "stats"}
            className={"pc-seg-btn" + (tab === "stats" ? " is-active" : "")}
            onClick={() => setTab("stats")}
          >
            Stats
          </button>
        </div>

        {tab === "points" ? (
          <>
            {loading && <div className="sl-sm-empty t-sm">Loading…</div>}
            {error && <div className="sl-sm-empty t-sm">Couldn&apos;t load breakdown.</div>}
            {view && <BreakdownBody view={view} />}
            {forfeitProps && <ForfeitSection forfeitProps={forfeitProps} />}
          </>
        ) : (
          <StatsTab loading={statsLoading} error={statsError} stats={stats} />
        )}
      </div>
    </div>
  );
}

function BreakdownBody({ view }: { view: PlayerBoxView }) {
  const { header, state, sections, trackedStats, season } = view;
  const nation = header.nation;
  const iso2 = nation ? toIso2(nation) : null;

  return (
    <>
      {/* ─── Header: pos badge · flag · name · period total ──────────── */}
      <div className="sl-sm-head">
        <Pos position={header.position} />
        {iso2 && <Flag code={iso2} label={nation ?? undefined} />}
        <span className="sl-sm-name">{header.shortName}</span>
        <span className="sl-sm-pts-hero mono">
          {header.periodTotal}
          <small>pts</small>
        </span>
      </div>

      {/* ─── Match context: state pill · fixture ─────────────────────── */}
      {(header.fixture || state !== "no-fixture") && (
        <div className="sl-sm-match">
          <StatePill state={state} />
          {header.fixture && (
            <span className="t-sm text-secondary">
              {header.fixture.homeTeamName} – {header.fixture.awayTeamName}
              {" · "}
              <span className="mono">{header.fixture.minuteLabel}</span>
            </span>
          )}
        </div>
      )}

      {/* ─── Empty states ─────────────────────────────────────────────── */}
      {state === "not-started" && (
        <p className="sl-sm-empty t-sm">
          Hasn&apos;t kicked off yet — no points on the board. Still swappable until his match
          starts.
        </p>
      )}
      {state === "in-progress-no-score" && (
        <p className="sl-sm-empty t-sm">On the pitch — no scoring actions logged yet.</p>
      )}
      {state === "no-fixture" && (
        <p className="sl-sm-empty t-sm text-tertiary">No fixture found for this period.</p>
      )}

      {/* ─── Score breakdown sections ─────────────────────────────────── */}
      {sections.length > 0 && (
        <>
          {sections.map((section) => (
            <SectionBlock key={section.sectionLabel} section={section} />
          ))}
          <div className="sl-sm-total-row">
            <span />
            <span className="t-label text-secondary sl-sm-total-label">Total</span>
            <span className="sl-sm-total-num mono display">{header.periodTotal}</span>
          </div>
        </>
      )}

      {/* ─── Context stats (unscored) ─────────────────────────────────── */}
      {trackedStats.length > 0 && (
        <div className="sl-sm-tracked">
          <span className="sl-sm-tracked-head t-label text-tertiary">Context stats</span>
          {trackedStats.map((row) => (
            <div key={row.label} className="sl-sm-tracked-row">
              <span className="t-sm text-secondary">{row.label}</span>
              <span className="mono text-secondary">{row.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* ─── Season total ─────────────────────────────────────────────── */}
      {season !== null && (
        <div className="sl-sm-season">
          <span className="t-caption text-tertiary">Season total</span>
          <span className="mono t-sm">{season.total} pts</span>
        </div>
      )}
    </>
  );
}

function StatePill({ state }: { state: PlayerBoxView["state"] }) {
  if (state === "not-started") return <span className="pill pill-ytp">To play</span>;
  if (state === "in-progress-no-score" || state === "in-progress")
    return <span className="pill pill-live">On pitch</span>;
  if (state === "played") return <span className="pill pill-locked">Played</span>;
  return null;
}

function SectionBlock({ section }: { section: SectionView }) {
  return (
    <div className="sl-sm-section">
      <span className="sl-sm-section-label t-label text-tertiary">{section.sectionLabel}</span>
      {section.lines.map((line, i) => (
        <LineRow key={`${line.category}-${i}`} line={line} />
      ))}
    </div>
  );
}

function LineRow({ line }: { line: ScoreLineView }) {
  const sign = line.points > 0 ? "+" : "";
  const ptsClass = `sl-sm-row-pts mono${line.points >= 0 ? " is-pos" : " is-neg"}`;
  return (
    <div className="sl-sm-row">
      <span className="sl-sm-tag mono">{line.tag}</span>
      <div className="sl-sm-lbl">
        <span className="t-sm">{line.label}</span>
        {line.detail && <span className="t-caption text-tertiary">{line.detail}</span>}
      </div>
      <span className={ptsClass}>
        {sign}
        {line.points}
      </span>
    </div>
  );
}

function ForfeitSection({ forfeitProps }: { forfeitProps: ForfeitProps }) {
  const ptsText =
    forfeitProps.pointsAtStake > 0 ? `his ${forfeitProps.pointsAtStake} pts` : "his points";
  return (
    <div className="sl-sm-forfeit">
      <p className="sl-sm-forfeit-msg t-sm text-secondary">
        Bench <strong>{forfeitProps.playerName}</strong> — forfeits {ptsText} this period.{" "}
        <em>Final: he can&apos;t return to your XI this period.</em>
      </p>
      <button type="button" className="btn btn-danger btn-sm" onClick={forfeitProps.onForfeit}>
        Bench &amp; forfeit
      </button>
    </div>
  );
}

/**
 * The Stats tab body — position-aware tiles + tournament game log, in the design's `.pc-*` markup.
 * Degrades quietly (a quiet inline message) while loading or on a fetch error; it never throws and
 * never affects the Points tab.
 */
function StatsTab({
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
