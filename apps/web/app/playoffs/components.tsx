"use client";
/**
 * Presentational pieces for the /playoffs ceremonial THEATER (T15-CUT demote-lite): the Chocoyo hero
 * (act + blade choreography + champion endgame + OnTheBlock row) and its supporting chrome. The old
 * board/ladder/round-nav/rails (GuillotineCutLine, SurvivorBoard, RoundColumn, MyReducedPitch,
 * ReinforceModule, MPoBoard, …) moved OFF this screen — the live knockout ladder is The Cut on
 * /vsfield now; no logic lives here.
 *
 * Identity: the pure view keys everything by managerId; names come from the loader-attached `managerNames`
 * map (via `meName`) and the viewer is `view.managerId` (cobalt "YOU" — accent marks only you + CTAs). The
 * cut is --elim; the live indicator is --live. Row state is read straight from `RankedRow.state`
 * (safe|zone|eliminated); the blade only "drops" when the round is already cut (status === "past").
 */
import { useId } from "react";
import type { PlayoffRoundView, RankedRow } from "@app/recompute";
import { meName, myMargin, type MyMargin } from "@/src/playoffs/theaterView";
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

interface IdProps {
  names: Readonly<Record<string, string>>;
  viewerId: string;
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

// ── the Chocoyo hero (theater re-skin) ───────────────────────────────────────────────────────
// Ported from design/design_reference/screens_2026-06-14/theater/{parrot,screen,app}.jsx. The mascot
// "act" is the pixel-art trophy mark (Chocoyo peeking out — vendored /brand/trophy.png, the same
// personality-moment <img> pattern as the old .po-parrot / the landing .lp-cta-parrot) hoisting the
// MACHETE (a pure inline SVG — its belly is the functional --elim red edge; no raster, so it paints
// with no asset dependency). All copy binds to the view-model; the blade choreography (idle sway →
// wind → swing) is driven by PlayoffsClient's CLOCKLESS transition latch, not by any server clock.

/** The machete Chocoyo wields — a broad single-edged bolo (wooden grip, no cross-guard). Rotation is a
 *  CSS `rotate:` longhand (playoffs.css) so the shared blade-state rules drive both the desktop and the
 *  smaller mobile instance. Unique gradient id per instance (two heroes mount: desktop + mobile). */
function Machete() {
  const gid = "po-mch-" + useId().replace(/:/g, "");
  return (
    <svg className="po-act-blade" viewBox="0 0 152 58" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EEF1F6" />
          <stop offset="0.4" stopColor="#B6BFCC" />
          <stop offset="0.56" stopColor="#8C97A8" />
          <stop offset="1" stopColor="#566073" />
        </linearGradient>
      </defs>
      {/* wooden grip (no cross-guard — that's what read as a sword) */}
      <path
        d="M6 22 L34 23 Q40 23 40 28 L40 33 Q40 38 34 38 L6 36 Q3 35 3 31 L3 27 Q3 23 6 22 Z"
        fill="#4A3C2E"
      />
      <rect x="6" y="24.2" width="29" height="3.2" rx="1.6" fill="#5E4B39" />
      <circle cx="12" cy="31" r="1.5" fill="#2C241D" />
      <circle cx="22" cy="31" r="1.5" fill="#2C241D" />
      <circle cx="32" cy="31" r="1.5" fill="#2C241D" />
      {/* broad machete blade */}
      <path
        d="M40 23 L116 16.5 Q143.5 18 147 33 Q139 44.5 109 47.5 Q71 50.5 40 37 Z"
        fill={`url(#${gid})`}
        stroke="#474F5C"
        strokeWidth="1"
      />
      {/* spine sheen (top edge) */}
      <path
        d="M46 24 Q100 20 134 26.5"
        stroke="#FFFFFF"
        strokeWidth="2"
        opacity="0.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* the belly — single cutting edge, functional --elim red (class → CSS stroke) */}
      <path
        className="po-machete-edge"
        d="M40 37 Q71 50.5 109 47.5 Q139 44.5 147 33"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The "act": the trophy figure (Chocoyo peeking out) with the machete overlaid, + the executioner
 *  caption. Static — the blade state is driven by the hero root's phase class (playoffs.css). */
function ChocoyoAct({ caption = true }: { caption?: boolean }) {
  return (
    <div className="po-act">
      {/* Plain <img> personality mark (BRAND.md §6), same pattern as the old .po-parrot / landing .lp-cta-parrot. */}
      <img className="po-act-fig" src="/brand/trophy.png" alt="" draggable={false} />
      <Machete />
      {caption && <span className="po-act-cap">Chocoyo · your executioner</span>}
    </div>
  );
}

/** The doomed teased under the blade — `round.eliminatedIds` (past: the actual cut from
 *  playoff_entry.eliminated_round; live: the provisional zone via the shared resolveRoundCut the
 *  view-model already surfaced). Struck (row-elim parity) when the blade has dropped. */
function OnTheBlock({
  round,
  names,
  viewerId,
  dropped,
  mobile = false,
}: IdProps & { round: PlayoffRoundView; dropped: boolean; mobile?: boolean }) {
  const ids = round.eliminatedIds ?? [];
  if (ids.length === 0) return null;
  return (
    <div className={mobile ? "mpo-hero-block" : "po-block"}>
      <span className="po-block-lab">
        <IcoBlade />
        {dropped ? "Guillotined" : "On the block"}
      </span>
      <div className="po-block-row">
        {ids.map((id) => {
          const name = meName(names, viewerId, id);
          return (
            <span
              className="po-victim"
              key={id}
              title={name + (dropped ? " — chopped" : " — facing the blade")}
            >
              <Avatar name={name} />
              {!mobile && <span className="po-victim-name">{name}</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The client-driven blade choreography threaded into the hero (PlayoffsClient owns the transition latch;
 * the loader is CLOCKLESS so there is no server "just happened" signal). `focusIdx` is the round the hero
 * centers on — `currentRoundIdx` at rest, or the just-cut round mid-swing so "CHOP!" plays over the round
 * that actually fell (not the next live one). `phase`: rest (idle sway on a live round / settled on a past
 * one) → wind (Chocoyo raises the blade) → drop (Chocoyo swings). Under prefers-reduced-motion the client
 * never leaves `rest`, so only the settled/raised states render.
 */
export interface HeroDrop {
  focusIdx: number;
  phase: "rest" | "wind" | "drop";
}

/** Resolve the hero's blade class + whether it reads "dropped" from the phase + focus round. */
function bladeStateOf(
  round: PlayoffRoundView | undefined,
  phase: HeroDrop["phase"],
): { dropped: boolean; bladeClass: string } {
  const dropped = phase === "drop" || (phase === "rest" && round?.status === "past");
  const bladeClass =
    phase === "wind" ? "is-wind" : phase === "drop" ? "is-drop" : dropped ? "is-dropped" : "";
  return { dropped, bladeClass };
}

/** The complete-arm champion hero — the hero OWNS the endgame (replaces the CHOP framing entirely). */
function ChampionHeroDesktop({ view }: { view: PlayoffsView }) {
  const champ = view.champion as string;
  const isMe = champ === view.managerId;
  const name = meName(view.managerNames, view.managerId, champ);
  return (
    <div className={"po-hero is-champion is-dropped" + (isMe ? " is-me" : "")}>
      <div className="po-champ">
        <ChocoyoAct caption={false} />
        <div className="po-champ-copy">
          <span className="po-eyebrow">
            <span className="po-eyebrow-dot" />
            Guillotine complete
          </span>
          <h2 className="po-champ-name display">
            {isMe ? "You are the champion" : `${name} — champion`}
          </h2>
          <p className="po-subcopy">The Chocoyo is sated — every round cut, one left standing.</p>
          <p className="po-substats">
            Tournament complete · <b>{view.totalRounds}</b>{" "}
            {view.totalRounds === 1 ? "round" : "rounds"} survived
          </p>
        </div>
      </div>
    </div>
  );
}

/** The desktop Chocoyo hero: marquee (copy) over the stage [act + on-the-block | your survival]. */
function ChocoyoHeroDesktop({ view, drop }: { view: PlayoffsView; drop: HeroDrop }) {
  const names = view.managerNames;
  const viewerId = view.managerId;
  const focusRound = view.rounds[drop.focusIdx] ?? view.rounds[view.currentRoundIdx];
  const isChampion = view.complete && view.champion != null && drop.phase === "rest";
  if (isChampion) return <ChampionHeroDesktop view={view} />;

  const { dropped, bladeClass } = bladeStateOf(focusRound, drop.phase);
  const cut = focusRound?.cutCount ?? 0;
  // The "Your survival" facts always read the CURRENT round (the viewer's live standing), even while the
  // marquee/act briefly focus a just-cut round mid-swing. At rest focusRound === the current round, so the
  // substats equal view.aliveNow / view.survivesNow (the §21 top-level counts).
  const currentRound = view.rounds[view.currentRoundIdx];
  const me = view.me;
  const margin = currentRound?.ranked ? myMargin(currentRound.ranked, viewerId) : null;

  return (
    <div className={"po-hero" + (bladeClass ? " " + bladeClass : "")}>
      <div className="po-marquee">
        <span className="po-eyebrow">
          <span className="po-eyebrow-dot" />
          Guillotine playoffs · Round {drop.focusIdx + 1} of {view.totalRounds}
        </span>
        <h2 className="po-headline display">{dropped ? "CHOP!" : `LOWEST ${cut} GET THE CHOP`}</h2>
        <p className="po-subcopy">The Chocoyo doesn&rsquo;t miss.</p>
        <p className="po-substats">
          <b>{focusRound?.fieldCount ?? view.aliveNow}</b> still standing · <b>{cut}</b> get chopped
          · <b>{focusRound?.survives ?? view.survivesNow}</b> advance
        </p>
      </div>
      <div className="po-stage">
        <div className="po-act-wrap">
          <ChocoyoAct />
          {focusRound && (
            <OnTheBlock round={focusRound} names={names} viewerId={viewerId} dropped={dropped} />
          )}
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
              <span className="t-micro text-tertiary">
                {me.points} pts this round · group seed #{me.seed}
              </span>
            </>
          ) : (
            <div className="t-caption text-tertiary">Out of the playoffs</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The condensed mobile Chocoyo hero (the facts band .mpo-myband stays below it, unchanged). */
function ChocoyoHeroMobile({ view, drop }: { view: PlayoffsView; drop: HeroDrop }) {
  const names = view.managerNames;
  const viewerId = view.managerId;
  const focusRound = view.rounds[drop.focusIdx] ?? view.rounds[view.currentRoundIdx];
  const isChampion = view.complete && view.champion != null && drop.phase === "rest";

  if (isChampion) {
    const champ = view.champion as string;
    const isMe = champ === viewerId;
    const name = meName(names, viewerId, champ);
    return (
      <div className={"mpo-hero is-champion is-dropped" + (isMe ? " is-me" : "")}>
        <div className="mpo-hero-top">
          <div className="mpo-hero-act">
            <img className="po-act-fig" src="/brand/trophy.png" alt="" draggable={false} />
            <Machete />
          </div>
          <div className="mpo-hero-copy">
            <span className="po-eyebrow">
              <span className="po-eyebrow-dot" />
              Guillotine complete
            </span>
            <h2 className="mpo-headline display">{isMe ? "You win" : `${name} wins`}</h2>
            <span className="mpo-hero-sub">The guillotine is done — one left standing.</span>
          </div>
        </div>
      </div>
    );
  }

  const { dropped, bladeClass } = bladeStateOf(focusRound, drop.phase);
  const cut = focusRound?.cutCount ?? 0;

  return (
    <div className={"mpo-hero" + (bladeClass ? " " + bladeClass : "")}>
      <div className="mpo-hero-top">
        <div className="mpo-hero-act">
          <img className="po-act-fig" src="/brand/trophy.png" alt="" draggable={false} />
          <Machete />
        </div>
        <div className="mpo-hero-copy">
          <span className="po-eyebrow">
            <span className="po-eyebrow-dot" />
            Guillotine · R{drop.focusIdx + 1}/{view.totalRounds}
          </span>
          <h2 className="mpo-headline display">
            {dropped ? "CHOP!" : `LOWEST ${cut} GET THE CHOP`}
          </h2>
          <span className="mpo-hero-sub">
            The Chocoyo doesn&rsquo;t miss · {focusRound?.fieldCount ?? view.aliveNow} standing ·{" "}
            {focusRound?.survives ?? view.survivesNow} advance
          </span>
        </div>
      </div>
      {focusRound && (
        <OnTheBlock round={focusRound} names={names} viewerId={viewerId} dropped={dropped} mobile />
      )}
    </div>
  );
}

interface LayoutProps {
  view: PlayoffsView;
  /** The client-driven blade choreography (PlayoffsClient's transition latch) threaded into the hero. */
  drop: HeroDrop;
}

const PLAYOFF_EXPLAINER = (
  <>
    Playoff lineups shrink to <b>7 starters (1 GK + 6 outfield) + 2 bench</b>. Lock-on-play still
    applies. FAAB <b>carries over</b> — a single $100 for the entire tournament (no playoff reset),
    so survivors reinforce with whatever balance they had left. Field size and exact cut counts are
    fixed by the commissioner — values here are <b>provisional</b>.
  </>
);

// ── desktop layout ───────────────────────────────────────────────────────────────────────────
// T15-CUT demote-lite: /playoffs is the ceremonial THEATER now — the hero (Chocoyo act + blade
// choreography + champion endgame + OnTheBlock row) plus the mechanics explainer. The ladder job
// (board/round-nav/rails) moved to The Cut on /vsfield; no logic lives here.
export function DesktopPlayoffs({ view, drop }: LayoutProps) {
  return (
    <div className="po-desktop">
      <ChocoyoHeroDesktop view={view} drop={drop} />

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

      <div className="po-foot t-micro text-tertiary">
        Per-round cut counts and the final field size are provisional — fixed at the group→playoff
        transition by the commissioner. The live ladder lives on The Cut.
      </div>
    </div>
  );
}

// ── mobile layout ────────────────────────────────────────────────────────────────────────────
// T15-CUT demote-lite: the phone theater is the hero alone (Chocoyo act + OnTheBlock inside it) —
// the defective mpo-myband (F-P1-K1: accent-as-safe for an eliminated viewer) is gone with the
// board; The Cut's KOYouBand is the survival surface now.
export function MobilePlayoffs({ view, drop }: LayoutProps) {
  return (
    <div className="po-mobile">
      <div className="mpo">
        <div className="mpo-head">
          <ChocoyoHeroMobile view={view} drop={drop} />
        </div>
        <div className="mpo-scroll">
          <div className="po-foot t-micro text-tertiary">
            Cut counts and field size are commissioner-set. The live ladder lives on The Cut.
          </div>
        </div>
      </div>
    </div>
  );
}
