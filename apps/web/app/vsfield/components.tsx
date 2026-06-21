"use client";
/**
 * Presentational components for the live "vs the field" screen — the Direction-A "split cockpit"
 * re-skin. Ported from design/design_handoff_vs_the_field/vsfield2/{directionA,shared,mobile}.jsx and
 * adapted to the server-computed `VsFieldView` (@app/vsfield). Mapping:
 *   Leaderboard/LbRow ← directionA.jsx (the prominent left rail; the per-opponent W/L/D chip uses the
 *   snapshot's `h2hVsViewer`, not a client recompute) · XIPanel/XIPitch/XIToken ← directionA.jsx (the
 *   Set-Lineup-style flag-kit jersey pitches; kit backgrounds from kitOf.ts) · CompareBand ←
 *   shared.jsx (Facts 1+2 only — see the TODO(F2) inside) · YouVsField ← shared.jsx `.v2-agg` ·
 *   SeasonTable ← shared.jsx `.v2-season` · MatchStrip ← mobile.jsx/v2.css `.v2-match` · MaYou/MaRow/
 *   MaCompare/MaH2H ← mobile.jsx (the net-new phone layout) · Pos/Avatar/ConnPill/
 *   RecordBadge/useScorePulse kept from the prior port. (PitchMini/XILegend — the abstract dot-node
 *   self pitch + dot legend — were removed once YouVsField adopted the detailed jersey XIPitch.
 *   YouVsField is the self/field detail view on BOTH desktop and mobile, so the swap covers phones too;
 *   MaYou is only the compact standings-list hero and never carried a pitch.)
 *
 * CLASS-NAMESPACE NOTE: the design reuses /lineup's `.sl-tok`/`.sl-tok-name` names for the jersey
 * tokens, but Next.js route CSS persists across client navigation, so both stylesheets can be live at
 * once and lineup.css already owns those classes with different rules. The vsfield token therefore
 * uses `.sl-tok-jersey` as its base class (no bare `.sl-tok`) and vsfield-unique inner names
 * (`.sl-jersey`, `.sl-jersey-name`, and the points chip `.sl-jersey-score`/`.sl-jersey-pts` — renamed
 * from the design's bare lineup-colliding score class for the same reason), all scoped under
 * `.da-pitch` in vsfield.css.
 *
 * Per-player points (Prompt 41 / path a): `StarterView` now carries `points` (the real
 * `score_player_match.points`, composed SERVER-SIDE into the snapshot — the browser's direct read scope
 * is unchanged), so each token shows a points CHIP under the jersey (the number is the headline) instead
 * of a worded state label; lock-on-play reads through the single live dot. Tapping a played/locked player
 * still opens the box-score modal for the full breakdown (unchanged). Deliberately NOT ported: the
 * FeedTicker (see the no-op stub below) and Direction B (`.db-*` — not chosen).
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
import type { BenchPlayerView, ManagerBench } from "@/src/vsfield/benches";
import { kitOf } from "./kitOf";

// "historical" (T11) is set when a PRIOR matchday is selected: the view is static (no live subscription),
// so the pill reads "Final" rather than a connection state.
export type ConnState = "live" | "reconnecting" | "stale" | "loading" | "historical";

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
  if (state === "historical")
    return (
      <span className="pill pill-neutral vf-conn">
        <span aria-hidden="true">✓</span>Final
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
    <div className="v2-matchstrip">
      <span className="t-label" style={{ alignSelf: "center", whiteSpace: "nowrap" }}>
        This period
      </span>
      <div className="v2-matchstrip-scroll">
        {matches.map((m) => {
          const c = matchClock(m);
          const scored = m.status !== "scheduled";
          return (
            <div className="v2-match" key={m.matchId}>
              <div className={"v2-match-clock " + c.cls}>
                {c.live && <span className="vf-livedot" aria-hidden="true" />}
                {c.label}
              </div>
              <div className="v2-match-teams">
                <span className="v2-mt">
                  <b>{m.homeTeamName ?? "—"}</b>
                </span>
                <span className="mono v2-match-score">
                  {scored ? `${m.homeScore ?? 0}–${m.awayScore ?? 0}` : "–"}
                </span>
                <span className="v2-mt">
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

/* ───────────────────────────── leaderboard (left rail, Direction A) ───────────────────────────── */

