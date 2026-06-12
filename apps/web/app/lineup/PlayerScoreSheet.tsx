"use client";

/**
 * Surface-agnostic player score breakdown modal. Fetches GET /api/player-box on open and renders
 * the PlayerBoxView returned by the server: grouped scored lines, tracked context stats, season
 * total. Reusable for Vs-the-Field in a later prompt.
 *
 * Auth: league-scoped read — any manager can view any player's breakdown.
 * Server-only data: score_player_match and stat_player_match never flow to the browser directly.
 */
import { useEffect, useState } from "react";
import type { PlayerBoxView, SectionView, ScoreLineView } from "@app/player-box";
import { Pos } from "./components";
import { Flag } from "../draft/Flag";
import { toIso2 } from "../../src/draft/flag";

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
  const [view, setView] = useState<PlayerBoxView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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

        {loading && <div className="sl-sm-empty t-sm">Loading…</div>}
        {error && <div className="sl-sm-empty t-sm">Couldn&apos;t load breakdown.</div>}
        {view && <BreakdownBody view={view} />}
        {forfeitProps && <ForfeitSection forfeitProps={forfeitProps} />}
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
