"use client";

/**
 * Client shell for the single-match Game Detail screen (T5/T6). Renders the server-assembled
 * {@link GameDetailView} — both squads (starting XI + subs + bench, with subbed-on/off, cards, real stat
 * chips, fantasy points, and a fantasy-owner tag) — and opens the SHARED `<PlayerScoreSheet>` modal
 * (info-only, no forfeit action — like /vsfield) for a player's full breakdown on a row tap.
 *
 * No data fetching here beyond the modal's own `/api/player-box` round-trip (it reuses that verbatim).
 * The whole snapshot comes from `loadGameDetail` (server). Rows are tappable ONLY when the match links to
 * a fantasy period (the modal is period-keyed); with no period the box score still renders, statically.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MatchStatus } from "@app/shared";
import { Flag } from "@/app/draft/Flag";
import { toIso2 } from "@/src/draft/flag";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerScoreSheet } from "@/components/PlayerScoreSheet";
import type { GameDetailView, PlayerLine, SquadSide } from "@/src/games/types";
import "@/src/games/games.css";

function StatusPill({ status }: { status: MatchStatus }) {
  if (status === "in_progress") return <span className="pill pill-live">Live</span>;
  if (status === "completed") return <span className="pill pill-win">FT</span>;
  if (status === "postponed") return <span className="pill">PPD</span>;
  if (status === "abandoned") return <span className="pill">ABN</span>;
  return <span className="pill">Scheduled</span>;
}

/** Yellow/red card glyphs (content imagery, not UI color) + an accessible label. */
function Cards({ yellow, red }: { yellow: number; red: boolean }) {
  if (yellow === 0 && !red) return null;
  return (
    <span className="gd-cards" aria-label={`${yellow} yellow${red ? ", red card" : ""}`}>
      {Array.from({ length: yellow }).map((_, i) => (
        <span key={i} className="gd-card is-yellow" aria-hidden="true" />
      ))}
      {red && <span className="gd-card is-red" aria-hidden="true" />}
    </span>
  );
}

function OwnerTagChip({ owner }: { owner: NonNullable<PlayerLine["owner"]> }) {
  const word =
    owner.state === "started" ? "Started" : owner.state === "benched" ? "Benched" : "Owned";
  const who = owner.isMe ? "You" : owner.managerName;
  return (
    <span className={`gd-owner is-${owner.state}`} title={`${who} — ${word.toLowerCase()}`}>
      <span className="gd-owner-state">{word}</span>
      <span className="gd-owner-mgr">{who}</span>
    </span>
  );
}

function Row({ line, onOpen }: { line: PlayerLine; onOpen: ((playerId: string) => void) | null }) {
  const pts = line.fantasyPoints;
  const ptsCls =
    "gd-pts mono" + (pts === null ? " is-empty" : pts > 0 ? " is-pos" : pts < 0 ? " is-neg" : "");

  const inner = (
    <>
      <PlayerAvatar
        displayName={line.displayName}
        firstName={line.firstName}
        lastName={line.lastName}
        country={line.nation}
        position={line.position}
        size="sm"
      />
      <span className="gd-row-id">
        <span className="gd-row-name">{line.displayName}</span>
        <span className="gd-row-sub">
          <span className={`pos pos-${line.position}`}>{line.position}</span>
          {line.minutes !== null && <span className="gd-min mono">{line.minutes}&apos;</span>}
          {line.cameOnMinute !== null && (
            <span className="gd-sub-in" title="Subbed on">
              ▲{line.cameOnMinute}&apos;
            </span>
          )}
          {line.wentOffMinute !== null && (
            <span className="gd-sub-out" title="Subbed off">
              ▼{line.wentOffMinute}&apos;
            </span>
          )}
          <Cards yellow={line.yellowCards} red={line.redCard} />
        </span>
      </span>

      <span className="gd-row-mid">
        {line.chips.map((c) => (
          <span key={c.label} className="gd-chip mono" title={c.label}>
            <b>{c.value}</b>
            {c.label}
          </span>
        ))}
        {line.owner && <OwnerTagChip owner={line.owner} />}
      </span>

      <span className={ptsCls}>{pts === null ? "—" : pts > 0 ? `+${pts}` : pts}</span>
    </>
  );

  if (onOpen) {
    return (
      <button type="button" className="gd-row is-tappable" onClick={() => onOpen(line.playerId)}>
        {inner}
      </button>
    );
  }
  return <div className="gd-row">{inner}</div>;
}