/** Per-opponent W/L/D + signed margin off the snapshot's `h2hVsViewer` (the viewer vs this manager). */
function LbWld({ h2h }: { h2h: NonNullable<FieldEntry["h2hVsViewer"]> }) {
  const k = h2h.result === "win" ? "W" : h2h.result === "loss" ? "L" : "D";
  const d = h2h.margin;
  return (
    <span className={"da-lb-wld " + k}>
      {k}
      {d > 0 ? " +" + d : d < 0 ? " " + d : ""}
    </span>
  );
}

function LbRow({
  entry,
  selected,
  onSelect,
  dimLive,
}: {
  entry: FieldEntry;
  selected: boolean;
  onSelect: (id: string) => void;
  dimLive: boolean;
}) {
  const pulse = useScorePulse(entry.points);
  const left = stillToCome(entry.counts);
  return (
    <button
      type="button"
      className={"da-lb-row" + (entry.isMe ? " is-me" : "") + (selected ? " is-sel" : "")}
      onClick={() => onSelect(entry.managerId)}
    >
      <span className="da-lb-rk mono">{entry.rank}</span>
      <Avatar name={entry.displayName} isMe={entry.isMe} />
      <span className="da-lb-name">
        <b>{entry.isMe ? "You" : entry.displayName}</b>
        <span className="da-lb-sub">
          {entry.counts.playing > 0 ? (
            <em className={"da-lb-live" + (dimLive ? " is-dim" : "")}>
              <span className="vf-livedot" aria-hidden="true" />
              {entry.counts.playing} live · {left} left
            </em>
          ) : (
            <>{left} to play</>
          )}
        </span>
      </span>
      <span className="da-lb-right">
        <span className={"da-lb-pts mono" + (pulse ? " score-pulse" : "")}>{entry.points}</span>
        {entry.isMe ? (
          <span className="da-lb-wld-self">you</span>
        ) : entry.h2hVsViewer ? (
          <LbWld h2h={entry.h2hVsViewer} />
        ) : (
          <span className="text-tertiary t-micro">—</span>
        )}
      </span>
    </button>
  );
}

