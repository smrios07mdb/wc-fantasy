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
import { useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { MatchStatus } from "@app/shared";
import { Flag } from "@/app/draft/Flag";
import { toIso2 } from "@/src/draft/flag";
import { kitOf } from "@/app/vsfield/kitOf";
import { PlayerScoreSheet } from "@/components/PlayerScoreSheet";
import type {
  GameDetailView,
  GameEvent,
  GameStandings,
  GameStatistics,
  GameStatRow,
  OwnerTag,
  PlayerLine,
  SquadSide,
  StatFormat,
} from "@/src/games/types";
import { pitchRows } from "@/src/games/pitchRows";
import "@/src/games/games.css";

type Tab = "lineups" | "statistics" | "events" | "ratings" | "standings";
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

/** Group a side's pitch XI into its four position bands (GK→FWD), preserving source order. */
function groupByLane(pitch: readonly PlayerLine[]): Record<(typeof LANES)[number], PlayerLine[]> {
  const byLane: Record<(typeof LANES)[number], PlayerLine[]> = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: [],
  };
  for (const l of pitch) byLane[l.position].push(l);
  return byLane;
}

/**
 * Sizing inputs for one side: the number of formation LINES (the GK line + each band's convention
 * sub-lines) and the widest single line. The mobile pitch sizes every token to
 * `min(width / cols, height / rows)` so the FULL XI of BOTH sides fits one phone screen with no scroll;
 * the grid is fed the busier side's counts so the two halves size their tokens identically.
 */
function pitchMetrics(side: SquadSide): { rows: number; cols: number } {
  const byLane = groupByLane(side.pitch);
  let rows = 0;
  let cols = 0;
  for (const lane of LANES) {
    const lines = pitchRows(byLane[lane], lane);
    rows += lines.length;
    for (const line of lines) cols = Math.max(cols, line.length);
  }
  return { rows, cols };
}

/**
 * One side's named starting XI as position bands (GK→FWD). Sources `side.pitch` (the reconciled KICKOFF
 * XI — sheet ∪ player_out − come-ons − no-minute phantoms, NOT the raw is_starter sheet, which the feed
 * over-marks). On a sheet side `side.pitch === side.starters`. Subbed-off / sent-off starters keep their
 * lane; a come-on substitute never gets a pitch token. Empty pitch = no sheet.
 *
 * Each band is one `.gd-pcol`; a populous band splits into its convention lines (back→front), so the half
 * renders identically on phone and desktop — only the token SIZE changes (no axis-dependent dual-render).
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
  const byLane = groupByLane(side.pitch);
  return (
    <div className={`gd-phalf is-${which}`}>
      {LANES.map((lane) => (
        <LaneColumn key={lane} lines={pitchRows(byLane[lane], lane)} live={live} onOpen={onOpen} />
      ))}
    </div>
  );
}

/**
 * One position band: a `.gd-pcol` holding one `.gd-pline` per formation line (each line spreads its
 * tokens across the pitch width on mobile / its height on desktop). `is-wide` gives a multi-line band
 * (a back-5 → 3+2, a mid-5 → 2+3) the extra room its two sub-lines need.
 */
