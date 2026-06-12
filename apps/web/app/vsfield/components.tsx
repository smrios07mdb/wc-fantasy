"use client";
/**
 * Presentational components for the live "vs the field" screen. Ported 1:1 from
 * design/design_reference/vsfield/{components,desktop}.jsx and adapted to the server-computed
 * `VsFieldView` (@app/vsfield). Mapping:
 *   Pos ← components.jsx <Pos/> · Avatar ← <Avatar/> (initials only — the snapshot has no per-manager
 *   colors) · ConnPill ← <ConnPill/> · PitchMini ← <PitchMini/> · RecordBadge ← <RecordBadge/> ·
 *   H2HResultChip ← <H2HResult/> · MatchStrip ← <MatchStrip/>/<MatchCard/> · XILegend ← <XILegend/> ·
 *   FieldTable/FieldRow ← desktop.jsx <FieldTable/>/<FieldRow/> · YouVsField ← <YouVsField/> ·
 *   H2HDetail ← <H2HDetail/> · SeasonTable ← <SeasonTable/> · useScorePulse ← <useScorePulse/>.
 *
 * Deliberately NOT ported (data out of this prompt's scope): the scoring FeedPanel (needs event-level
 * rows) and the per-player named XI list / per-player points inside H2HDetail — see TODO(prompt-NN)s.
 */
import { useEffect, useRef, useState } from "react";
import type {
  FieldEntry,
  MatchView,
  ProvisionalRecord,
  SeasonEntry,
  StarterState,
  StarterView,
  StillToCome,
} from "@app/vsfield";
import type { Position } from "@app/shared";
import { Flag } from "@/app/draft/Flag";
import { toIso2 } from "@/src/draft/flag";

export type ConnState = "live" | "reconnecting" | "stale" | "loading";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/**
 * Display count of starters "still to come": not-yet-kicked-off PLUS no-resolvable-fixture
 * (postponed/abandoned/null team). Both render as hollow "to play" nodes on the pitch, so the shown
 * count must include both — and stillToCome + playing + played == the XI size (the four buckets
 * partition the starters; see classifyStarter in @app/vsfield).
 */
function stillToCome(c: StillToCome): number {
  return c.yetToPlay + c.noMatch;
}

export function Avatar({ name, isMe }: { name: string; isMe?: boolean }) {
  return <span className={"vf-ava" + (isMe ? " is-me" : "")}>{initials(name)}</span>;
}

export function Pos({ p }: { p: Position }) {
  return <span className={"pos pos-" + p}>{p}</span>;
}

export function ConnPill({ state }: { state: ConnState }) {
  if (state === "live")
    return (
      <span className="pill pill-live vf-conn">
        <span className="vf-livedot" aria-hidden="true" />
        Live
      </span>
    );
  if (state === "reconnecting")
    return (
      <span className="pill vf-conn vf-conn-recon">
        <span className="spinner" style={{ width: 11, height: 11 }} />
        Reconnecting
      </span>
    );
  if (state === "stale")
    return (
      <span className="pill vf-conn vf-conn-stale">
        <span aria-hidden="true">◷</span>Delayed
      </span>
    );
  return (
    <span className="pill pill-neutral vf-conn">
      <span className="spinner" style={{ width: 11, height: 11 }} />
      Loading
    </span>
  );
}

const NODE_CLASS: Record<StarterState, string> = {
  "yet-to-play": "s-ytp",
  playing: "s-live",
  played: "s-played",
};

const PITCH_LANES_V: Position[] = ["FWD", "MID", "DEF", "GK"];
const PITCH_LANES_H: Position[] = ["GK", "DEF", "MID", "FWD"];

/** The XI shown as its formation shape; each starter is a node lit by its live state. */
export function PitchMini({
  starters,
  orient = "v",
  className = "",
}: {
  starters: StarterView[];
  orient?: "v" | "h";
  className?: string;
}) {
  const byPos: Record<Position, StarterState[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const s of starters) byPos[s.role].push(s.state);
  const lanes = orient === "v" ? PITCH_LANES_V : PITCH_LANES_H;
  return (
    <div className={"vf-pitch vf-pitch-" + orient + (className ? " " + className : "")}>
      {lanes.map((pos) =>
        byPos[pos].length > 0 ? (
          <div className="vf-lane" key={pos}>
            {byPos[pos].map((st, i) => (
              <span key={i} className={"vf-node " + NODE_CLASS[st]} />
            ))}
          </div>
        ) : null,
      )}
    </div>
  );
}

