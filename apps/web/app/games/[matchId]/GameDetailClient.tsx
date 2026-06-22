"use client";

/**
 * Client shell for the single-match Game Detail screen — re-skinned to the match-detail design handoff
 * (T16). Renders the server-assembled {@link GameDetailView} as: a Sofascore-style SCOREBOARD (teams /
 * kit crests / score that turns live-red in progress / status pill / matchday + kickoff labels), a
 * FANTASY exposure line, the personal YOUR-XI stake strip, then a tab bar over LINEUPS (formation pitch
 * with flag-kit jersey tokens + enriched team lists), STATISTICS (T17 — home-vs-away team comparison
 * bars; shown only when the feed has posted team stats), and RATINGS (podium + fantasy-MVP banner +
 * ranked board). Every player carries the two clearly-separated lenses the product is about: the 0–10
 * RATING square (real match) and the FANTASY points + owner tag (league).
 *
 * VISUAL re-skin only: the loader/`buildGameDetail` contract is reused verbatim except the two approved
 * read-only additive reads (per-player `rating` [T16]; per-team `statistics` [T17], display-only). The
 * Events / Standings tabs are still out of scope (the data isn't loaded — see BACKLOG / T16b / T18). The
 * per-player drill-down reuses the SHARED `<PlayerScoreSheet>` modal unchanged (info-only, like
 * /vsfield), opened on a token / row / chip / podium tap — but ONLY when the match links to a fantasy
 * period (the modal is period-keyed). No data fetching here beyond that modal's own `/api/player-box`
 * round-trip.
 */
import { Fragment, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { MatchStatus } from "@app/shared";
import { Flag } from "@/app/draft/Flag";
import { toIso2 } from "@/src/draft/flag";
import { kitOf } from "@/app/vsfield/kitOf";
import { PlayerScoreSheet } from "@/components/PlayerScoreSheet";
import type {
  GameDetailView,
  GameStatistics,
  GameStatRow,
  OwnerTag,
  PlayerLine,
  SquadSide,
  StatFormat,
} from "@/src/games/types";
import { pitchRows } from "@/src/games/pitchRows";
import "@/src/games/games.css";

type Tab = "lineups" | "statistics" | "ratings";
type OpenFn = ((playerId: string) => void) | null;

// ─── name + rating helpers (pure, presentational) ──────────────────────────────────

/** "F. Surname" on the compact surfaces (token, stake chip, podium); falls back to the display name. */
function shortName(l: PlayerLine): string {
  if (l.firstName && l.lastName) return `${l.firstName[0]}. ${l.lastName}`;
  return l.lastName ?? l.displayName;
}
/** "First Last" on the lineup / ratings rows; falls back to the display name. */
function fullName(l: PlayerLine): string {
  if (l.firstName && l.lastName) return `${l.firstName} ${l.lastName}`;
  return l.displayName;
}
/** Initials for the kit disc (last-name initial, else first char of the display name). */
function discInitial(l: PlayerLine): string {
  return (l.lastName ?? l.firstName ?? l.displayName).charAt(0).toUpperCase();
}
/** Up to two initials for a manager avatar. */
function managerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  if (parts.length <= 1) return (first.slice(0, 2) || "?").toUpperCase();
  const second = parts[1] ?? "";
  return ((first[0] ?? "") + (second[0] ?? "")).toUpperCase();
}

/** Rating colour scale (handoff §Design tokens) — content data-viz colours, like the flag/kit imagery. */
function ratingColor(r: number): string {
  if (r >= 8.0) return "#1F9E63";
  if (r >= 7.0) return "#46A05A";
  if (r >= 6.5) return "#7C9B3E";
  if (r >= 6.0) return "#C7913A";
  return "#D2544F";
}
/** A "real return" (goal/assist) makes the fantasy chip POP; baseline appearance stays muted. */
function hasReturn(l: PlayerLine): boolean {
  return l.chips.some((c) => c.label === "G" || c.label === "A");
}