export function Leaderboard({
  field,
  effSel,
  onSelect,
  dimLive,
}: {
  field: FieldEntry[];
  /** `"field"` (the aggregate view) or an opponent's managerId. */
  effSel: string;
  onSelect: (id: string) => void;
  dimLive: boolean;
}) {
  const me = field.find((e) => e.isMe);
  return (
    <div className="da-lb">
      <button
        type="button"
        className={"da-lb-fieldbtn" + (effSel === "field" ? " is-sel" : "")}
        onClick={() => onSelect("field")}
        title="You vs the whole field"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
        <span>
          <b>You vs the field</b>
          <span>
            {me
              ? `record ${me.record.w}–${me.record.l}–${me.record.d} · rank ${me.rank}`
              : "the aggregate view"}
          </span>
        </span>
      </button>
      <div className="da-lb-head">
        <span className="t-label">Standings</span>
        <span className="t-micro text-tertiary">live · pts</span>
      </div>
      {field.map((e) => (
        <LbRow
          key={e.managerId}
          entry={e}
          selected={effSel === e.managerId}
          onSelect={onSelect}
          dimLive={dimLive}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────── XI pitch — flag-kit jersey tokens (Direction A) ─────────────────────────── */

/** "4-3-3"-style formation label derived from the XI's role counts (the snapshot has no formation field). */
function formationOf(starters: StarterView[]): string {
  const n: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const s of starters) n[s.role] += 1;
  return `${n.DEF}-${n.MID}-${n.FWD}`;
}

/**
 * One starter as a flag-kit jersey token, with a points chip in a fixed slot under it (Prompt 41 /
 * handoff vsfield_points — the NUMBER is the headline). Three chip states keyed off `starter.state`:
 * playing = solid dark pill + red pulsing dot + `N` PTS · played = the SAME dark pill + `N` PTS, no dot
 * (the dot is the sole live↔played differentiator; played kits are NOT dimmed) · yet-to-play = dashed
 * pill, "– TO PLAY", no number. `points` is the REAL `score_player_match.points` carried in the
 * server-composed snapshot (path a). Tapping a played/locked player opens the box-score modal (the full
 * breakdown, unchanged); to-play tokens are inert (vsfield is read-only). `dimLive` (stale feed)
 * suppresses the live dot so a frozen feed doesn't imply live action.
 */
function XIToken({
  starter,
  onOpenPlayer,
  dimLive,
}: {
  starter: StarterView;
  onOpenPlayer: (playerId: string) => void;
  dimLive: boolean;
}) {
  const cls = "sl-tok-jersey " + NODE_CLASS[starter.state] + (dimLive ? " is-dim" : "");
  const tappable = starter.state !== "yet-to-play" || starter.locked;
  // Chip state class mirrors the node class: s-ytp | s-live | s-played.
  const chipState = NODE_CLASS[starter.state];
  const body = (
    <>
      <span
        className="sl-jersey"
        style={{ background: kitOf(starter.nation) }}
        aria-hidden="true"
      />
      <span className="sl-jersey-name">{starter.name}</span>
      {starter.state === "yet-to-play" ? (
        <span className="sl-jersey-score s-ytp">
          <span className="sl-jersey-dash" aria-hidden="true">
            –
          </span>
          <span className="sl-jersey-pts">to play</span>
        </span>
      ) : (
        <span className={"sl-jersey-score " + chipState + (starter.points === 0 ? " is-zero" : "")}>
          {starter.state === "playing" && !dimLive && (
            <span className="sl-score-dot" aria-hidden="true" />
          )}
          <b>{starter.points}</b>
          <span className="sl-jersey-pts">pts</span>
        </span>
      )}
    </>
  );
  if (!tappable) {
    return (
      <div className={cls + " is-inert"} aria-disabled="true" title={starter.name}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      onClick={() => onOpenPlayer(starter.playerId)}
      title={`${starter.name} — tap for score breakdown`}
    >
      {body}
    </button>
  );
}

/** A full XI as jersey tokens in formation lanes over the turf, with pitch markings. */
export function XIPitch({
  starters,
  onOpenPlayer,
  dimLive,
  mob,
}: {
  starters: StarterView[];
  onOpenPlayer: (playerId: string) => void;
  dimLive: boolean;
  mob?: boolean;
}) {
  const byPos: Record<Position, StarterView[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const s of starters) byPos[s.role].push(s);
  return (
    <div className={"da-pitch" + (mob ? " da-pitch-mob" : "")}>
      <div className="da-pl" aria-hidden="true">
        <span className="da-pl-box da-pl-box-top" />
        <span className="da-pl-mid" />
        <span className="da-pl-circle" />
        <span className="da-pl-box da-pl-box-bot" />
      </div>
      <div className="da-pitch-lanes">
        {PITCH_LANES_V.map((pos) =>
          byPos[pos].length > 0 ? (
            <div className={"da-lane da-lane-" + pos} key={pos}>
              {byPos[pos].map((s) => (
                <XIToken
                  key={s.playerId}
                  starter={s}
                  onOpenPlayer={onOpenPlayer}
                  dimLive={dimLive}
                />
              ))}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

export function XIPanel({
  entry,
  onOpenPlayer,
  dimLive,
}: {
  entry: FieldEntry;
  onOpenPlayer: (playerId: string) => void;
  dimLive: boolean;
}) {
  const pulse = useScorePulse(entry.points);
  return (
    <div className={"da-xi" + (entry.isMe ? " is-me" : "")}>
      <div className="da-xi-hd">
        <Avatar name={entry.displayName} isMe={entry.isMe} />
        <b>{entry.isMe ? "You" : entry.displayName}</b>
        <span className="da-team-form">{formationOf(entry.starters)}</span>
        <span className={"da-team-tot mono" + (pulse ? " score-pulse" : "")}>{entry.points}</span>
      </div>
      <XIPitch starters={entry.starters} onOpenPlayer={onOpenPlayer} dimLive={dimLive} />
    </div>
  );
}

/* ─────────────────────────── bench (substitutes under the H2H XI) ─────────────────────────── */

/**
 * One bench player as a compact off-pitch token: a small flag-kit jersey swatch (the SAME `kitOf` kit
 * vocabulary the XI tokens use) + name + a `Pos` position badge (both existing surface components). Bench
 * players don't score in fantasy, so this is INFO-ONLY — no points chip, no live state, not tappable
 * (vsfield is read-only). It sits on a plain surface (not the pitch turf) so it reads as "on the bench".
 */
function BenchToken({ player }: { player: BenchPlayerView }) {
  return (
    <div className="vf-bench-tok" title={player.name}>
      <span
        className="vf-bench-jersey"
        style={{ background: kitOf(player.nation) }}
        aria-hidden="true"
      />
      <span className="vf-bench-meta">
        <span className="vf-bench-name">{player.name}</span>
        <Pos p={player.role} />
      </span>
    </div>
  );
}

/**
 * One side's bench (substitutes) under the head-to-head XI. `label` names the side ("You" / the
 * opponent); an empty bench shows a muted note so the two-up desktop columns stay aligned.
 */
export function BenchStrip({
  label,
  players,
  isMe,
}: {
  label: string;
  players: BenchPlayerView[];
  isMe?: boolean;
}) {
  return (
    <div className={"vf-bench" + (isMe ? " is-me" : "")}>
      <div className="vf-bench-hd">
        <span className="t-label">Bench</span>
        <span className="vf-bench-who">{label}</span>
      </div>
      {players.length === 0 ? (
        <p className="vf-bench-empty t-caption text-tertiary">No substitutes named.</p>
      ) : (
        <div className="vf-bench-list">
          {players.map((p) => (
            <BenchToken key={p.playerId} player={p} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Resolve one manager's bench from the snapshot's `benches` list (empty array when none present). */
export function benchFor(benches: ManagerBench[], managerId: string): BenchPlayerView[] {
  return benches.find((b) => b.managerId === managerId)?.players ?? [];
}

/* ─────────────────────────────── compare band (ranked facts) ─────────────────────────────── */

/**
 * The H2H compare band — the user's ranked facts. Fact 1 = the live margin (primary band), Fact 2 =
 * upside still to come.
 * Fact 3 (player-by-player lineup edge) is still deferred — NOT this prompt. As of Prompt 41 the data it
 * needs (per-player `points`) IS now in the snapshot (no longer blocked on Theme F / the modal-only
 * rule), so building Fact 3 is a future scope step, not a reopening; this band still renders Facts 1 + 2.
 */
export function CompareBand({ me, opp }: { me: FieldEntry; opp: FieldEntry }) {
  const diff = me.points - opp.points;
  const k = diff > 0 ? "win" : diff < 0 ? "loss" : "draw";
  const word = diff > 0 ? "WINNING" : diff < 0 ? "LOSING" : "LEVEL";
  const mineLeft = stillToCome(me.counts);
  const theirsLeft = stillToCome(opp.counts);
  const edge = mineLeft - theirsLeft;
  return (
    <div className="v2-band">
      <div className="v2-band-primary">
        <div className="v2-bp-side">
          <Avatar name={me.displayName} isMe />
          <div className="v2-bp-id">
            <b>You</b>
            <span className="v2-bp-meta">
              rank {me.rank} · {me.record.w}–{me.record.l}–{me.record.d} vs field
            </span>
          </div>
          <span className="v2-bp-score mono">{me.points}</span>
        </div>
        <div className="v2-bp-mid">
          <span className={"v2-bp-verdict is-" + k}>{word}</span>
          <span className={"v2-bp-margin mono is-" + k}>
            {diff > 0 ? "+" : ""}
            {diff}
          </span>
          <span className="t-micro">live margin</span>
        </div>
        <div className="v2-bp-side right">
          <Avatar name={opp.displayName} />
          <div className="v2-bp-id">
            <b>{opp.displayName}</b>
            <span className="v2-bp-meta">
              rank {opp.rank} · {opp.record.w}–{opp.record.l}–{opp.record.d} vs field
            </span>
          </div>
          <span className="v2-bp-score mono">{opp.points}</span>
        </div>
      </div>
      <div className="v2-band-facts">
        <div className="v2-fact">
          <span className="v2-fact-rank">2</span>
          <div className="v2-fact-body">
            <span className="v2-fact-lab">Upside still to come</span>
            <span className="v2-fact-val">
              <b className="pos">{mineLeft}</b> of yours yet to play · they have <b>{theirsLeft}</b>
              {edge !== 0 && (
                <>
                  {" "}
                  ·{" "}
                  <span className={edge > 0 ? "up" : "down"}>
                    {edge > 0 ? "+" : ""}
                    {edge} player edge
                  </span>
                </>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── you vs the field (aggregate) ─────────────────────────────── */

/** The "you vs the field" aggregate — running score, rank, provisional record, still-to-come, swing. */
export function YouVsField({
  field,
  periodLabel,
  onOpenPlayer,
  dimLive,
}: {
  field: FieldEntry[];
  periodLabel: string;
  onOpenPlayer: (playerId: string) => void;
  dimLive: boolean;
}) {
  const me = field.find((e) => e.isMe);
  const pulse = useScorePulse(me?.points ?? 0);
  if (!me) return null;
  const n = field.length;
  const myIdx = field.findIndex((e) => e.isMe);
  const above = myIdx > 0 ? field[myIdx - 1] : undefined; // nearest manager I'm chasing
  const below = myIdx < field.length - 1 ? field[myIdx + 1] : undefined; // nearest chasing me
  return (
    <div className="v2-agg card">
      <div className="t-label">You vs the field · {periodLabel}</div>

      <div className="v2-agg-sec first v2-agg-head">
        <div>
          <div className={"v2-agg-scorenum mono" + (pulse ? " score-pulse" : "")}>
            {me.points}
            <span style={{ fontSize: 18, fontWeight: 700, marginLeft: 5 }}>pts</span>
          </div>
          <span className="v2-agg-scorelab">points this period</span>
        </div>
        <div className="v2-agg-rank">
          <b className="display">{me.rank}</b>
          <span>rank · of {n}</span>
        </div>
      </div>

      <div className="v2-agg-sec v2-agg-recsec">
        <RecordBadge rec={me.record} />
        <p className="v2-agg-recnote t-caption text-secondary">
          Scored against <b>all {Math.max(0, n - 1)}</b> managers at once — this <b>W-L</b> is your
          record for the period; ties break on points.
        </p>
      </div>

      <div className="v2-agg-sec">
        <div className="v2-agg-pitchsec">
          <div className="v2-agg-xi">
            <XIPitch starters={me.starters} onOpenPlayer={onOpenPlayer} dimLive={dimLive} />
          </div>
          <div className="v2-agg-pside">
            <div className="v2-ps">
              <span className="v2-ps-num">{stillToCome(me.counts)}</span>
              <span className="v2-ps-lab">still to come</span>
            </div>
            <div className="v2-ps">
              <span className="v2-ps-num is-live">{me.counts.playing}</span>
              <span className="v2-ps-lab">playing now</span>
            </div>
            <div className="v2-ps">
              <span className="v2-ps-num">{me.counts.played}</span>
              <span className="v2-ps-lab">played</span>
            </div>
          </div>
        </div>
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

      <div className="v2-agg-sec last v2-agg-swing">
        {above ? (
          <div className="v2-swing-row">
            <span className="v2-swing-dir">▲ catch</span>
            <b className="t-sm v2-swing-name">{above.displayName}</b>
            <span className="mono v2-swing-gap">+{above.points - me.points}</span>
          </div>
        ) : (
          <div className="v2-swing-row v2-swing-top">🏆 You lead the field</div>
        )}
        {below && (
          <div className="v2-swing-row">
            <span className="v2-swing-dir v2-swing-down">▼ holding off</span>
            <b className="t-sm v2-swing-name">{below.displayName}</b>
            <span className="mono v2-swing-gap is-down">{below.points - me.points}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────── feed ticker (deferred) ─────────────────────────────────── */

/** No-op stub. TODO: FeedTicker needs event-level feed not in VsFieldView. */
export function FeedTicker() {
  return null;
}

/* ─────────────────────────────────────── season table ─────────────────────────────────────── */

/** The season power-record standings (record + total points + seed, from `standing`). */
export function SeasonTable({ season }: { season: SeasonEntry[] }) {
  return (
    <div className="v2-season">
      <div className="v2-season-note alert alert-info">
        <div>
          <b>Power record.</b> All-play-all every period: your weekly W-L is your result against
          every other manager that period. Season standings rank by total wins; ties break on total
          points.
        </div>
      </div>
      <table className="dtable">
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
                <div className="v2-st-mgr">
                  <Avatar name={s.displayName} isMe={s.isMe} />
                  <b>{s.isMe ? "You" : s.displayName}</b>
                </div>
              </td>
              <td className="num">
                <b className="mono">
                  {s.allPlayAllW}-{s.allPlayAllL}-{s.allPlayAllD}
                </b>
              </td>
              <td className="num mono">{Math.round(s.winPct * 100)}%</td>
              <td className="num mono">{s.totalPoints}</td>
              <td>
                <div className="v2-st-periods">
                  {s.byPeriod.map((p, pi) => {
                    const k = p.w > p.l ? "W" : p.w < p.l ? "L" : "D";
                    const isLive = pi === s.byPeriod.length - 1;
                    return (
                      <span key={p.periodId} className={"v2-st-chip" + (isLive ? " is-live" : "")}>
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

/* ──────────────────────────────── mobile (Direction A on phone) ──────────────────────────────── */

/** Compact "you" hero at the top of the mobile leaderboard. */
export function MaYou({ field }: { field: FieldEntry[] }) {
  const me = field.find((e) => e.isMe);
  const pulse = useScorePulse(me?.points ?? 0);
  if (!me) return null;
  return (
    <div className="ma-you">
      <div className="ma-you-row">
        <div className={"ma-you-score" + (pulse ? " score-pulse" : "")}>
          <span className="mono">{me.points}</span>
          <span className="ma-you-lab">pts this period</span>
        </div>
        <div className="ma-you-rank">
          <b className="mono">{me.rank}</b>
          <span>rank · of {field.length}</span>
        </div>
      </div>
      <div className="ma-you-rec">
        <RecordBadge rec={me.record} />
        <span className="t-caption text-secondary">
          scored vs all {Math.max(0, field.length - 1)} ·{" "}
          <b style={{ color: "var(--text-primary)" }}>{stillToCome(me.counts)}</b> still to come
        </span>
      </div>
    </div>
  );
}

function MaRow({
  entry,
  onTap,
  dimLive,
}: {
  entry: FieldEntry;
  onTap: (id: string) => void;
  dimLive: boolean;
}) {
  const pulse = useScorePulse(entry.points);
  return (
    <button
      type="button"
      className={"ma-row" + (entry.isMe ? " is-me" : "")}
      onClick={() => onTap(entry.managerId)}
    >
      <span className="ma-row-rk mono">{entry.rank}</span>
      <Avatar name={entry.displayName} isMe={entry.isMe} />
      <span className="ma-row-name">
        <b>{entry.isMe ? "You" : entry.displayName}</b>
        <span className="ma-row-sub">
          {entry.counts.playing > 0 && (
            <span className={"ma-livetag" + (dimLive ? " is-dim" : "")}>
              <span className="vf-livedot" aria-hidden="true" />
              {entry.counts.playing} live
            </span>
          )}
          <span className="ma-ytptag">{stillToCome(entry.counts)} to play</span>
        </span>
      </span>
      <span className="ma-row-right">
        <span className={"ma-row-pts mono" + (pulse ? " score-pulse" : "")}>{entry.points}</span>
        {entry.isMe ? (
          <span className="da-lb-wld-self">you</span>
        ) : entry.h2hVsViewer ? (
          <span
            className={
              "ma-row-wld " +
              (entry.h2hVsViewer.result === "win"
                ? "W"
                : entry.h2hVsViewer.result === "loss"
                  ? "L"
                  : "D")
            }
          >
            {entry.h2hVsViewer.result === "win"
              ? "W"
              : entry.h2hVsViewer.result === "loss"
                ? "L"
                : "D"}
            {entry.h2hVsViewer.margin > 0
              ? " +" + entry.h2hVsViewer.margin
              : entry.h2hVsViewer.margin < 0
                ? " " + entry.h2hVsViewer.margin
                : ""}
          </span>
        ) : (
          <span className="text-tertiary t-micro">—</span>
        )}
      </span>
    </button>
  );
}

/** The mobile standings (leaderboard-first home): you-hero + field button + tappable rows. */
export function MaStandings({
  field,
  onSelect,
  dimLive,
}: {
  field: FieldEntry[];
  onSelect: (id: string) => void;
  dimLive: boolean;
}) {
  const me = field.find((e) => e.isMe);
  return (
    <>
      <MaYou field={field} />
      <button type="button" className="ma-fieldbtn" onClick={() => onSelect("field")}>
        <svg
          viewBox="0 0 24 24"
          width="17"
          height="17"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
        <span>
          <b>You vs the whole field</b>
          <span>
            {me
              ? `record ${me.record.w}–${me.record.l}–${me.record.d} · rank ${me.rank}`
              : "the aggregate view"}
          </span>
        </span>
        <span className="ma-chev" aria-hidden="true">
          ›
        </span>
      </button>
      <div className="ma-listlab">
        <span className="t-label">Standings · tap to compare</span>
        <span className="t-micro text-tertiary">live · pts</span>
      </div>
      <div className="ma-list">
        {field.map((e) => (
          <MaRow key={e.managerId} entry={e} onTap={onSelect} dimLive={dimLive} />
        ))}
      </div>
      <FeedTicker />
    </>
  );
}

/** Condensed compare band for the phone (same Facts 1+2; same TODO(F2) deferral as CompareBand). */
function MaCompare({ me, opp }: { me: FieldEntry; opp: FieldEntry }) {
  const diff = me.points - opp.points;
  const k = diff > 0 ? "win" : diff < 0 ? "loss" : "draw";
  const word = diff > 0 ? "WINNING" : diff < 0 ? "LOSING" : "LEVEL";
  const mineLeft = stillToCome(me.counts);
  const theirsLeft = stillToCome(opp.counts);
  const edge = mineLeft - theirsLeft;
  return (
    <div className="ma-cmp">
      <div className="ma-cmp-top">
        <div className="ma-cmp-side">
          <Avatar name={me.displayName} isMe />
          <div className="ma-cmp-id">
            <b>You</b>
            <span>
              {me.record.w}–{me.record.l}–{me.record.d} · rk {me.rank}
            </span>
          </div>
        </div>
        <div className="ma-cmp-mid">
          <span className={"ma-cmp-verdict is-" + k}>{word}</span>
          <span className={"ma-cmp-margin mono is-" + k}>
            {diff > 0 ? "+" : ""}
            {diff}
          </span>
        </div>
        <div className="ma-cmp-side right">
          <Avatar name={opp.displayName} />
          <div className="ma-cmp-id">
            <b>{opp.displayName}</b>
            <span>
              {opp.record.w}–{opp.record.l}–{opp.record.d} · rk {opp.rank}
            </span>
          </div>
        </div>
      </div>
      <div className="ma-cmp-facts">
        <div className="ma-cmp-fact">
          <span className="ma-fk">2</span>
          <span>
            <b className="pos">{mineLeft}</b> of yours still to play · they have <b>{theirsLeft}</b>
            {edge !== 0 && (
              <>
                {" "}
                ·{" "}
                <span className={edge > 0 ? "up" : "down"}>
                  {edge > 0 ? "+" : ""}
                  {edge}
                </span>
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The mobile H2H: back + condensed compare band + a You/Opponent toggle over ONE jersey pitch.
 * The side toggle is deliberately a LOCAL useState (F3) — pure presentation, not Realtime-coupled.
 */
export function MaH2H({
  field,
  oppId,
  onBack,
  onOpenPlayer,
  dimLive,
  benches = [],
}: {
  field: FieldEntry[];
  oppId: string;
  onBack: () => void;
  onOpenPlayer: (playerId: string) => void;
  dimLive: boolean;
  /** Per-manager benches (display-only sibling of the snapshot); the shown side's bench renders below. */
  benches?: ManagerBench[];
}) {
  // Open on the OPPONENT's XI: you tapped this row to scout them, so their team
  // leads; your own side is one tap away on the segment below. (Mobile only —
  // desktop da-teams2 keeps You-left.)
  const [side, setSide] = useState<"me" | "opp">("opp");
  const me = field.find((e) => e.isMe);
  const opp = field.find((e) => e.managerId === oppId);
  if (!me || !opp || opp.isMe) return null;
  const shown = side === "me" ? me : opp;
  return (
    <div className="ma-h2h">
      <button type="button" className="ma-back" onClick={onBack}>
        ‹ Standings
      </button>
      <MaCompare me={me} opp={opp} />
      <div className="ma-sideseg">
        <button
          type="button"
          className={side === "opp" ? "is-on" : ""}
          onClick={() => setSide("opp")}
        >
          {opp.displayName} <span className="ma-seg-pts">{opp.points}</span>
        </button>
        <button
          type="button"
          className={side === "me" ? "is-on" : ""}
          onClick={() => setSide("me")}
        >
          You <span className="ma-seg-pts">{me.points}</span>
        </button>
      </div>
      <div className="ma-pitchwrap">
        <XIPitch starters={shown.starters} onOpenPlayer={onOpenPlayer} dimLive={dimLive} mob />
      </div>
      <p className="t-micro text-tertiary" style={{ textAlign: "center", margin: "2px 0 0" }}>
        Tap a player for the points breakdown · kit brightness = lock-on-play
      </p>
      {/* Bench follows the You/Opp toggle — the substitutes for whichever side's XI is on the pitch. */}
      <div className="ma-benchwrap">
        <BenchStrip
          label={side === "me" ? "You" : opp.displayName}
          isMe={side === "me"}
          players={benchFor(benches, shown.managerId)}
        />
      </div>
    </div>
  );
}
