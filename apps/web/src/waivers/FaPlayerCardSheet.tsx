"use client";
/**
 * The standalone, VIEW-ONLY player card for the Free Agents / Waivers surface (Prompt 56). The shared
 * `PlayerScoreSheet` Points tab is hard-wired to a per-period `/api/player-box` read (vsfield + lineup
 * have a live period); the waivers surface has no such period context, so it gets its OWN chrome here —
 * the design's self-contained `.pc-scrim`/`.pc-sheet` standalone card (`FaPlayerCard` /
 * `design/.../playercard.jsx` `PlayerCard`), whose "Points" tab is a light per-surface OVERVIEW rather
 * than a per-period breakdown.
 *
 *  • Points  = a `.pc-ovr` overview built from REAL `WvPlayer` fields ONLY — Season points + the
 *    Acquisition cutoff (`CutoffTag`). The design's "Projected next" row is DROPPED: `WvPlayer` has no
 *    `proj` field and we never fabricate one (same posture as Prompt 54 dropping the synthetic game-log).
 *  • Stats   = the SHARED `<PlayerStatsTab/>` body fed by `usePlayerTournamentStats(player.id)` — the
 *    exact period-less tournament game log the shared sheet renders. Eager fetch on open; a fetch error
 *    degrades quietly inside the body and never breaks the card.
 *
 * Strictly informational: NO acquire CTA, NO add/drop, NO mutation. Acquisition stays on the existing
 * right-panel select→submit (`FreeAgentPanel` / `BidComposer`), which this card never touches.
 */
import { useState } from "react";
import type { WvPlayer } from "./types";
import { CutoffTag, IconStar, NationFlag, Pos } from "./components";
import { PlayerStatsTab, usePlayerTournamentStats } from "@/components/PlayerStatsTab";

export function FaPlayerCardSheet({
  player,
  now,
  watched = false,
  onClose,
  onToggleStar,
  footNote = "View only · acquire from the Free Agents panel.",
}: {
  player: WvPlayer;
  /** The client's live clock — drives the Acquisition `CutoffTag` (no separate ticker). */
  now: Date;
  /** Whether the viewer has starred this player (T2 — private watchlist). Ignored without
   *  `onToggleStar`. */
  watched?: boolean;
  onClose: () => void;
  /** Toggle the private star from the card header. OPTIONAL (PLAYERS-1): the read-only /players
   *  browser consumes this same card with NO star — the watchlist toggle is a write, and /players
   *  ships zero write paths. Omitted ⇒ the star button is not rendered; /waivers passes it exactly
   *  as before, so its card is unchanged. */
  onToggleStar?: (player: WvPlayer) => void;
  /** The Points-tab foot line. Defaults to the /waivers copy verbatim; /players overrides it with
   *  its own hand-off copy. */
  footNote?: string;
}) {
  const [tab, setTab] = useState<"points" | "stats">("points");
  // Eager on mount — the Stats tab is hot the instant it's selected; a failure degrades quietly.
  const { stats, loading, error } = usePlayerTournamentStats(player.id);

  return (
    <div
      className="pc-scrim"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Player card"
    >
      <div className="pc-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="pc-x" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">✕</span>
        </button>

        {/* ─── Header: pos · flag · name/team · season-points hero ─────────────── */}
        <div className="pc-head">
          <Pos p={player.position} />
          <NationFlag nation={player.nation} />
          <div className="pc-headid">
            <b>{player.shortName}</b>
            <span className="t-micro text-tertiary">
              {player.teamName ?? player.nation ?? "Free agent"}
            </span>
          </div>
          {player.seasonPoints !== null && (
            <span className="pc-headtotal mono">
              {player.seasonPoints}
              <small>pts</small>
            </span>
          )}
          {onToggleStar && (
            <button
              type="button"
              className={"pc-star" + (watched ? " is-on" : "")}
              onClick={() => onToggleStar(player)}
              aria-pressed={watched}
              aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
              title={watched ? "Remove from watchlist" : "Add to watchlist"}
            >
              <IconStar filled={watched} />
            </button>
          )}
        </div>

        {/* ─── Tab strip: Points | Stats (default Points, per the shared card) ──── */}
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

        <div className="pc-body">
          {tab === "points" ? (
            <div className="pc-ovr">
              <div className="pc-ovr-row">
                <span className="t-label">Season points</span>
                <b className="mono" style={{ fontSize: 15 }}>
                  {player.seasonPoints === null ? "—" : player.seasonPoints}
                </b>
              </div>
              <div className="pc-ovr-row">
                <span className="t-label">Acquisition</span>
                {player.kickoffAt === null ? (
                  <span className="t-sm text-tertiary">No upcoming fixture</span>
                ) : (
                  <CutoffTag player={player} now={now} />
                )}
              </div>
            </div>
          ) : (
            <PlayerStatsTab loading={loading} error={error} stats={stats} />
          )}
        </div>

        {tab === "points" && <div className="pc-foot">{footNote}</div>}
      </div>
    </div>
  );
}
