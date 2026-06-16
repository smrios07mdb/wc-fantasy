"use client";
/**
 * Presentational pieces for the /playoffs guillotine theater, ported from design/design_reference/playoffs/
 * (components.jsx + desktop.jsx + mobile.jsx) and mapped onto the server-computed `PlayoffsView`
 * (@app/recompute). COMPONENT_MAP §2 row 10: GuillotineCutLine, SurvivorRow, RoundColumn, MyReducedPitch,
 * ReinforceModule, ShapeChip (+ the desktop SurvivorBoard/PoRoundNav/PoLockStrip + mobile MPoRow/MPoBoard).
 *
 * Identity: the pure view keys everything by managerId; names come from the loader-attached `managerNames`
 * map (via `meName`) and the viewer is `view.managerId` (cobalt "YOU" — accent marks only you + CTAs). The
 * cut is --elim; the live indicator is --live. Row state is read straight from `RankedRow.state`
 * (safe|zone|eliminated); the blade only "drops" when the round is already cut (status === "past").
 */
import type { PlayoffRoundView, RankedRow } from "@app/recompute";
import type { WaiversView } from "@/src/waivers/types";
import { countryFlag } from "@/src/draft/flag";
import {
  cutBoundaryIndex,
  meName,
  myMargin,
  type MyMargin,
  type ReducedPitch,
  type PitchNode,
} from "@/src/playoffs/theaterView";
import type { PlayoffsView } from "./loadPlayoffs";