export function XILegend({ counts }: { counts: StillToCome }) {
  return (
    <div className="vf-legend2">
      <span className="vf-l2">
        <span className="vf-node s-live" />
        {counts.playing} Playing
      </span>
      <span className="vf-l2">
        <span className="vf-node s-played" />
        {counts.played} Played
      </span>
      <span className="vf-l2">
        <span className="vf-node s-ytp" />
        {stillToCome(counts)} To play
      </span>
    </div>
  );
}

export function RecordBadge({ rec }: { rec: ProvisionalRecord }) {
  const games = rec.w + rec.l + rec.d;
  const lead = rec.w > rec.l ? "win" : rec.w < rec.l ? "loss" : "draw";
  return (
    <div className="vf-recbadge vf-recbadge-lg">
      <div className="vf-rec-nums">
        <span className="vf-rec-w">{rec.w}</span>
        <span className="vf-rec-dash">–</span>
        <span className="vf-rec-l">{rec.l}</span>
        {rec.d > 0 && <span className="vf-rec-d">–{rec.d}</span>}
      </div>
      <div className={"vf-rec-cap vf-rec-" + lead}>
        {lead === "win" ? "beating" : lead === "loss" ? "behind" : "level with"} {rec.w} of {games}
      </div>
    </div>
  );
}

/** Per-opponent H2H chip (the viewer vs this manager), W/L/D + signed margin. */
export function H2HResultChip({ h2h }: { h2h: NonNullable<FieldEntry["h2hVsViewer"]> }) {
  const k = h2h.result === "win" ? "W" : h2h.result === "loss" ? "L" : "D";
  const d = h2h.margin;
  return (
    <span className="vf-h2h">
      <span className={"wld wld-" + k}>{k}</span>
      <span className={"mono vf-h2h-margin " + (d > 0 ? "is-up" : d < 0 ? "is-down" : "")}>
        {d > 0 ? "+" : ""}
        {d}
      </span>
    </span>
  );
}

function matchClock(m: MatchView): { label: string; cls: string; live: boolean } {
  if (m.status === "in_progress") return { label: "LIVE", cls: "is-live", live: true };
  if (m.status === "completed") return { label: "FT", cls: "is-final", live: false };
  if (m.status === "postponed" || m.status === "abandoned")
    return { label: m.status === "postponed" ? "PPD" : "ABD", cls: "is-ytp", live: false };
  // scheduled
  const mins = m.startsInMinutes;
  const ko = mins == null ? "KO" : mins <= 0 ? "KO soon" : mins < 60 ? `KO ${mins}'` : "KO";
  return { label: ko, cls: "is-ytp", live: false };
}