function LaneColumn({
  lines,
  live,
  onOpen,
}: {
  lines: readonly PlayerLine[][];
  live: boolean;
  onOpen: OpenFn;
}) {
  const cls = `gd-pcol${lines.length > 1 ? " is-wide" : ""}`;
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
  const hm = pitchMetrics(view.home);
  const am = pitchMetrics(view.away);
  // The busier side drives the shared token size (more lines → shorter tokens, denser line → narrower)
  // so both halves match and the whole XI fits one screen. Floored at 1 so the CSS calc() never divides
  // by zero on an empty pitch.
  const gridVars = {
    "--pitch-rows": Math.max(hm.rows, am.rows, 1),
    "--pitch-cols": Math.max(hm.cols, am.cols, 1),
  } as CSSProperties;
  return (
    <div className="gd-pitch" style={gridVars}>
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

// ─── events timeline + scorers (T16b) ───────────────────────────────────────────────

/** Goal events for one side, in chronological order (own goals already attributed to the beneficiary). */
function sideGoals(events: readonly GameEvent[], side: "home" | "away"): GameEvent[] {
  return events.filter((e) => e.kind === "goal" && e.side === side);
}

/** One side's scoreboard scorers line: "⚽ Surname 11', 45+2'", grouped by scorer; own goals tagged (OG). */
function ScorersSide({
  goals,
  side,
  lineById,
}: {
  goals: readonly GameEvent[];
  side: "home" | "away";
  lineById: Map<string, PlayerLine>;
}) {
  const groups: { key: string; name: string; og: boolean; mins: string[] }[] = [];
  const byKey = new Map<string, (typeof groups)[number]>();
  for (const g of goals) {
    const line = g.playerId ? lineById.get(g.playerId) : undefined;
    const name = line?.lastName ?? g.playerName ?? "Goal"; // compact surname on the scoreboard line
    const key = `${g.playerId ?? name}|${g.isOwnGoal ? "og" : ""}`;
    let grp = byKey.get(key);
    if (!grp) {
      grp = { key, name, og: g.isOwnGoal, mins: [] };
      byKey.set(key, grp);
      groups.push(grp);
    }
    if (g.minuteLabel) grp.mins.push(g.minuteLabel);
  }
  return (
    <div className={`gd-scorers is-${side}`}>
      {groups.map((g) => (
        <div className="gd-scorer" key={g.key}>
          <span className="gd-ball" aria-hidden="true">
            ⚽
          </span>
          <span className="gd-scorer-nm">
            {g.name}
            {g.og && <em className="gd-og"> (OG)</em>}
          </span>
          {g.mins.length > 0 && <span className="gd-scorer-mins mono">{g.mins.join(", ")}</span>}
        </div>
      ))}
    </div>
  );
}

/** The body of a non-marker timeline row — a goal, substitution, or card. `line` resolves the owner tag. */
function EventBody({ e, line }: { e: GameEvent; line: PlayerLine | undefined }) {
  if (e.kind === "goal") {
    return (
      <div className="gd-tev-body">
        <div className="gd-tev-line">
          <span className="gd-ball" aria-hidden="true">
            ⚽
          </span>
          <b>{e.playerName ?? "Goal"}</b>
          {e.isPenalty && <span className="gd-ev-tag">PEN</span>}
          {e.isOwnGoal && <span className="gd-ev-tag is-og">OG</span>}
        </div>
        {e.assistName && <div className="gd-tev-sub">assist · {e.assistName}</div>}
        {line?.owner && (
          <div className="gd-tev-fan">
            <OwnerChip owner={line.owner} tiny />
          </div>
        )}
      </div>
    );
  }
  if (e.kind === "sub") {
    return (
      <div className="gd-tev-body">
        <div className="gd-tev-line gd-sub-on">
          <span className="gd-sub-ar is-on" aria-hidden="true">
            ▲
          </span>
          <b>{e.playerName ?? "—"}</b>
        </div>
        {e.secondaryName && (
          <div className="gd-tev-sub gd-sub-off">
            <span className="gd-sub-ar is-off" aria-hidden="true">
              ▼
            </span>
            {e.secondaryName}
          </div>
        )}
      </div>
    );
  }
  // card
  return (
    <div className="gd-tev-body">
      <div className="gd-tev-line">
        <span
          className={`gd-ev-ic is-${e.cardKind === "red" ? "red" : "yel"}`}
          aria-hidden="true"
          title={e.cardKind === "red" ? "Red card" : "Yellow card"}
        />
        <b>{e.playerName ?? "—"}</b>
      </div>
    </div>
  );
}

/** One timeline entry: a full-width KO/HT/FT marker, or a side-anchored goal/sub/card on the spine. */
function TimelineRow({ e, lineById }: { e: GameEvent; lineById: Map<string, PlayerLine> }) {
  if (e.kind === "marker") {
    const major = e.label === "Half-time" || e.label === "Full-time";
    return (
      <div className={`gd-tl-marker${major ? " is-major" : ""}`}>
        <span className="gd-tlm-line" aria-hidden="true" />
        <span className={`gd-tlm-pill${major ? " is-major" : ""}`}>
          {e.label}
          {major ? ` · ${e.homeScore}–${e.awayScore}` : ""}
        </span>
        <span className="gd-tlm-line" aria-hidden="true" />
      </div>
    );
  }
  const line = e.playerId ? lineById.get(e.playerId) : undefined;
  const body = <EventBody e={e} line={line} />;
  // A goal whose scorer can't be placed on a side (the desync-guarded case) renders centred, never dropped.
  if (e.side === null) {
    return (
      <div className="gd-tev gd-tev-none">
        <span className="gd-tev-min mono">{e.minuteLabel}</span>
        {body}
      </div>
    );
  }
  return (
    <div className={`gd-tev gd-tev-${e.side}${e.kind === "goal" ? " is-goal" : ""}`}>
      <div className="gd-tev-half gd-tev-l">{e.side === "home" && body}</div>
      <div className="gd-tev-spine">
        <span className="gd-tev-min mono">{e.minuteLabel}</span>
      </div>
      <div className="gd-tev-half gd-tev-r">{e.side === "away" && body}</div>
    </div>
  );
}

/** The Events tab — a chronological match timeline (reversed to latest-first), home left / away right. */
function EventsTab({ view }: { view: GameDetailView }) {
  const lineById = new Map(allLines(view).map((l) => [l.playerId, l]));
  const rows = view.events.slice().reverse();
  // Empty only when there's nothing but the synthetic Kick-off marker (mirrors the design's `evs.length<=1`);
  // a finished event-free match shows its KO/FT markers instead of a future-tense "as the match unfolds" note.
  const onlyKickoff = view.events.length <= 1;
  const anomaly = view.eventScoreAnomaly;
  return (
    <div className="gd-events">
      <div className="gd-ev-head">
        <span className="gd-eh-team">
          {view.home.teamCode && (
            <Flag code={toIso2(view.home.teamCode)} label={view.home.teamName} />
          )}
          {view.home.teamName}
        </span>
        <span className="gd-eh-mid">Match events</span>
        <span className="gd-eh-team is-away">
          {view.away.teamName}
          {view.away.teamCode && (
            <Flag code={toIso2(view.away.teamCode)} label={view.away.teamName} />
          )}
        </span>
      </div>
      {anomaly && (
        // The timeline's replayed score diverged from the official (stored) score — surface it honestly
        // rather than leaving the user to puzzle over a scoreboard that disagrees with the FT marker.
        <p className="gd-note t-sm text-tertiary">
          Timeline reconstructed from feed events; it may differ from the official score.
        </p>
      )}
      <div className="gd-timeline">
        {onlyKickoff && (
          <div className="gd-ev-empty">
            No events yet — goals, cards and substitutions appear as the match unfolds.
          </div>
        )}
        {rows.map((e) => (
          <TimelineRow key={timelineKey(e)} e={e} lineById={lineById} />
        ))}
      </div>
    </div>
  );
}

/**
 * Standings tab (T18) — the match's WC group table. Columns `# · Team · P · W · D · L · GD · GF · Pts`
 * per the match-detail handoff (the `Last`/form column is intentionally omitted: the `group_standings`
 * feed carries no form). Top-2 get the green qualification position badge (`is-qual`); the two in-match
 * teams get the accent row tint + dot (`is-inmatch`). Position-3 has no distinct style — the advancement
 * note + footnote convey "3rd may advance" (faithful to the handoff).
 */
function StandingsTab({ standings }: { standings: GameStandings }) {
  const fmtGd = (gd: number): string => (gd > 0 ? `+${gd}` : `${gd}`);
  return (
    <div className="gd-standings">
      <div className="gd-gr-head">
        <span className="gd-gr-trophy" aria-hidden="true">
          🏆
        </span>
        <b>{standings.groupName}</b>
        <span className="gd-gr-note">{standings.advanceNote}</span>
      </div>
      <table className="gd-gr-table">
        <thead>
          <tr>
            <th>#</th>
            <th className="gd-gr-team">Team</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>GD</th>
            <th>GF</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.rows.map((r) => (
            <tr key={r.teamId} className={r.inMatch ? "is-inmatch" : undefined}>
              <td>
                <span className={`gd-gr-pos${r.isQualifying ? " is-qual" : ""}`}>{r.position}</span>
              </td>
              <td className="gd-gr-team">
                {r.teamName && <Flag code={toIso2(r.teamName)} label={r.teamName} />}
                <span className="gd-gr-name">{r.teamName}</span>
                {r.inMatch && <span className="gd-gr-dot" aria-hidden="true" />}
              </td>
              <td>{r.played}</td>
              <td>{r.won}</td>
              <td>{r.drawn}</td>
              <td>{r.lost}</td>
              <td>{fmtGd(r.goalDifference)}</td>
              <td>
                {r.goalsFor}:{r.goalsAgainst}
              </td>
              <td>
                <b>{r.points}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="gd-gr-tiebreak">{standings.tiebreakNote}</p>
    </div>
  );
}

/** A stable, content-derived React key (no event id in the feed; markers repeat labels). */
function timelineKey(e: GameEvent): string {
  return [
    e.kind,
    e.period ?? "",
    e.minute ?? "",
    e.playerId ?? e.label ?? "",
    e.homeScore,
    e.awayScore,
  ].join("|");
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
  // Scoreboard scorers row (T16b): goals grouped by side, from the same ordered events[] the tab consumes.
  const homeGoals = sideGoals(view.events, "home");
  const awayGoals = sideGoals(view.events, "away");
  const lineById = new Map(allLines(view).map((l) => [l.playerId, l])); // surname resolution for scorers
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

      {homeGoals.length + awayGoals.length > 0 && (
        <div className="gd-board-scorers">
          <ScorersSide goals={homeGoals} side="home" lineById={lineById} />
          <ScorersSide goals={awayGoals} side="away" lineById={lineById} />
        </div>
      )}

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
            {/* Events tab — between Statistics and Ratings per the match-detail handoff tab strip. */}
            <button
              type="button"
              role="tab"
              aria-selected={tab === "events"}
              className={`gd-tabbtn${tab === "events" ? " is-active" : ""}`}
              onClick={() => setTab("events")}
            >
              Events
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "ratings"}
              className={`gd-tabbtn${tab === "ratings" ? " is-active" : ""}`}
              onClick={() => setTab("ratings")}
            >
              Ratings
            </button>
            {/* Standings tab — LAST per the match-detail handoff strip; appears only for a group-stage
                match whose group table has been ingested (the builder returns null otherwise). */}
            {view.standings && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "standings"}
                className={`gd-tabbtn${tab === "standings" ? " is-active" : ""}`}
                onClick={() => setTab("standings")}
              >
                Standings
              </button>
            )}
          </div>

          <div className="gd-tabwrap">
            {/* LineupsTab is the default fall-through, so a stale "statistics"/"standings" tab (after the
                block disappears on refresh) degrades cleanly rather than rendering blank. */}
            {tab === "ratings" ? (
              <RatingsTab view={view} live={live} onOpen={onOpen} />
            ) : tab === "events" ? (
              <EventsTab view={view} />
            ) : tab === "statistics" && view.statistics ? (
              <StatisticsTab view={view} statistics={view.statistics} live={live} />
            ) : tab === "standings" && view.standings ? (
              <StandingsTab standings={view.standings} />
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