// ─── derived strips (mirror the design selectors, over the loader's view) ───────────

function allLines(view: GameDetailView): PlayerLine[] {
  const { home, away } = view;
  return [
    ...home.starters,
    ...home.subs,
    ...home.bench,
    ...away.starters,
    ...away.subs,
    ...away.bench,
  ];
}

/** League exposure: distinct managers who FIELDED a player here (started/benched) + the split. */
function exposureOf(view: GameDetailView): { managers: number; started: number; benched: number } {
  const managers = new Set<string>();
  let started = 0;
  let benched = 0;
  for (const l of allLines(view)) {
    const o = l.owner;
    if (!o || o.state === "owned") continue; // "owned" = rostered but not fielded this period
    managers.add(o.managerId);
    if (o.state === "benched") benched += 1;
    else started += 1;
  }
  return { managers: managers.size, started, benched };
}

/** Your stake: your owned players in this match (pts-desc), plus the combined fantasy total. */
function stakeOf(view: GameDetailView): { players: PlayerLine[]; total: number } {
  const players = allLines(view)
    .filter((l) => l.owner?.isMe)
    .sort((a, b) => (b.fantasyPoints ?? 0) - (a.fantasyPoints ?? 0));
  const total = players.reduce((s, l) => s + (l.fantasyPoints ?? 0), 0);
  return { players, total };
}

/** Ratings board: every rated player (rating-desc); the MVP is the highest fantasy total among them. */
function ratingsOf(view: GameDetailView): { board: PlayerLine[]; mvp: PlayerLine | null } {
  const board = allLines(view)
    .filter((l) => l.rating !== null)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const mvp = board.reduce<PlayerLine | null>(
    (best, l) => (best === null || (l.fantasyPoints ?? 0) > (best.fantasyPoints ?? 0) ? l : best),
    null,
  );
  return { board, mvp };
}

// ─── atoms ──────────────────────────────────────────────────────────────────────────

/** The 0–10 RATING square (real-match lens) — colour-coded; "–" until the feed posts one. */
function RatingBadge({ r, size = "md" }: { r: number | null; size?: "sm" | "md" | "lg" }) {
  if (r === null) return <span className={`gd-rate gd-rate-na gd-rate-${size}`}>–</span>;
  return (
    <span className={`gd-rate gd-rate-${size}`} style={{ background: ratingColor(r) }}>
      {r.toFixed(1)}
    </span>
  );
}

/** FANTASY points (league lens) — muted for an appearance-only baseline, bright on a real return. */
function Fpts({
  line,
  live,
  size = "sm",
}: {
  line: PlayerLine;
  live: boolean;
  size?: "sm" | "md";
}) {
  if (line.fantasyPoints === null) return null;
  const v = line.fantasyPoints;
  const notable = hasReturn(line);
  const mine = line.owner?.isMe ?? false;
  const tone = v < 0 ? "is-neg" : notable ? "is-pop" : mine ? "" : "is-muted";
  const showDot = live && notable;
  return (
    <span className={`gd-fpts gd-fpts-${size} ${tone}${showDot ? " is-live" : ""}`.trim()}>
      {showDot && <i className="gd-fdot" aria-hidden="true" />}
      <b>
        {v >= 0 ? "+" : ""}
        {v}
      </b>
      <small>fpt{Math.abs(v) === 1 ? "" : "s"}</small>
    </span>
  );
}

/** The fantasy owner tag — accent "You" for the viewer, neutral manager avatar + name for rivals. */
function OwnerChip({ owner, tiny = false }: { owner: OwnerTag; tiny?: boolean }) {
  const who = owner.isMe ? "You" : owner.managerName;
  return (
    <span
      className={`gd-owner${owner.isMe ? " is-me" : ""}${tiny ? " is-tiny" : ""}`}
      title={`${who}${owner.state === "benched" ? " — on their bench (scores 0 to their XI)" : ""}`}
    >
      <span className="gd-owner-av" aria-hidden="true">
        {managerInitials(owner.managerName)}
      </span>
      <span className="gd-owner-nm">{who}</span>
      {owner.state === "benched" && <span className="gd-owner-bench">bench</span>}
    </span>
  );
}