export function MatchStrip({ matches }: { matches: MatchView[] }) {
  if (matches.length === 0) return null;
  return (
    <div className="vf-matchstrip">
      <span className="t-label" style={{ alignSelf: "center", whiteSpace: "nowrap" }}>
        This period
      </span>
      <div className="vf-matchstrip-scroll">
        {matches.map((m) => {
          const c = matchClock(m);
          const scored = m.status !== "scheduled";
          return (
            <div className="vf-match" key={m.matchId}>
              <div className={"vf-match-clock " + c.cls}>
                {c.live && <span className="vf-livedot" aria-hidden="true" />}
                {c.label}
              </div>
              <div className="vf-match-teams">
                <span className="vf-mt">
                  <b>{m.homeTeamName ?? "—"}</b>
                </span>
                <span className="mono vf-match-score">
                  {scored ? `${m.homeScore ?? 0}–${m.awayScore ?? 0}` : "–"}
                </span>
                <span className="vf-mt">
                  <b>{m.awayTeamName ?? "—"}</b>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Flash a number when it increases (ported verbatim from components.jsx). */
export function useScorePulse(value: number): boolean {
  const prev = useRef(value);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (value > prev.current) {
      setPulse(true);
      const id = setTimeout(() => setPulse(false), 650);
      prev.current = value;
      return () => clearTimeout(id);
    }
    prev.current = value;
    return undefined;
  }, [value]);
  return pulse;
}

function FieldRow({
  entry,
  onSelect,
  selected,
}: {
  entry: FieldEntry;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const pulse = useScorePulse(entry.points);
  const r = entry.record;
  return (
    <button
      type="button"
      className={"vf-row" + (entry.isMe ? " is-me" : "") + (selected ? " is-selected" : "")}
      onClick={() => onSelect(entry.managerId)}
    >
      <div className="vf-c-rank mono">{entry.rank}</div>
      <div className="vf-c-mgr">
        <Avatar name={entry.displayName} isMe={entry.isMe} />
        <div className="vf-mgr-name">
          <b>{entry.isMe ? "You" : entry.displayName}</b>
          <span className="t-micro text-tertiary">
            vs field {r.w}-{r.l}
            {r.d ? "-" + r.d : ""}
          </span>
        </div>
      </div>
      <div className={"vf-c-score mono" + (pulse ? " score-pulse" : "")}>{entry.points}</div>
      <div className="vf-c-xi">
        <PitchMini starters={entry.starters} orient="h" className="vf-pitch-table" />
      </div>
      <div className="vf-c-ytp">
        <span className="vf-ytp-num mono">{stillToCome(entry.counts)}</span>
        <span className="vf-ytp-lab">to play</span>
      </div>
      <div className="vf-c-h2h">
        {entry.h2hVsViewer ? (
          <H2HResultChip h2h={entry.h2hVsViewer} />
        ) : (
          <span className="text-tertiary t-caption">—</span>
        )}
      </div>
    </button>
  );
}

export function FieldTable({
  field,
  onSelect,
  selected,
}: {
  field: FieldEntry[];
  onSelect: (id: string) => void;
  selected: string | null;
}) {
  return (
    <div className="vf-table">
      <div className="vf-thead">
        <div className="vf-c-rank">#</div>
        <div className="vf-c-mgr">Manager</div>
        <div className="vf-c-score">Points</div>
        <div className="vf-c-xi">Lineup</div>
        <div className="vf-c-ytp">Players left</div>
        <div className="vf-c-h2h">vs You</div>
      </div>
      <div className="vf-tbody">
        {field.map((e) => (
          <FieldRow
            key={e.managerId}
            entry={e}
            onSelect={onSelect}
            selected={selected === e.managerId}
          />
        ))}
      </div>
    </div>
  );
}

/** The "you vs the field" hero — running score, rank, provisional record, still-to-come, swing. */
export function YouVsField({ field, periodLabel }: { field: FieldEntry[]; periodLabel: string }) {
  const me = field.find((e) => e.isMe);
  const pulse = useScorePulse(me?.points ?? 0);
  if (!me) return null;
  const n = field.length;
  const myIdx = field.findIndex((e) => e.isMe);
  const above = myIdx > 0 ? field[myIdx - 1] : undefined; // nearest manager I'm chasing
  const below = myIdx < field.length - 1 ? field[myIdx + 1] : undefined; // nearest chasing me
  return (
    <div className="vf-hero card">
      <div className="t-label">You vs the field · {periodLabel}</div>

      <div className="vf-hero-sec first vf-hero-headline">
        <div>
          <div className={"vf-hero-score-num mono" + (pulse ? " score-pulse" : "")}>
            {me.points}
            <span style={{ fontSize: 18, fontWeight: 700, marginLeft: 5 }}>pts</span>
          </div>
          <span className="vf-hero-score-lab">points this period</span>
        </div>
        <div className="vf-hero-rankchip">
          <span className="vf-hero-rank-num display">{me.rank}</span>
          <span className="vf-hero-rank-sub">rank · of {n}</span>
        </div>
      </div>

      <div className="vf-hero-sec vf-hero-recsec">
        <RecordBadge rec={me.record} />
        <p className="vf-hero-recnote t-caption text-secondary">
          Scored against <b>all {Math.max(0, n - 1)}</b> managers at once — this <b>W-L</b> is your
          record for the period; ties break on points.
        </p>
      </div>

      <div className="vf-hero-sec">
        <div className="vf-hero-pitchsec">
          <PitchMini starters={me.starters} orient="v" className="vf-pitch-hero" />
          <div className="vf-pitch-side">
            <div className="vf-ps-stat">
              <span className="vf-ps-num">{stillToCome(me.counts)}</span>
              <span className="vf-ps-lab">still to come</span>
            </div>
            <div className="vf-ps-stat">
              <span className="vf-ps-num is-live">{me.counts.playing}</span>
              <span className="vf-ps-lab">playing now</span>
            </div>
            <div className="vf-ps-stat">
              <span className="vf-ps-num">{me.counts.played}</span>
              <span className="vf-ps-lab">played</span>
            </div>
          </div>
        </div>
        <XILegend counts={me.counts} />
        <p className="t-caption text-tertiary" style={{ margin: "10px 0 0" }}>
          {stillToCome(me.counts) > 0 ? (
            <>
              Your <b style={{ color: "var(--text-secondary)" }}>{stillToCome(me.counts)}</b>{" "}
              still-to-play are pending points — and stay swappable until each kicks off.
            </>
          ) : (
            <>Every starter has played — your period score is locked in.</>
          )}
        </p>
      </div>

      <div className="vf-hero-sec last vf-swing">
        {above ? (
          <div className="vf-swing-row">
            <span className="vf-swing-dir">▲ catch</span>
            <b className="t-sm vf-swing-name">{above.displayName}</b>
            <span className="mono vf-swing-gap">+{above.points - me.points}</span>
          </div>
        ) : (
          <div className="vf-swing-row vf-swing-top">🏆 You lead the field</div>
        )}
        {below && (
          <div className="vf-swing-row">
            <span className="vf-swing-dir vf-swing-down">▼ holding off</span>
            <b className="t-sm vf-swing-name">{below.displayName}</b>
            <span className="mono vf-swing-gap is-down">{below.points - me.points}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Per-opponent H2H detail: scoreline + verdict + each side's still-to-play + the two XI shapes. */
/** Mini status pill for an XI-list row (color + word, per the functional-color rule). */
function StarterStatePill({ state }: { state: StarterState }) {
  if (state === "playing")
    return (
      <span className="pill pill-live vf-pill-mini">
        <span className="vf-livedot" aria-hidden="true" />
        Playing
      </span>
    );
  if (state === "played") return <span className="pill pill-locked vf-pill-mini">Played</span>;
  return <span className="pill pill-ytp vf-pill-mini">To play</span>;
}

/** One starter row in the H2H XI list. Played/locked → a button that opens the box-score modal;
 *  to-play (match not kicked off) → an inert row (vsfield is read-only — no swap/drag, no forfeit). */
function XINode({
  starter,
  onOpenPlayer,
}: {
  starter: StarterView;
  onOpenPlayer: (playerId: string) => void;
}) {
  const iso2 = starter.nation ? toIso2(starter.nation) : null;
  // Tappable once his match has kicked off (playing/played) or lock-on-play has stamped him.
  const tappable = starter.state !== "yet-to-play" || starter.locked;
  const body = (
    <>
      <Pos p={starter.role} />
      {iso2 && <Flag code={iso2} label={starter.nation ?? undefined} />}
      <span className="vf-xi-name">{starter.name}</span>
      <StarterStatePill state={starter.state} />
    </>
  );
  if (!tappable) {
    return (
      <div className="vf-xi-row is-inert" aria-disabled="true">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="vf-xi-row"
      onClick={() => onOpenPlayer(starter.playerId)}
      title={`${starter.name} — tap for score breakdown`}
    >
      {body}
    </button>
  );
}

/** A manager's full XI as identifiable, tappable rows for the per-opponent H2H drill-in. */
export function XIList({
  starters,
  onOpenPlayer,
}: {
  starters: StarterView[];
  onOpenPlayer: (playerId: string) => void;
}) {
  if (starters.length === 0) return null;
  return (
    <div className="vf-xi-list">
      {starters.map((s) => (
        <XINode key={s.playerId} starter={s} onOpenPlayer={onOpenPlayer} />
      ))}
    </div>
  );
}

export function H2HDetail({
  field,
  oppId,
  onClose,
  onOpenPlayer,
}: {
  field: FieldEntry[];
  oppId: string;
  onClose: () => void;
  /** Opens the info-only box-score modal for a played/locked player (own XI or opponent's). */
  onOpenPlayer: (playerId: string) => void;
}) {
  const me = field.find((e) => e.isMe);
  const opp = field.find((e) => e.managerId === oppId);
  if (!me || !opp || opp.isMe) return null;
  const diff = me.points - opp.points;
  return (
    <div className="vf-h2hwrap card">
      <div className="vf-h2h-head">
        <div className="t-label">Head-to-head</div>
        <button
          className="btn btn-quiet btn-sm"
          onClick={onClose}
          style={{ minHeight: 28, padding: "2px 8px" }}
        >
          ✕ close
        </button>
      </div>
      <div className="vf-h2h-scoreline">
        <span className="vf-h2h-side">
          <b>You</b>
          <span className="mono">{me.points}</span>
        </span>
        <span
          className={"vf-h2h-verdict " + (diff > 0 ? "is-win" : diff < 0 ? "is-loss" : "is-draw")}
        >
          {diff > 0 ? "WINNING" : diff < 0 ? "LOSING" : "LEVEL"}{" "}
          <span className="mono">
            {diff > 0 ? "+" : ""}
            {diff}
          </span>
        </span>
        <span className="vf-h2h-side">
          <b>{opp.displayName}</b>
          <span className="mono">{opp.points}</span>
        </span>
      </div>
      <div className="vf-h2h-upside t-caption">
        <span>
          <b style={{ color: "var(--text-primary)" }}>{stillToCome(me.counts)}</b> of yours still to
          play
        </span>
        <span>
          <b style={{ color: "var(--text-primary)" }}>{stillToCome(opp.counts)}</b> of theirs still
          to play
        </span>
      </div>
      {/* XI shapes give the at-a-glance played / playing / still-to-come picture; the named lists
          below them make each starter identifiable + tappable. A played/locked player opens the
          info-only box-score modal (per-player points are fetched on demand by that modal — they are
          intentionally NOT in this snapshot; Theme F). No forfeit, no swap/drag: vsfield is read-only. */}
      <div className="vf-h2h-cols">
        <div className="vf-h2h-col">
          <div className="vf-h2h-colhead">
            <Avatar name={me.displayName} isMe />
            <b>You</b>
            <span className="mono vf-h2h-coltot">{me.points}</span>
          </div>
          <PitchMini starters={me.starters} orient="v" className="vf-pitch-mini" />
          <XIList starters={me.starters} onOpenPlayer={onOpenPlayer} />
        </div>
        <div className="vf-h2h-col">
          <div className="vf-h2h-colhead">
            <Avatar name={opp.displayName} />
            <b>{opp.displayName}</b>
            <span className="mono vf-h2h-coltot">{opp.points}</span>
          </div>
          <PitchMini starters={opp.starters} orient="v" className="vf-pitch-mini" />
          <XIList starters={opp.starters} onOpenPlayer={onOpenPlayer} />
        </div>
      </div>
    </div>
  );
}

/** The season power-record standings (record + total points + seed, from `standing`). */
export function SeasonTable({ season }: { season: SeasonEntry[] }) {
  return (
    <div className="vf-season">
      <div className="vf-season-note alert alert-info">
        <div>
          <b>Power record.</b> All-play-all every period: your weekly W-L is your result against
          every other manager that period. Season standings rank by total wins; ties break on total
          points.
        </div>
      </div>
      <table className="dtable vf-seasontable">
        <thead>
          <tr>
            <th style={{ width: 36 }}>#</th>
            <th>Manager</th>
            <th className="num">Record</th>
            <th className="num">Win%</th>
            <th className="num">Points</th>
            <th>By period</th>
          </tr>
        </thead>
        <tbody>
          {season.map((s) => (
            <tr key={s.managerId} className={s.isMe ? "row-me" : ""}>
              <td className="mono">{s.seed ?? s.rank}</td>
              <td>
                <div className="vf-st-mgr">
                  <Avatar name={s.displayName} isMe={s.isMe} />
                  <b>{s.isMe ? "You" : s.displayName}</b>
                </div>
              </td>
              <td className="num">
                <b className="mono">
                  {s.allPlayAllW}-{s.allPlayAllL}
                </b>
              </td>
              <td className="num mono">{Math.round(s.winPct * 100)}%</td>
              <td className="num mono">{s.totalPoints}</td>
              <td>
                <div className="vf-st-periods">
                  {s.byPeriod.map((p, pi) => {
                    const k = p.w > p.l ? "W" : p.w < p.l ? "L" : "D";
                    const isLive = pi === s.byPeriod.length - 1;
                    return (
                      <span key={p.periodId} className={"vf-st-chip" + (isLive ? " is-live" : "")}>
                        <span className={"wld wld-" + k}>{k}</span>
                        <span className="mono t-micro">{p.points}</span>
                      </span>
                    );
                  })}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