// ── icons ──────────────────────────────────────────────────────────────────────────────────
const IcoSkull = () => (
  <svg
    viewBox="0 0 24 24"
    width="11"
    height="11"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
  >
    <circle cx="9" cy="11" r="1" />
    <circle cx="15" cy="11" r="1" />
    <path d="M12 3a8 8 0 0 0-8 8c0 3 2 4 2 6h12c0-2 2-3 2-6a8 8 0 0 0-8-8zM10 19v2M14 19v2" />
  </svg>
);
const IcoBlade = () => (
  <svg
    viewBox="0 0 24 24"
    width="11"
    height="11"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
  >
    <path d="M5 4h14v5l-14 6zM5 15l7 5" />
  </svg>
);
const IcoCheck = () => (
  <svg
    viewBox="0 0 24 24"
    width="11"
    height="11"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const IcoArrowR = () => (
  <svg
    viewBox="0 0 24 24"
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const IcoReset = () => (
  <svg
    viewBox="0 0 24 24"
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
  >
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 4v4h4" />
  </svg>
);

/** The red blade with a little guillotine on top — the visual signature of the cut (the user's ask). */
function GuillotineIcon({ dropped }: { dropped: boolean }) {
  return (
    <svg
      className={"po-guillo-svg" + (dropped ? " is-dropped" : "")}
      viewBox="0 0 60 54"
      width="50"
      height="45"
      aria-hidden="true"
    >
      <rect x="9" y="6" width="5" height="46" rx="1.5" fill="var(--po-frame)" />
      <rect x="46" y="6" width="5" height="46" rx="1.5" fill="var(--po-frame)" />
      <rect x="4" y="49" width="52" height="5" rx="2" fill="var(--po-frame)" />
      <rect x="6" y="2" width="48" height="6" rx="2" fill="var(--po-frame)" />
      <g className="po-blade">
        <path d="M14 10 h32 v10 l-32 8 z" fill="var(--elim)" />
        <path d="M14 10 h32 v3 H14 z" fill="#fff" opacity="0.55" />
        <rect x="14" y="10" width="32" height="2.5" fill="var(--elim)" />
      </g>
    </svg>
  );
}

// ── connection pill ──────────────────────────────────────────────────────────────────────────
export type ConnState = "live" | "reconnecting" | "stale" | "loading";

export function ConnPill({ state }: { state: ConnState }) {
  if (state === "live")
    return (
      <span className="pill pill-live po-conn">
        <span className="po-livedot" aria-hidden="true" />
        Live
      </span>
    );
  if (state === "reconnecting")
    return (
      <span className="pill po-conn">
        <span className="spinner" style={{ width: 11, height: 11 }} />
        Reconnecting
      </span>
    );
  if (state === "stale")
    return (
      <span className="pill po-conn">
        <span aria-hidden="true">◷</span>Delayed
      </span>
    );
  return (
    <span className="pill pill-neutral po-conn">
      <span className="spinner" style={{ width: 11, height: 11 }} />
      Loading
    </span>
  );
}

// ── manager avatar (initials) ──────────────────────────────────────────────────────────────
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
function Avatar({ name }: { name: string }) {
  return <span className="po-ava">{initials(name)}</span>;
}

// ── reduced-roster shape chip ────────────────────────────────────────────────────────────────
function ShapeChip() {
  return (
    <span className="po-shapechip">
      <span className="po-shapechip-txt">
        <b>7</b>
        <span className="po-sc-plus">+2</span>
        <span className="po-sc-sub">1 GK · 6 out</span>
      </span>
    </span>
  );
}

// ── status pill + per-row state class ──────────────────────────────────────────────────────
function statusPill(state: RankedRow["state"]) {
  if (state === "eliminated")
    return (
      <span className="pill pill-elim po-sp">
        <IcoSkull />
        Eliminated
      </span>
    );
  if (state === "zone")
    return (
      <span className="po-sp po-sp-zone">
        <IcoBlade />
        Facing the cut
      </span>
    );
  return (
    <span className="po-sp po-sp-safe">
      <IcoCheck />
      Surviving
    </span>
  );
}

function stateClass(state: RankedRow["state"]): string {
  if (state === "eliminated") return "is-elim";
  if (state === "zone") return "is-zone";
  return "is-safe";
}

interface IdProps {
  names: Readonly<Record<string, string>>;
  viewerId: string;
}

// ── the guillotine ───────────────────────────────────────────────────────────────────────────
function GuillotineCutLine({
  cut,
  dropped,
  victims,
  names,
  viewerId,
}: IdProps & { cut: number; dropped: boolean; victims: readonly RankedRow[] }) {
  return (
    <div className={"po-guillo" + (dropped ? " is-dropped" : "")} role="separator">
      <div className="po-guillo-top">
        <GuillotineIcon dropped={dropped} />
        <div className="po-guillo-blade" />
        <div className="po-guillo-meta">
          <span className="po-guillo-lab">
            {dropped ? "Blade dropped" : "Guillotine"} · lowest <b>{cut}</b> cut
          </span>
          <span className="po-guillo-note t-micro">
            cut count provisional · set by the commissioner
          </span>
        </div>
      </div>
      {victims.length > 0 && (
        <div className="po-guillo-victims">
          <span className="po-victim-lab">{dropped ? "Guillotined" : "On the block"}</span>
          <div className="po-victims-row">
            {victims.map((v) => {
              const name = meName(names, viewerId, v.managerId);
              return (
                <span
                  className="po-victim"
                  key={v.managerId}
                  title={name + (dropped ? " — eliminated" : " — facing the cut")}
                >
                  <Avatar name={name} />
                  <span className="po-victim-name">{name}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── survivor board row (desktop) ───────────────────────────────────────────────────────────
function SurvivorRow({ r, names, viewerId }: IdProps & { r: RankedRow }) {
  const isMe = r.managerId === viewerId;
  const name = meName(names, viewerId, r.managerId);
  const cls = ["po-row", isMe ? "is-me" : "", stateClass(r.state)].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <span className="po-c-seed">
        <span className="po-seedbadge">{r.seed}</span>
      </span>
      <span className="po-c-mgr">
        <Avatar name={name} />
        <span className="po-mgr-name">{name}</span>
        {isMe && <span className="po-you">YOU</span>}
        <span className="po-mgr-seed t-micro text-tertiary">group seed #{r.seed}</span>
      </span>
      <span className="po-c-shape">
        <ShapeChip />
      </span>
      <span className="po-c-rank mono">{r.rank}</span>
      <span className="po-c-pts mono">
        {r.points}
        <small>pts</small>
      </span>
      <span className="po-c-status">{statusPill(r.state)}</span>
    </div>
  );
}

export function SurvivorBoard({ round, names, viewerId }: IdProps & { round: PlayoffRoundView }) {
  const ranked = round.ranked ?? [];
  const cutAt = cutBoundaryIndex(ranked);
  const out: React.ReactNode[] = [
    <div className="po-thead" key="head">
      <span className="po-th">Seed</span>
      <span className="po-th">Manager</span>
      <span className="po-th">Playoff roster</span>
      <span className="po-th po-th-c">Round rank</span>
      <span className="po-th po-th-c">Pts</span>
      <span className="po-th po-th-c">Status</span>
    </div>,
  ];
  ranked.forEach((r, i) => {
    if (i === cutAt && cutAt < ranked.length)
      out.push(
        <GuillotineCutLine
          key="guillo"
          cut={round.cutCount}
          dropped={round.status === "past"}
          victims={ranked.slice(cutAt)}
          names={names}
          viewerId={viewerId}
        />,
      );
    out.push(<SurvivorRow key={r.managerId} r={r} names={names} viewerId={viewerId} />);
  });
  return <div className="po-board">{out}</div>;
}

// ── round navigator (desktop) ────────────────────────────────────────────────────────────────
export function PoRoundNav({
  rounds,
  view,
  onView,
}: {
  rounds: readonly PlayoffRoundView[];
  view: number;
  onView: (i: number) => void;
}) {
  return (
    <div className="po-roundnav">
      {rounds.map((rd, i) => (
        <button
          key={rd.idx}
          type="button"
          className={"po-rn-item" + (i === view ? " is-active" : "") + " st-" + rd.status}
          onClick={() => onView(i)}
          title={`${rd.round} · ${rd.status}`}
        >
          <span className="po-rn-num">R{i + 1}</span>
          <span className="po-rn-tag">
            {rd.status === "past" ? "done" : rd.status === "live" ? "live" : "next"}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── ladder (desktop) ───────────────────────────────────────────────────────────────────────
function LadderRow({ r, names, viewerId }: IdProps & { r: RankedRow }) {
  const isMe = r.managerId === viewerId;
  const name = meName(names, viewerId, r.managerId);
  const cls = ["po-lr", isMe ? "is-me" : "", stateClass(r.state)].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <span className="po-lr-rank mono">{r.rank}</span>
      <Avatar name={name} />
      <span className="po-lr-name">{name}</span>
      <span className="po-lr-pts mono">{r.points}</span>
      {r.state === "eliminated" && <IcoSkull />}
    </div>
  );
}

export function RoundColumn({ round, names, viewerId }: IdProps & { round: PlayoffRoundView }) {
  const head = (
    <div className={"po-col-head st-" + round.status}>
      <div className="po-col-rnum">R{round.idx + 1}</div>
      <div className="po-col-meta">
        <span className={"po-col-tag po-col-" + round.status}>
          {round.status === "past" ? "Settled" : round.status === "live" ? "Live now" : "Upcoming"}
        </span>
        <span className="t-micro text-tertiary">
          cut {round.cutCount} · {round.fieldCount}→{round.survives}
        </span>
      </div>
    </div>
  );
  if (round.status === "future" || !round.ranked) {
    return (
      <div className="po-col is-future">
        {head}
        <div className="po-col-future">
          <div className="po-future-big mono">{round.fieldCount}</div>
          <span className="t-caption text-tertiary">
            enter · lowest <b>{round.cutCount}</b> cut
          </span>
          <div className="po-future-survive">{round.survives} survive</div>
        </div>
      </div>
    );
  }
  const ranked = round.ranked;
  const cutAt = cutBoundaryIndex(ranked);
  const rows: React.ReactNode[] = [];
  ranked.forEach((r, i) => {
    if (round.status === "live" && i === cutAt && cutAt < ranked.length)
      rows.push(
        <div className="po-col-cut" key="cut">
          <span className="po-col-cut-line" />
          <span className="po-col-cut-lab">cut {round.cutCount}</span>
        </div>,
      );
    rows.push(<LadderRow key={r.managerId} r={r} names={names} viewerId={viewerId} />);
  });
  return (
    <div className={"po-col st-" + round.status}>
      {head}
      <div className="po-col-body">{rows}</div>
    </div>
  );
}

// ── my reduced pitch ─────────────────────────────────────────────────────────────────────────
// TODO(confirm): the prototype split nodes into movable / live(playing, red pulse) / played. The snapshot
// (SetLineupState.slotMeta) carries only {hasPlayed, pointsAtStake} — the live "playing now" split is the
// vs-the-field surface and out of scope for the @app/lineup loader — so we render the two facts we have:
// movable ("—") vs locked/played (banked points, dimmed kit). The design's per-node live-dot is dropped
// (fact-wins-over-flourish, design/CLAUDE.md §1); a per-player live flag would need a loader/recompute change.
function PoNode({ node }: { node: PitchNode }) {
  const flag = countryFlag(node.country);
  return (
    <div
      className={"po-node" + (node.locked ? " st-played" : "")}
      title={`${node.name} · ${node.locked ? "locked" : "movable"}`}
    >
      <span className="po-node-kit">{flag ?? ""}</span>
      <span className="po-node-name">{node.name}</span>
      <span className="po-node-pts mono">{node.locked ? node.points : "—"}</span>
    </div>
  );
}

export function MyReducedPitch({ pitch }: { pitch: ReducedPitch }) {
  return (
    <div className="po-pitch">
      {pitch.lanes.map((lane) => (
        <div className="po-pitch-lane" key={lane.pos}>
          {lane.nodes.map((n) => (
            <PoNode key={n.id} node={n} />
          ))}
        </div>
      ))}
      <div className="po-pitch-bench">
        <span className="t-micro text-tertiary po-bench-lab">Bench · {pitch.bench.length}</span>
        {pitch.bench.map((n) => {
          const flag = countryFlag(n.country);
          return (
            <span className={"po-bench-chip" + (n.locked ? " st-played" : "")} key={n.id}>
              <span className="po-bench-kit">{flag ?? ""}</span>
              {n.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function PoLockStrip({ pitch }: { pitch: ReducedPitch }) {
  return (
    <div className="po-lockstrip">
      <span className="po-ls-stat">
        <b className="mono">{pitch.movable}</b>
        <span className="t-micro text-tertiary">movable</span>
      </span>
      <span className="po-ls-stat">
        <b className="mono" style={{ color: "var(--node-played,#6E86B4)" }}>
          {pitch.locked}
        </b>
        <span className="t-micro text-tertiary">locked</span>
      </span>
      <span className="po-ls-cap t-micro text-tertiary">
        {pitch.starters} starters · {pitch.bench.length} bench
      </span>
    </div>
  );
}

// ── reinforce (FAAB) ───────────────────────────────────────────────────────────────────────
/** The playoff FAAB reset is a fresh $100 (DECISIONS Theme D); the meter reads available/100. */
const FAAB_RESET = 100;

export function ReinforceModule({ reinforcement }: { reinforcement: WaiversView | null }) {
  if (!reinforcement) return null;
  const left = reinforcement.faabBudget;
  const pct = Math.max(0, Math.min(100, Math.round((left / FAAB_RESET) * 100)));
  return (
    <div className="po-reinforce">
      <div className="po-reinforce-head">
        <span className="t-label">Reinforce your survivors</span>
        {reinforcement.isPlayoffPhase && (
          <span className="po-reset-tag">
            <IcoReset />
            FAAB reset to ${FAAB_RESET}
          </span>
        )}
      </div>
      <div className="po-faab">
        <div className="po-faab-fig">
          <b className="display mono">${left}</b>
          <span className="t-micro text-tertiary">of ${FAAB_RESET} left</span>
        </div>
        <div className={"meter" + (pct <= 25 ? " is-low" : "")} style={{ flex: 1 }}>
          <span style={{ width: pct + "%" }} />
        </div>
      </div>
      <p className="po-reinforce-copy t-caption text-secondary">
        Each surviving manager gets a clean <b>${FAAB_RESET}</b> at the group→playoff transition.
        Blind sealed bids; ties break on the rolling waiver order.
      </p>
      <a className="btn btn-primary btn-block" href="/waivers">
        Open waivers
        <IcoArrowR />
      </a>
    </div>
  );
}

// ── champion / tournament-complete banner (the view adds champion/complete; the prototype lacked it) ──
export function ChampionBanner({ champion, names, viewerId }: IdProps & { champion: string }) {
  const isMe = champion === viewerId;
  const name = meName(names, viewerId, champion);
  return (
    <div className={"po-champion" + (isMe ? " is-me" : "")}>
      <span className="po-champion-medal" aria-hidden="true">
        🏆
      </span>
      <div>
        <div className="po-champion-name display">
          {isMe ? "You are the champion" : `${name} — champion`}
        </div>
        <div className="t-caption text-secondary">
          The guillotine is done — every round is cut and a winner survives. Tournament complete.
        </div>
      </div>
    </div>
  );
}

// ── mobile (.mpo) ──────────────────────────────────────────────────────────────────────────
function MPoRow({ r, names, viewerId }: IdProps & { r: RankedRow }) {
  const isMe = r.managerId === viewerId;
  const name = meName(names, viewerId, r.managerId);
  const cls = ["mpo-row", isMe ? "is-me" : "", stateClass(r.state)].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <span className="mpo-seed mono">{r.rank}</span>
      <Avatar name={name} />
      <div className="mpo-mgr">
        <b className="mpo-name">
          {name}
          {isMe && <span className="po-you">YOU</span>}
        </b>
        <span className="mpo-sub t-micro text-tertiary">seed #{r.seed}</span>
      </div>
      <div className="mpo-right">
        <b className="mpo-pts mono">{r.points}</b>
        {r.state === "eliminated" ? (
          <span className="mpo-tag is-elim">
            <IcoSkull />
          </span>
        ) : r.state === "zone" ? (
          <span className="mpo-tag is-zone">
            <IcoBlade />
          </span>
        ) : (
          <span className="mpo-tag is-safe">
            <IcoCheck />
          </span>
        )}
      </div>
    </div>
  );
}

export function MPoBoard({ round, names, viewerId }: IdProps & { round: PlayoffRoundView }) {
  const ranked = round.ranked ?? [];
  const cutAt = cutBoundaryIndex(ranked);
  const dropped = round.status === "past";
  const out: React.ReactNode[] = [];
  ranked.forEach((r, i) => {
    if (i === cutAt && cutAt < ranked.length)
      out.push(
        <div className={"mpo-guillo" + (dropped ? " is-dropped" : "")} key="g">
          <div className="mpo-guillo-top">
            <GuillotineIcon dropped={dropped} />
            <span className="mpo-guillo-lab">
              Lowest <b>{round.cutCount}</b> cut{dropped ? " — blade dropped" : ""}
            </span>
          </div>
          <div className="mpo-victims">
            {ranked.slice(cutAt).map((v) => {
              const name = meName(names, viewerId, v.managerId);
              return (
                <span className="po-victim" key={v.managerId} title={name}>
                  <Avatar name={name} />
                </span>
              );
            })}
          </div>
        </div>,
      );
    out.push(<MPoRow key={r.managerId} r={r} names={names} viewerId={viewerId} />);
  });
  return <div className="mpo-list">{out}</div>;
}

// ── shared rail (reduced pitch + reinforce) ──────────────────────────────────────────────────
function Rail({
  pitch,
  reinforcement,
}: {
  pitch: ReducedPitch | null;
  reinforcement: WaiversView | null;
}) {
  return (
    <>
      <div className="po-rail-card">
        <div className="po-rail-head">
          <span className="t-label">Your reduced lineup</span>
          <a className="po-rail-link" href="/lineup">
            Set lineup
            <IcoArrowR />
          </a>
        </div>
        {pitch ? (
          <>
            <MyReducedPitch pitch={pitch} />
            <PoLockStrip pitch={pitch} />
          </>
        ) : (
          <p className="t-caption text-tertiary" style={{ margin: 0 }}>
            No playoff lineup set yet — head to Set Lineup to pick your reduced XI (7 starters + 2
            bench).
          </p>
        )}
      </div>
      <ReinforceModule reinforcement={reinforcement} />
    </>
  );
}

/** The "Your survival" hero margin sentence. gap is always ≥ 0 (safe rows sit above cut rows); 0 = the line.
 *  `eliminated` (a SETTLED round's cut, incl. the complete-phase runner-up) gets the past-tense "guillotined"
 *  phrasing instead of the live "must pass" one — mirroring the design's `meGone` branch. */
function marginPhrase(
  margin: MyMargin,
  names: Readonly<Record<string, string>>,
  viewerId: string,
  eliminated: boolean,
) {
  const rival = meName(names, viewerId, margin.rivalId);
  if (margin.safe)
    return margin.gap > 0 ? (
      <>
        <b>+{margin.gap}</b> pts clear of the blade — {rival} is first out
      </>
    ) : (
      <>
        Level <b>at the line</b> — {rival} is first out
      </>
    );
  if (eliminated)
    return (
      <>
        Caught <b>{margin.gap}</b> pts short of {rival} — guillotined this round
      </>
    );
  return margin.gap > 0 ? (
    <>
      <b>{margin.gap}</b> pts inside the kill zone — must pass {rival}
    </>
  ) : (
    <>
      <b>At the line</b> — level with {rival}
    </>
  );
}

function HeroStatus({ state }: { state: RankedRow["state"] }) {
  if (state === "safe")
    return (
      <span className="po-hero-status is-safe">
        <IcoCheck />
        Surviving
      </span>
    );
  if (state === "eliminated")
    return (
      <span className="po-hero-status is-zone">
        <IcoSkull />
        Eliminated
      </span>
    );
  return (
    <span className="po-hero-status is-zone">
      <IcoBlade />
      Facing the cut
    </span>
  );
}

interface LayoutProps {
  view: PlayoffsView;
  pitch: ReducedPitch | null;
  layout: "board" | "ladder";
  viewRoundIdx: number;
  onViewRound: (i: number) => void;
}

const PLAYOFF_EXPLAINER = (
  <>
    Playoff lineups shrink to <b>7 starters (1 GK + 6 outfield) + 2 bench</b>. Lock-on-play still
    applies. FAAB <b>reset to $100</b> at the transition so survivors can reinforce. Field size and
    exact cut counts are fixed by the commissioner — values here are <b>provisional</b>.
  </>
);

// ── desktop layout ───────────────────────────────────────────────────────────────────────────
export function DesktopPlayoffs({ view, pitch, layout, viewRoundIdx, onViewRound }: LayoutProps) {
  const names = view.managerNames;
  const viewerId = view.managerId;
  const currentRound = view.rounds[view.currentRoundIdx];
  const viewRound = view.rounds[viewRoundIdx] ?? currentRound;
  const me = view.me;
  const margin = currentRound?.ranked ? myMargin(currentRound.ranked, viewerId) : null;
  const cut = currentRound?.cutCount ?? 0;

  return (
    <div className="po-desktop">
      <div className="po-hero">
        <div className="po-hero-lead">
          <span className="po-eyebrow">
            <span className="po-eyebrow-dot" />
            Guillotine · {currentRound?.round ?? "Playoffs"}
          </span>
          <h2 className="po-hero-title display">
            {view.aliveNow} alive · lowest {cut} fall this round
          </h2>
          <p className="po-hero-sub t-body text-secondary">
            Everyone left is scored on a reduced roster. The lowest {cut}{" "}
            {cut === 1 ? "scorer is" : "scorers are"} guillotined; {view.survivesNow} advance. No
            second chances.
          </p>
        </div>
        <div className="po-hero-me">
          <span className="t-label">Your survival</span>
          {me ? (
            <>
              <div className="po-hero-rankrow">
                <b className={"po-hero-rank" + (me.state === "safe" ? " is-safe" : " is-zone")}>
                  {me.rank}
                  <small>of {view.aliveNow}</small>
                </b>
                <HeroStatus state={me.state} />
              </div>
              {margin && (
                <div className={"po-hero-margin" + (margin.safe ? " is-safe" : " is-zone")}>
                  {marginPhrase(margin, names, viewerId, me.state === "eliminated")}
                </div>
              )}
              <div className="po-hero-figs">
                <span className="t-micro text-tertiary">
                  {me.points} pts this round · group seed #{me.seed}
                </span>
              </div>
            </>
          ) : (
            <div className="t-caption text-tertiary">Out of the playoffs</div>
          )}
        </div>
      </div>

      <div className="po-explain">
        <span className="po-explain-ic">
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 7.5v.5" />
          </svg>
        </span>
        <span>{PLAYOFF_EXPLAINER}</span>
      </div>

      {layout === "ladder" ? (
        <div className="po-ladder-wrap">
          <div className="po-ladder">
            {view.rounds.map((rd) => (
              <RoundColumn key={rd.idx} round={rd} names={names} viewerId={viewerId} />
            ))}
          </div>
          <div className="po-ladder-rail">
            <Rail pitch={pitch} reinforcement={view.reinforcement} />
          </div>
        </div>
      ) : (
        <div className="po-board-wrap">
          <div className="po-board-main">
            <div className="po-board-bar">
              <div className="po-board-title">
                <b className="display">{viewRound?.round ?? "Round"}</b>
                <span className="t-caption text-tertiary">
                  {viewRound?.fieldCount} entered · lowest {viewRound?.cutCount} cut ·{" "}
                  {viewRound?.survives} advance
                </span>
              </div>
              <PoRoundNav rounds={view.rounds} view={viewRoundIdx} onView={onViewRound} />
            </div>
            {viewRound?.ranked ? (
              <SurvivorBoard round={viewRound} names={names} viewerId={viewerId} />
            ) : (
              <div className="po-future-board">
                <div className="po-future-big mono">{viewRound?.fieldCount}</div>
                <span className="t-body text-secondary">
                  survivors enter · lowest <b>{viewRound?.cutCount}</b> guillotined ·{" "}
                  {viewRound?.survives} advance
                </span>
                <span className="t-caption text-tertiary">
                  participants set once the previous round locks
                </span>
              </div>
            )}
          </div>
          <div className="po-board-rail">
            <Rail pitch={pitch} reinforcement={view.reinforcement} />
          </div>
        </div>
      )}

      <div className="po-foot t-micro text-tertiary">
        Per-round cut counts and the final field size are provisional — fixed at the group→playoff
        transition by the commissioner.
      </div>
    </div>
  );
}

// ── mobile layout ────────────────────────────────────────────────────────────────────────────
export function MobilePlayoffs({
  view,
  layout,
  viewRoundIdx,
  onViewRound,
}: Omit<LayoutProps, "pitch">) {
  const names = view.managerNames;
  const viewerId = view.managerId;
  const currentRound = view.rounds[view.currentRoundIdx];
  const viewRound = view.rounds[viewRoundIdx] ?? currentRound;
  const me = view.me;
  const margin = currentRound?.ranked ? myMargin(currentRound.ranked, viewerId) : null;
  const inZone = !!margin && !margin.safe;

  return (
    <div className="po-mobile">
      <div className="mpo">
        <div className="mpo-head">
          <div className={"mpo-myband" + (inZone ? " is-zone" : "")}>
            <div className="mpo-my-rank">
              <span className="t-label">You</span>
              <b className={inZone ? "is-zone" : "is-safe"}>
                {me ? me.rank : "–"}
                <small>/{view.aliveNow}</small>
              </b>
            </div>
            <div className="mpo-my-mid">
              {me &&
                (me.state === "safe" ? (
                  <span className="mpo-my-status is-safe">
                    <IcoCheck />
                    Surviving
                  </span>
                ) : me.state === "eliminated" ? (
                  <span className="mpo-my-status is-zone">
                    <IcoSkull />
                    Eliminated
                  </span>
                ) : (
                  <span className="mpo-my-status is-zone">
                    <IcoBlade />
                    Facing the cut
                  </span>
                ))}
              {margin && (
                <span className="t-micro text-tertiary">
                  {margin.gap > 0
                    ? margin.safe
                      ? `+${margin.gap} clear of the blade`
                      : `${margin.gap} inside the zone`
                    : "at the line"}
                </span>
              )}
            </div>
            <div className="mpo-my-pts">
              <b className="mono">{me ? me.points : "–"}</b>
              <span className="t-micro text-tertiary">pts</span>
            </div>
          </div>
        </div>

        <div className="mpo-scroll">
          {layout === "ladder" ? (
            <div className="mpo-ladder">
              {view.rounds.map((rd) => (
                <div className={"mpo-lround st-" + rd.status} key={rd.idx}>
                  <div className="mpo-lround-head">
                    <b>{rd.round}</b>
                    <span className={"mpo-lround-tag po-col-" + rd.status}>
                      {rd.status === "past" ? "Settled" : rd.status === "live" ? "Live" : "Next"}
                    </span>
                    <span className="t-micro text-tertiary">
                      cut {rd.cutCount} · {rd.fieldCount}→{rd.survives}
                    </span>
                  </div>
                  {rd.ranked ? (
                    <MPoBoard round={rd} names={names} viewerId={viewerId} />
                  ) : (
                    <div className="mpo-future">
                      <b className="mono">{rd.fieldCount}</b> enter · lowest <b>{rd.cutCount}</b>{" "}
                      cut · {rd.survives} survive
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="mpo-roundnav">
                {view.rounds.map((rd, i) => (
                  <button
                    key={rd.idx}
                    type="button"
                    className={
                      "mpo-rn" + (i === viewRoundIdx ? " is-active" : "") + " st-" + rd.status
                    }
                    onClick={() => onViewRound(i)}
                  >
                    R{i + 1}
                  </button>
                ))}
              </div>
              <div className="mpo-roundsum t-caption text-secondary">
                {viewRound?.round} · {viewRound?.fieldCount} entered · lowest{" "}
                <b>{viewRound?.cutCount}</b> cut · {viewRound?.survives} advance
              </div>
              {viewRound?.ranked ? (
                <MPoBoard round={viewRound} names={names} viewerId={viewerId} />
              ) : (
                <div className="mpo-future-board">
                  <b className="mono">{viewRound?.fieldCount}</b>
                  <span>survivors enter</span>
                  <span className="t-caption text-tertiary">
                    lowest {viewRound?.cutCount} cut · set once the prior round locks
                  </span>
                </div>
              )}
            </>
          )}
          <ReinforceModule reinforcement={view.reinforcement} />
        </div>
      </div>
    </div>
  );
}