// ─── lineups: formation pitch ───────────────────────────────────────────────────────

const LANES = ["GK", "DEF", "MID", "FWD"] as const;

/** A pitch jersey token: flag-kit shirt + rating corner + ownership corner + name + fantasy chip. */
function KitToken({ line, live, onOpen }: { line: PlayerLine; live: boolean; onOpen: OpenFn }) {
  const me = line.owner?.isMe ?? false;
  const inner = (
    <>
      <span className="gd-tok-shirt-wrap">
        <span className="gd-tok-shirt" style={{ background: kitOf(line.nation) }} />
        {line.rating !== null && (
          <span className="gd-tok-rate" style={{ background: ratingColor(line.rating) }}>
            {line.rating.toFixed(1)}
          </span>
        )}
        {line.owner &&
          (me ? (
            <span className="gd-tok-own is-me">YOU</span>
          ) : (
            <span
              className="gd-tok-own is-rival"
              title={`Owned by ${line.owner.managerName}`}
              aria-hidden="true"
            />
          ))}
        {(line.redCard || line.wentOffMinute !== null) && (
          <span className="gd-tok-status">
            {line.redCard && (
              <span className="gd-rev is-red" title="Red card" aria-label="red card" />
            )}
            {line.wentOffMinute !== null && (
              <span
                className="gd-rev is-off"
                title={`Subbed off ${line.wentOffMinute}'${line.subbedOffForName ? ` for ${line.subbedOffForName}` : ""}`}
              >
                ▾{line.wentOffMinute}&apos;
              </span>
            )}
          </span>
        )}
      </span>
      <span className="gd-tok-name">{shortName(line)}</span>
      <span className="gd-tok-foot">
        <Fpts line={line} live={live} />
      </span>
    </>
  );
  if (onOpen) {
    return (
      <button
        type="button"
        className={`gd-tok${me ? " is-me" : ""}`}
        onClick={() => onOpen(line.playerId)}
      >
        {inner}
      </button>
    );
  }
  return <div className={`gd-tok${me ? " is-me" : ""}`}>{inner}</div>;
}

/**
 * One side's named starting XI as position lanes (GK→FWD); CSS orients them per side + viewport.
 * Sources `side.pitch` (the reconciled KICKOFF XI — sheet ∪ player_out − come-ons − no-minute phantoms,
 * NOT the raw is_starter sheet, which the feed over-marks). On a sheet side `side.pitch === side.starters`.
 * Subbed-off / sent-off starters keep their lane; a come-on substitute never gets a pitch token. Empty
 * pitch = no sheet.
 */