function Group({
  label,
  lines,
  onOpen,
}: {
  label: string;
  lines: readonly PlayerLine[];
  onOpen: ((playerId: string) => void) | null;
}) {
  if (lines.length === 0) return null;
  return (
    <div className="gd-group">
      <div className="gd-group-head t-label text-tertiary">{label}</div>
      <div className="gd-rows">
        {lines.map((l) => (
          <Row key={l.playerId} line={l} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function Side({ side, onOpen }: { side: SquadSide; onOpen: ((playerId: string) => void) | null }) {
  return (
    <section className="gd-side">
      <header className="gd-side-head">
        <Flag code={toIso2(side.teamCode)} label={side.teamName} />
        <span className="gd-side-name">{side.teamName}</span>
        {side.score !== null && <span className="gd-side-score mono">{side.score}</span>}
      </header>
      {side.starters.length === 0 && side.subs.length === 0 && side.bench.length === 0 ? (
        <p className="gd-side-empty t-sm text-tertiary">No squad announced yet.</p>
      ) : (
        <>
          <Group label="Starting XI" lines={side.starters} onOpen={onOpen} />
          <Group label="Substitutes" lines={side.subs} onOpen={onOpen} />
          <Group label="Bench" lines={side.bench} onOpen={onOpen} />
        </>
      )}
    </section>
  );
}

export function GameDetailClient({ view }: { view: GameDetailView }) {
  const router = useRouter();
  const [boxPlayer, setBoxPlayer] = useState<string | null>(null);
  const { header, home, away, periodId } = view;

  // Tap-to-breakdown only when the match links to a fantasy period (the modal is period-keyed).
  const onOpen = periodId ? (playerId: string) => setBoxPlayer(playerId) : null;

  return (
    <div className="gd-app">
      <button type="button" className="gd-back" onClick={() => router.back()}>
        ‹ Back
      </button>

      <header className="gd-hero card">
        {header.matchdayLabel && (
          <div className="gd-hero-md t-micro text-tertiary">{header.matchdayLabel}</div>
        )}
        <div className="gd-hero-score">
          <div className="gd-hero-team gd-hero-home">
            <Flag code={toIso2(home.teamCode)} label={home.teamName} />
            <span className="gd-hero-name">{home.teamName}</span>
          </div>
          <div className="gd-hero-mid">
            {home.score !== null && away.score !== null ? (
              <span className="gd-hero-num mono display">
                {home.score}
                <span className="gd-hero-dash">–</span>
                {away.score}
              </span>
            ) : (
              <span className="gd-hero-vs">v</span>
            )}
            <StatusPill status={header.status} />
            <span className="t-micro text-tertiary">{header.kickoffLabel}</span>
          </div>
          <div className="gd-hero-team gd-hero-away">
            <Flag code={toIso2(away.teamCode)} label={away.teamName} />
            <span className="gd-hero-name">{away.teamName}</span>
          </div>
        </div>
      </header>

      {!header.hasFantasyOverlay && (
        <p className="gd-note t-sm text-tertiary">
          This match isn’t linked to a fantasy matchday yet — manager ownership isn’t shown.
        </p>
      )}
      {view.unresolvedParticipants > 0 && (
        <p className="gd-note t-sm text-tertiary">
          {view.unresolvedParticipants} player
          {view.unresolvedParticipants === 1 ? "" : "s"} couldn’t be identified and are not listed.
        </p>
      )}

      {view.empty ? (
        <div className="gd-empty card">
          <b>No box score yet</b>
          <span className="t-sm text-tertiary">
            Squads, stats and points appear once the lineup is announced and the match begins.
          </span>
        </div>
      ) : (
        <div className="gd-grid">
          <Side side={home} onOpen={onOpen} />
          <Side side={away} onOpen={onOpen} />
        </div>
      )}

      {boxPlayer && periodId && (
        <PlayerScoreSheet
          periodId={periodId}
          playerId={boxPlayer}
          onClose={() => setBoxPlayer(null)}
        />
      )}
    </div>
  );
}