function PitchHalf({
  side,
  which,
  live,
  onOpen,
}: {
  side: SquadSide;
  which: "home" | "away";
  live: boolean;
  onOpen: OpenFn;
}) {
  const byLane: Record<PlayerLine["position"], PlayerLine[]> = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: [],
  };
  for (const l of side.pitch) byLane[l.position].push(l);
  return (
    <div className={`gd-phalf is-${which}`}>
      {LANES.map((lane) => {
        // A populous band wraps into balanced formation lines (back→front) so it never overflows the
        // pitch. The wide (desktop) and narrow (mobile) splits differ only for a flat back-4 (one line
        // vs a balanced 2+2): when they match, render once; when they don't, render both and let the
        // same breakpoint that flips the half's flex-direction show the right one (no SSR-unsafe
        // viewport probing, no greedy CSS wrap).
        const players = byLane[lane];
        const wide = pitchRows(players, false);
        const narrow = pitchRows(players, true);
        if (wide.length === narrow.length) {
          return <LaneColumn key={lane} lines={wide} live={live} onOpen={onOpen} />;
        }
        return (
          <Fragment key={lane}>
            <LaneColumn lines={wide} live={live} onOpen={onOpen} variant="wide-only" />
            <LaneColumn lines={narrow} live={live} onOpen={onOpen} variant="narrow-only" />
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * One position lane: a `.gd-pcol` holding one `.gd-pline` per formation line. `is-wide` gives a
 * wrapped (multi-line) band the extra depth its sub-lines need; `variant` scopes a dual-rendered
 * back-4 to its axis (CSS shows `wide-only` on desktop, `narrow-only` on mobile).
 */
function LaneColumn({
  lines,
  live,
  onOpen,
  variant,
}: {
  lines: readonly PlayerLine[][];
  live: boolean;
  onOpen: OpenFn;
  variant?: "wide-only" | "narrow-only";
}) {
  const cls = `gd-pcol${lines.length > 1 ? " is-wide" : ""}${variant ? ` is-${variant}` : ""}`;
  return (
    <div className={cls}>
      {lines.map((linePlayers) => (
        <div key={linePlayers[0]?.playerId ?? "empty"} className="gd-pline">
          {linePlayers.map((l) => (
            <KitToken key={l.playerId} line={l} live={live} onOpen={onOpen} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Pitch({ view, live, onOpen }: { view: GameDetailView; live: boolean; onOpen: OpenFn }) {
  return (
    <div className="gd-pitch">
      <div className="gd-pitch-lines" aria-hidden="true">
        <span className="gd-pl-mid" />
        <span className="gd-pl-circle" />
        <span className="gd-pl-box gd-pl-box-l" />
        <span className="gd-pl-box gd-pl-box-r" />
      </div>
      <div className="gd-pitch-grid">
        <PitchHalf side={view.home} which="home" live={live} onOpen={onOpen} />
        <PitchHalf side={view.away} which="away" live={live} onOpen={onOpen} />
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="gd-legend">
      <span className="gd-lg">
        <span className="gd-lg-rate" style={{ background: "#46A05A" }}>
          7.4
        </span>
        Match rating
      </span>
      <span className="gd-lg">
        <span className="gd-lg-fpt">+8</span>Fantasy points
      </span>
      <span className="gd-lg">
        <span className="gd-lg-own is-me">YOU</span>Owned by you
      </span>
      <span className="gd-lg">
        <span className="gd-lg-own" />
        Owned in league
      </span>
    </div>
  );
}

// ─── lineups: enriched team lists ─────────────────────────────────────────────────

/** Goal / assist / card / sub-minute glyphs that ride a lineup row (from the per-player event facts). */
function RowGlyphs({ line }: { line: PlayerLine }) {
  const goals = line.chips.find((c) => c.label === "G");
  const assists = line.chips.find((c) => c.label === "A");
  const glyphs: ReactNode[] = [];
  if (goals) {
    const n = Number(goals.value) || 1;
    for (let i = 0; i < n; i += 1)
      glyphs.push(
        <span key={`g${i}`} className="gd-rev is-goal" title="Goal" aria-label="goal">
          ⚽
        </span>,
      );
  }
  if (assists)
    glyphs.push(
      <span key="a" className="gd-rev is-ast" title="Assist" aria-label="assist">
        A
      </span>,
    );
  for (let i = 0; i < line.yellowCards; i += 1)
    glyphs.push(
      <span key={`y${i}`} className="gd-rev is-yel" title="Yellow card" aria-label="yellow card" />,
    );
  if (line.redCard)
    glyphs.push(<span key="r" className="gd-rev is-red" title="Red card" aria-label="red card" />);
  if (line.wentOffMinute !== null)
    glyphs.push(
      <span
        key="off"
        className="gd-rev is-off"
        title={`Subbed off ${line.wentOffMinute}'${line.subbedOffForName ? ` for ${line.subbedOffForName}` : ""}`}
      >
        ▾{line.wentOffMinute}&apos;
        {line.subbedOffForName && <em className="gd-rev-for"> {line.subbedOffForName}</em>}
      </span>,
    );
  if (line.cameOnMinute !== null)
    glyphs.push(
      <span
        key="on"
        className="gd-rev is-on"
        title={`Subbed on ${line.cameOnMinute}'${line.subbedOnForName ? ` for ${line.subbedOnForName}` : ""}`}
      >
        ▴{line.cameOnMinute}&apos;
        {line.subbedOnForName && <em className="gd-rev-for"> {line.subbedOnForName}</em>}
      </span>,
    );
  return glyphs.length ? <span className="gd-revs">{glyphs}</span> : null;
}

function LineupRow({ line, live, onOpen }: { line: PlayerLine; live: boolean; onOpen: OpenFn }) {
  const me = line.owner?.isMe ?? false;
  const inner = (
    <>
      <span className="gd-lr-kit" style={{ background: kitOf(line.nation) }} aria-hidden="true" />
      <span className="gd-lr-main">
        <span className="gd-lr-name">{fullName(line)}</span>
        <span className="gd-lr-sub">
          <span className={`pos pos-${line.position}`}>{line.position}</span>
          {line.owner && <OwnerChip owner={line.owner} tiny />}
          <RowGlyphs line={line} />
        </span>
      </span>
      <Fpts line={line} live={live} />
      <RatingBadge r={line.rating} />
    </>
  );
  if (onOpen) {
    return (
      <button
        type="button"
        className={`gd-lr${me ? " is-me" : ""}`}
        onClick={() => onOpen(line.playerId)}
      >
        {inner}
      </button>
    );
  }
  return <div className={`gd-lr${me ? " is-me" : ""}`}>{inner}</div>;
}

function TeamList({ side, live, onOpen }: { side: SquadSide; live: boolean; onOpen: OpenFn }) {
  const rows = (label: string, lines: readonly PlayerLine[]) =>
    lines.length > 0 && (
      <>
        <div className="gd-tl-sec">{label}</div>
        <div className="gd-tl-rows">
          {lines.map((l) => (
            <LineupRow key={l.playerId} line={l} live={live} onOpen={onOpen} />
          ))}
        </div>
      </>
    );
  return (
    <div className="gd-tl">
      <div className="gd-tl-head">
        <span
          className="gd-crest sm"
          style={{ background: kitOf(side.teamCode) }}
          aria-hidden="true"
        />
        <b>{side.teamName}</b>
        {side.score !== null && <span className="gd-tl-score mono">{side.score}</span>}
      </div>
      {rows("Starting XI", side.starters)}
      {rows("Substitutes", side.subs)}
      {rows("Bench", side.bench)}
    </div>
  );
}

function LineupsTab({
  view,
  live,
  onOpen,
}: {
  view: GameDetailView;
  live: boolean;
  onOpen: OpenFn;
}) {
  return (
    <div className="gd-lineups">
      <Pitch view={view} live={live} onOpen={onOpen} />
      <Legend />
      <div className="gd-tl-grid">
        <TeamList side={view.home} live={live} onOpen={onOpen} />
        <TeamList side={view.away} live={live} onOpen={onOpen} />
      </div>
    </div>
  );
}

// ─── ratings tab ────────────────────────────────────────────────────────────────────

function RatingsTab({
  view,
  live,
  onOpen,
}: {
  view: GameDetailView;
  live: boolean;
  onOpen: OpenFn;
}) {
  const { board, mvp } = ratingsOf(view);
  if (board.length === 0) {
    return (
      <div className="gd-rb-empty">
        {live && <span className="gd-livedot" aria-hidden="true" />}
        Ratings appear once the match feed posts them.
      </div>
    );
  }
  const top = board.slice(0, 3);
  return (
    <div className="gd-ratings">
      <div className="gd-rb-top">
        <div className="gd-rb-title">Highest-rated players</div>
        <div className="gd-rb-podium">
          {top.map((l, i) => {
            const podiumInner = (
              <>
                <span className="gd-rb-rank">{i + 1}</span>
                <span className="gd-rb-shirt" style={{ background: kitOf(l.nation) }}>
                  <i aria-hidden="true">{discInitial(l)}</i>
                </span>
                <RatingBadge r={l.rating} size="lg" />
                <span className="gd-rb-nm">{surnameLabel(l)}</span>
                <span className="gd-rb-team">
                  {l.nation && <Flag code={toIso2(l.nation)} label={l.nation} />}
                  {l.nation}
                </span>
                <Fpts line={l} live={live} />
              </>
            );
            return onOpen ? (
              <button
                type="button"
                className={`gd-rb-pod p${i}`}
                key={l.playerId}
                onClick={() => onOpen(l.playerId)}
              >
                {podiumInner}
              </button>
            ) : (
              <div className={`gd-rb-pod p${i}`} key={l.playerId}>
                {podiumInner}
              </div>
            );
          })}
        </div>
      </div>

      {mvp && (
        <div className="gd-rb-mvp">
          <span className="gd-fan-tag">FANTASY MVP</span>
          <b>{fullName(mvp)}</b>
          {mvp.fantasyPoints !== null && (
            <span className="gd-rb-mvp-pts">
              {mvp.fantasyPoints >= 0 ? "+" : ""}
              {mvp.fantasyPoints} fpts
            </span>
          )}
          {mvp.owner && <OwnerChip owner={mvp.owner} tiny />}
        </div>
      )}

      <div className="gd-rb-list">
        {board.map((l, i) => {
          const me = l.owner?.isMe ?? false;
          const rowInner = (
            <>
              <span className="gd-rb-i mono">{i + 1}</span>
              <RatingBadge r={l.rating} />
              <span className="gd-rb-rowmain">
                <span className="gd-rb-rowname">{fullName(l)}</span>
                <span className="gd-rb-rowsub">
                  <span className={`pos pos-${l.position}`}>{l.position}</span>
                  {l.nation && <Flag code={toIso2(l.nation)} label={l.nation} />}
                  {l.nation}
                </span>
              </span>
              {l.owner && <OwnerChip owner={l.owner} tiny />}
              <Fpts line={l} live={live} />
            </>
          );
          return onOpen ? (
            <button
              type="button"
              className={`gd-rb-row${me ? " is-me" : ""}`}
              key={l.playerId}
              onClick={() => onOpen(l.playerId)}
            >
              {rowInner}
            </button>
          ) : (
            <div className={`gd-rb-row${me ? " is-me" : ""}`} key={l.playerId}>
              {rowInner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Surname for the podium card (last name, else display name). */
function surnameLabel(l: PlayerLine): string {
  return l.lastName ?? l.displayName;
}

// ─── statistics tab ───────────────────────────────────────────────────────────────

/** Display a team-stat value; null → "–". Possession/accuracy/duels show as whole percentages. */
function fmtStat(v: number | null, format: StatFormat): string {
  if (v === null) return "–";
  if (format === "pct") return `${Math.round(v)}%`;
  if (format === "dec") return v.toFixed(2);
  return String(v);
}
/** Bar-fill width (%) for one side: a percentage fills to its own value; a count to its share of the pair. */
function statFillPct(value: number | null, other: number | null, format: StatFormat): number {
  if (value === null) return 0;
  if (format === "pct") return Math.max(0, Math.min(100, value));
  const total = value + (other ?? 0);
  return total > 0 ? (value / total) * 100 : 0;
}

/**
 * One home-vs-away comparison row: home value · centred label · away value over two separate proportional
 * tracks (home fills toward the centre, away away from it). The LEADING side's number brightens — for the
 * lower-is-better (neutral) stats the lower side leads. A null side shows "–" with an empty track.
 */
function StatBar({ row }: { row: GameStatRow }) {
  const { home, away, format, neutral } = row;
  const bothPresent = home !== null && away !== null;
  const homeLead = bothPresent && (neutral ? home < away : home > away);
  const awayLead = bothPresent && (neutral ? away < home : away > home);
  return (
    <div className="gd-stat">
      <div className="gd-stat-top">
        <span className={`gd-stat-v${homeLead ? " is-lead" : ""}`}>{fmtStat(home, format)}</span>
        <span className="gd-stat-lab">{row.label}</span>
        <span className={`gd-stat-v${awayLead ? " is-lead" : ""}`}>{fmtStat(away, format)}</span>
      </div>
      <div className="gd-stat-bars">
        <div className="gd-stat-track is-h">
          <span
            className="gd-stat-fill is-h"
            style={{ width: `${statFillPct(home, away, format)}%` }}
          />
        </div>
        <div className="gd-stat-track is-a">
          <span
            className="gd-stat-fill is-a"
            style={{ width: `${statFillPct(away, home, format)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/** The Statistics tab — team match aggregates as home-vs-away comparison bars (rendered only when present). */
function StatisticsTab({
  view,
  statistics,
  live,
}: {
  view: GameDetailView;
  statistics: GameStatistics;
  live: boolean;
}) {
  const { home, away } = view;
  return (
    <div className="gd-stats">
      <div className="gd-st-toolbar">
        <span className="gd-st-team">
          <span className="gd-st-swatch is-h" aria-hidden="true" />
          {home.teamCode && <Flag code={toIso2(home.teamCode)} label={home.teamName} />}
          {home.teamName}
        </span>
        <span className="gd-st-team is-away">
          {away.teamCode && <Flag code={toIso2(away.teamCode)} label={away.teamName} />}
          {away.teamName}
          <span className="gd-st-swatch is-a" aria-hidden="true" />
        </span>
      </div>
      {live && (
        <div className="gd-st-livenote">
          <span className="gd-livedot" aria-hidden="true" />
          Live totals — updating as the match plays
        </div>
      )}
      <div className="gd-st-groups">
        {statistics.groups.map((g, gi) => (
          <div className="gd-st-group" key={gi}>
            {g.title && <div className="gd-st-gtitle">{g.title}</div>}
            {g.rows.map((r) => (
              <StatBar key={r.key} row={r} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── scoreboard + stake ───────────────────────────────────────────────────────────

function ClockPill({ status }: { status: MatchStatus }) {
  if (status === "in_progress")
    return (
      <span className="gd-clock live">
        <span className="gd-livedot" aria-hidden="true" />
        Live
      </span>
    );
  if (status === "completed") return <span className="gd-clock ft">Full-time</span>;
  if (status === "postponed") return <span className="gd-clock pre">Postponed</span>;
  if (status === "abandoned") return <span className="gd-clock pre">Abandoned</span>;
  return <span className="gd-clock pre">Scheduled</span>;
}

function Scoreboard({ view }: { view: GameDetailView }) {
  const { header, home, away } = view;
  const live = header.status === "in_progress";
  const hasScore = home.score !== null && away.score !== null;
  const exposure = exposureOf(view);
  return (
    <div className="gd-board">
      <div className="gd-board-main">
        <div className="gd-team gd-team-home">
          <span className="gd-team-nm">{home.teamName}</span>
          <span
            className="gd-crest"
            style={{ background: kitOf(home.teamCode) }}
            aria-hidden="true"
          />
        </div>
        <div className="gd-board-center">
          <div className={`gd-score${live ? " is-live" : ""}`}>
            {hasScore ? (
              <>
                <span className="gd-score-n">{home.score}</span>
                <span className="gd-score-dash">–</span>
                <span className="gd-score-n">{away.score}</span>
              </>
            ) : (
              <span className="gd-score-dash">v</span>
            )}
          </div>
          <ClockPill status={header.status} />
        </div>
        <div className="gd-team gd-team-away">
          <span
            className="gd-crest"
            style={{ background: kitOf(away.teamCode) }}
            aria-hidden="true"
          />
          <span className="gd-team-nm">{away.teamName}</span>
        </div>
      </div>

      <div className="gd-board-meta">
        <span>{header.kickoffLabel}</span>
        {header.matchdayLabel && (
          <>
            <span className="gd-dot-sep">·</span>
            <span>{header.matchdayLabel}</span>
          </>
        )}
      </div>

      {header.hasFantasyOverlay && exposure.managers > 0 && (
        <div className="gd-board-fan">
          <span className="gd-fan-tag">FANTASY</span>
          <span className="gd-fan-txt">
            Feeds <b>{exposure.managers}</b> of the league&apos;s XIs · <b>{exposure.started}</b>{" "}
            started, <b>{exposure.benched}</b> benched
          </span>
        </div>
      )}
    </div>
  );
}

function StakeStrip({ view, onOpen }: { view: GameDetailView; onOpen: OpenFn }) {
  const live = view.header.status === "in_progress";
  const { players, total } = stakeOf(view);
  if (players.length === 0) return null;
  return (
    <div className="gd-stake">
      <div className="gd-stake-l">
        <span className="gd-fan-tag is-you">YOUR XI</span>
        <span className="gd-stake-lab">
          <b>{players.length}</b> in this match
        </span>
      </div>
      <div className="gd-stake-players">
        {players.map((l) => {
          const chipInner = (
            <>
              <span
                className="gd-stake-kit"
                style={{ background: kitOf(l.nation) }}
                aria-hidden="true"
              />
              <span className="gd-stake-nm">{surnameLabel(l)}</span>
              <RatingBadge r={l.rating} size="sm" />
              <Fpts line={l} live={live} />
            </>
          );
          return onOpen ? (
            <button
              type="button"
              className="gd-stake-chip"
              key={l.playerId}
              onClick={() => onOpen(l.playerId)}
            >
              {chipInner}
            </button>
          ) : (
            <div className="gd-stake-chip" key={l.playerId}>
              {chipInner}
            </div>
          );
        })}
      </div>
      <div className="gd-stake-total">
        <span className="gd-stake-tnum">
          {total >= 0 ? "+" : ""}
          {total}
        </span>
        <span className="gd-stake-tlab">your fpts</span>
      </div>
    </div>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────────────

export function GameDetailClient({ view }: { view: GameDetailView }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("lineups");
  const [boxPlayer, setBoxPlayer] = useState<string | null>(null);
  const { periodId } = view;
  const live = view.header.status === "in_progress";

  // Tap-to-breakdown only when the match links to a fantasy period (the modal is period-keyed).
  const onOpen: OpenFn = periodId ? (playerId: string) => setBoxPlayer(playerId) : null;

  return (
    <div className="gd-app">
      <button type="button" className="gd-back" onClick={() => router.back()}>
        ‹ Back
      </button>

      <Scoreboard view={view} />

      {!view.header.hasFantasyOverlay && (
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
            Squads, ratings and points appear once the lineup is announced and the match begins.
          </span>
        </div>
      ) : (
        <>
          <StakeStrip view={view} onOpen={onOpen} />

          <div className="gd-tabbar" role="tablist" aria-label="Match detail sections">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "lineups"}
              className={`gd-tabbtn${tab === "lineups" ? " is-active" : ""}`}
              onClick={() => setTab("lineups")}
            >
              Lineups
            </button>
            {/* Statistics tab appears only once the feed has posted team stats for this match. */}
            {view.statistics && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "statistics"}
                className={`gd-tabbtn${tab === "statistics" ? " is-active" : ""}`}
                onClick={() => setTab("statistics")}
              >
                Statistics
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={tab === "ratings"}
              className={`gd-tabbtn${tab === "ratings" ? " is-active" : ""}`}
              onClick={() => setTab("ratings")}
            >
              Ratings
            </button>
          </div>

          <div className="gd-tabwrap">
            {/* LineupsTab is the default fall-through, so a stale "statistics" tab (after the block
                disappears on refresh) degrades cleanly rather than rendering blank. */}
            {tab === "ratings" ? (
              <RatingsTab view={view} live={live} onOpen={onOpen} />
            ) : tab === "statistics" && view.statistics ? (
              <StatisticsTab view={view} statistics={view.statistics} live={live} />
            ) : (
              <LineupsTab view={view} live={live} onOpen={onOpen} />
            )}
          </div>
        </>
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
