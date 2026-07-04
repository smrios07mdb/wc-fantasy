"use client";
/**
 * The Cut — knockout-mode presentational components for /vsfield (T15-CUT), ported from
 * design_reference/the_cut_knockout (`vsfield2/knockout.jsx` + the static-mock spec panel):
 * KOMarquee (compact theater strip: trophy bursts out, machete looms) · KOYouBand (the #1 glanceable
 * fact — safe / block / pend / out / champion, always color + icon + WORD) · KOCutLine · KOFallen
 * (one ladder, two sections; rows stay tappable → the T11 cut-round lookup) · KOChampion (state e
 * hero) · KOCeremony (full-frame takeover on results-official) · KOSheet (the mobile drill-in bottom
 * sheet) · KoLadder (authoritative-order rows with the FLIP/throttle discipline).
 *
 * Blade discipline (locked): exactly ONE machete per screen — the marquee's loom yields to the
 * Damocles blade whenever the YOU band shows `block`. Brand contract: cobalt marks YOU + primary
 * actions only; functional states are color + icon + word; min 44px targets; variable manager count.
 *
 * FAAB copy (P1 exclusion, rider A): the reference ceremony's aftermath line claims a fresh $100 at
 * the transition — the banned stale copy (DECISIONS: one-time $100, never replenished). The shipped
 * line reads carry-forward truth and is pinned by theCutSkin.test.ts.
 *
 * z-scale note (pre-T15-2): the ceremony (z 120) and the drill-in sheet (z 110) deliberately sit
 * ABOVE the fixed bottom nav (z 100) with a body-scroll lock while open — a screen-local step toward
 * T15-2's global scrims-above-nav pass, chosen to slot into it, not fight it (F-P1-I1).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PLAYOFF_ROSTER } from "@app/shared";
import type { FieldEntry } from "@app/vsfield";
import type { KnockoutContext, KnockoutFallen } from "@/src/vsfield/knockout";
import { knockoutRoundName } from "@/src/vsfield/knockout";
import { nextLadderOrder, type LadderOrderState } from "@/src/vsfield/ladderThrottle";
import { Machete, MacheteMini } from "./MacheteGlyph";
import { Avatar, LbRow, MaRow, useScorePulse } from "./components";

export const ordinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
};

/** Lock body scroll while a takeover (sheet / ceremony) is open. */
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/* ─────────────────────────────── marquee ─────────────────────────────── */

export function KOMarquee({ ko }: { ko: KnockoutContext }) {
  const title = ko.pend ? "THE BLADE DROPS SOON" : `LOWEST ${ko.cutCount} GET THE CHOP`;
  const sub = ko.pend
    ? "Full time · official after stat corrections"
    : `${ko.aliveCount} standing · ${ko.advanceCount} advance · cut at full time`;
  return (
    <div className="ko-marq">
      {ko.viewer.state !== "block" && <Machete cls="loom" />}
      <img className="ko-trophy" src="/brand/trophy.png" alt="" />
      <div className="ko-marq-tx">
        <div className="t">{title}</div>
        <div className="s">{sub}</div>
      </div>
      <a className="ko-theater" href="/playoffs">
        Theater ›
      </a>
    </div>
  );
}

/* ─────────────────────────────── YOU band ─────────────────────────────── */

export function KOYouBand({ ko, mob = false }: { ko: KnockoutContext; mob?: boolean }) {
  const { viewer } = ko;
  const pulse = useScorePulse(viewer.margin ?? 0);
  let variant: string;
  let icon: string;
  let a: string;
  let b: string;
  let n1: string;
  let n2: string;
  if (viewer.state === "champion") {
    variant = "safe";
    icon = "✓";
    a = "Champion — outlasted the field";
    b = "Every round survived";
    n1 = "1st";
    n2 = viewer.placement ? `of ${viewer.placement.of} overall` : "of the field";
  } else if (viewer.state === "out") {
    variant = "out";
    icon = "✗";
    a = viewer.outRoundLabel
      ? `Cut in the ${knockoutRoundName(viewer.outRoundLabel)}`
      : "Out in the group stage";
    if (ko.complete && viewer.placement) {
      b = "Placement = round survived, then pts";
      n1 = ordinal(viewer.placement.rank);
      n2 = `of ${viewer.placement.of} overall`;
    } else {
      b = "Spectating — rows still open";
      n1 = String(ko.aliveCount);
      n2 = "still standing";
    }
  } else {
    const margin = viewer.margin ?? 0;
    const marginTxt = `${margin > 0 ? "+" : ""}${margin}`;
    if (viewer.state === "block") {
      variant = "block";
      icon = "⚠";
      a = `ON THE BLOCK · ${ordinal(viewer.rank ?? 0)} of ${viewer.of}`;
      b = ko.pend
        ? "Official after stat corrections"
        : `Need ${Math.max(1, -margin + 1)} pts — ${viewer.stillToCome ?? 0} to play`;
    } else if (viewer.state === "pend") {
      variant = "pend";
      icon = "⏳";
      a = `Provisionally safe · ${ordinal(viewer.rank ?? 0)} of ${viewer.of}`;
      b = "Order can move on stat corrections";
    } else {
      variant = "safe";
      icon = "✓";
      a = `Surviving · ${ordinal(viewer.rank ?? 0)} of ${viewer.of}`;
      b = "Tap a row to compare";
    }
    n1 = marginTxt;
    n2 = viewer.marginLevel
      ? "level — tiebreak applies"
      : viewer.state === "block"
        ? "behind the blade"
        : viewer.state === "pend"
          ? "clear at full time"
          : "clear of the blade";
  }
  return (
    <div className={"ko-you is-" + variant + (mob ? " ko-you-mob" : "")}>
      {viewer.state === "block" && <Machete cls="damocles" />}
      <span className="ko-you-ic" aria-hidden="true">
        {icon}
      </span>
      <div className="ko-you-tx">
        <b>{a}</b>
        <span>{b}</span>
      </div>
      <div className="ko-you-num">
        <b className={"mono" + (pulse ? " score-pulse" : "")}>{n1}</b>
        <span>{n2}</span>
      </div>
      {mob && viewer.points !== null && (
        <div className="ko-you-pts mono">
          {viewer.points}
          <span>pts</span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── reduced-shape strip (F-P2-K4) ─────────────────────────────── */

export function KOReducedShape() {
  return (
    <div className="ko-shape">
      <span className="ko-shape-chip mono">
        {PLAYOFF_ROSTER.starters}+{PLAYOFF_ROSTER.bench} · {PLAYOFF_ROSTER.bounds.GK.max} GK +{" "}
        {PLAYOFF_ROSTER.startingOutfield} outfield
      </span>
      <span className="ko-shape-tx">Knockout squads run reduced — lock-on-play still applies</span>
      <a className="ko-shape-cta" href="/lineup">
        Set lineup ›
      </a>
    </div>
  );
}

/* ─────────────────────────────── cut line ─────────────────────────────── */

export function KOCutLine({ cutCount }: { cutCount: number }) {
  return (
    <div className="ko-cut">
      <span className="beam" />
      <span className="chip">
        <MacheteMini />
        CUT LINE · LOWEST {cutCount}
      </span>
      <span className="beam r" />
    </div>
  );
}

/* ─────────────────────────────── the fallen ─────────────────────────────── */

function fallenTag(f: KnockoutFallen): string {
  return f.roundLabel ? `cut in ${f.roundLabel}` : "group stage";
}

/**
 * One ladder, two sections. Live rounds: the most recent CUT round renders full rows (+ always the
 * viewer's own row); older rounds + the group-stage outs compress to one summary line per round.
 * Complete: everything compresses except the viewer. Auto-expands when the viewer is fallen.
 * Knockout-cut rows stay tappable → the T11 lookup of their cut round; group-outs have no round to
 * look up and render inert.
 */
export function KOFallen({
  fallen,
  complete,
  viewerFallen,
  onOpen,
}: {
  fallen: KnockoutFallen[];
  complete: boolean;
  viewerFallen: boolean;
  onOpen: (managerId: string, roundLabel: string) => void;
}) {
  const [open, setOpen] = useState(viewerFallen);
  useEffect(() => {
    if (viewerFallen) setOpen(true);
  }, [viewerFallen]);
  if (fallen.length === 0) return null;

  const latestIdx = Math.max(...fallen.map((f) => f.roundIdx));
  const fullRows = fallen.filter(
    (f) => f.isMe || (!complete && f.roundIdx === latestIdx && f.roundIdx >= 0),
  );
  const fullIds = new Set(fullRows.map((f) => f.managerId));
  const rest = fallen.filter((f) => !fullIds.has(f.managerId));
  // One summary line per round, most recent first; the group-stage bucket last.
  const byRound = new Map<string, KnockoutFallen[]>();
  for (const f of rest) {
    const key = f.roundLabel ?? "Group stage";
    const list = byRound.get(key) ?? [];
    list.push(f);
    byRound.set(key, list);
  }
  const summary = [...byRound.entries()]
    .sort((x, y) => (y[1][0]?.roundIdx ?? -1) - (x[1][0]?.roundIdx ?? -1))
    .map(([label, list]) => `${label} — ${list.map((f) => f.displayName).join(" · ")}`)
    .join("  ·  ");

  return (
    <div className="ko-fallen">
      <button type="button" className="ko-fallen-hd" onClick={() => setOpen((o) => !o)}>
        <span className="arr" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span>THE FALLEN ({fallen.length})</span>
        <span className="ln" />
      </button>
      {open && (
        <>
          {fullRows.map((f) =>
            f.roundLabel ? (
              <button
                key={f.managerId}
                type="button"
                className={"ko-dead" + (f.isMe ? " is-me" : "")}
                onClick={() => onOpen(f.managerId, f.roundLabel!)}
              >
                <Avatar name={f.displayName} isMe={f.isMe} />
                <span className="ko-dead-name">{f.isMe ? "You" : f.displayName}</span>
                {f.points !== null && <span className="ko-dead-pts mono">{f.points}</span>}
                <span className="ko-dead-tag">{fallenTag(f)}</span>
                <span className="ko-dead-chev" aria-hidden="true">
                  ›
                </span>
              </button>
            ) : (
              <div key={f.managerId} className={"ko-dead is-inert" + (f.isMe ? " is-me" : "")}>
                <Avatar name={f.displayName} isMe={f.isMe} />
                <span className="ko-dead-name">{f.isMe ? "You" : f.displayName}</span>
                <span className="ko-dead-tag">{fallenTag(f)}</span>
              </div>
            ),
          )}
          {summary && <div className="ko-fallen-sum mono">{summary}</div>}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────── champion hero (state e) ─────────────────────────────── */

export function KOChampion({ ko }: { ko: KnockoutContext }) {
  if (!ko.champion) return null;
  const championRow = ko.ladder.find((r) => r.managerId === ko.champion!.managerId);
  return (
    <div className="ko-champ">
      <Machete cls="rest" />
      <img src="/brand/trophy.png" alt="" />
      <div className="ey">CHAMPION</div>
      <div className="who">{ko.champion.isMe ? "You" : ko.champion.displayName}</div>
      <div className="ln">
        {championRow ? (
          <>
            <b>{championRow.points} pts</b> in the Final ·{" "}
          </>
        ) : null}
        outlasted the whole field over {ko.totalRounds} rounds
      </div>
    </div>
  );
}

/* ─────────────────────────────── the ladder (authoritative order + FLIP/throttle) ─────────────────────────────── */

/**
 * FLIP row moves: capture each row's offsetTop (layout-relative — scroll-independent), and when a row
 * moved, play the inverted transform back to identity over ~300ms. Transform-only; skipped entirely
 * under prefers-reduced-motion.
 */
function useFlipRows(reduced: boolean) {
  const rowEls = useRef(new Map<string, HTMLElement>());
  const prevTops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const moves: [HTMLElement, number][] = [];
    rowEls.current.forEach((el, id) => {
      const top = el.offsetTop;
      const was = prevTops.current.get(id);
      if (was !== undefined && !reduced && Math.abs(was - top) > 1) moves.push([el, was - top]);
      prevTops.current.set(id, top);
    });
    if (moves.length === 0) return;
    for (const [el, dy] of moves) {
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
    }
    const raf = requestAnimationFrame(() => {
      for (const [el] of moves) {
        el.style.transition = "transform 300ms var(--ease-out)";
        el.style.transform = "";
      }
    });
    return () => cancelAnimationFrame(raf);
  });
  return (id: string) => (el: HTMLElement | null) => {
    if (el) rowEls.current.set(id, el);
    else rowEls.current.delete(id);
  };
}

/** Throttled display order (one re-sort per 10s) + flash ids for rows whose zone tag just flipped. */
function useLadderDisplay(ko: KnockoutContext) {
  const [orderState, setOrderState] = useState<LadderOrderState | null>(null);
  const incoming = ko.ladder.map((r) => r.managerId);
  const incomingKey = incoming.join("|");
  useEffect(() => {
    setOrderState((prev) => nextLadderOrder(prev, incoming, Date.now()));
  }, [incomingKey]);

  const [flashIds, setFlashIds] = useState<ReadonlySet<string>>(new Set());
  const prevZone = useRef<Set<string> | null>(null);
  const zoneKey = ko.zoneIds.join("|");
  useEffect(() => {
    const cur = new Set(ko.zoneIds);
    const prev = prevZone.current;
    prevZone.current = cur;
    if (!prev) return;
    const crossed = new Set<string>();
    cur.forEach((id) => {
      if (!prev.has(id)) crossed.add(id);
    });
    prev.forEach((id) => {
      if (!cur.has(id)) crossed.add(id);
    });
    if (crossed.size === 0) return;
    setFlashIds(crossed);
    const t = setTimeout(() => setFlashIds(new Set()), 1400);
    return () => clearTimeout(t);
  }, [zoneKey]);

  return { order: orderState?.order ?? incoming, flashIds };
}

export function KoLadder({
  ko,
  field,
  onSelect,
  dimLive,
  effSel,
  mob,
}: {
  ko: KnockoutContext;
  field: FieldEntry[];
  onSelect: (id: string) => void;
  dimLive: boolean;
  /** Desktop rail selection highlight ("field" | managerId); mobile passes null. */
  effSel: string | null;
  mob: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const { order, flashIds } = useLadderDisplay(ko);
  const rowRef = useFlipRows(reduced);
  const byId = new Map(field.map((e) => [e.managerId, e] as const));
  const ladderById = new Map(ko.ladder.map((r) => [r.managerId, r] as const));
  const zone = new Set(ko.zoneIds);
  const medals: Record<number, [string, string]> = ko.complete
    ? { 1: ["c", "CHAMPION"], 2: ["r", "RUNNER-UP"] }
    : {};

  return (
    <>
      {order.map((id, i) => {
        const entry = byId.get(id);
        const row = ladderById.get(id);
        const rank = row?.rank ?? i + 1;
        const medal = medals[rank];
        return (
          <div
            key={id}
            ref={rowRef(id)}
            className={
              "ko-rowwrap" +
              (flashIds.has(id) ? " ko-flash" : "") +
              (ko.complete && zone.has(id) ? " ko-final-cut" : "") +
              (medal ? " ko-medal-row" : "")
            }
          >
            {!ko.complete && i === ko.cutIndex && <KOCutLine cutCount={ko.cutCount} />}
            {medal && (
              <span className={"ko-medal " + medal[0]} aria-hidden="true">
                {medal[1]}
              </span>
            )}
            {entry ? (
              mob ? (
                <MaRow
                  entry={entry}
                  onTap={onSelect}
                  dimLive={dimLive}
                  block={!ko.complete && zone.has(id)}
                  rank={rank}
                />
              ) : (
                <LbRow
                  entry={entry}
                  selected={effSel === id}
                  onSelect={onSelect}
                  dimLive={dimLive}
                  block={!ko.complete && zone.has(id)}
                  rank={rank}
                />
              )
            ) : (
              // Complete-arm ghost: the Final's cuts are filtered off the live field — render the
              // identity row from the ko ladder itself (name struck, medal/rtag treatment via CSS).
              <div className={"ko-ghost" + (row?.isMe ? " is-me" : "")}>
                <span className="ma-row-rk mono">{rank}</span>
                <Avatar name={row?.displayName ?? id} isMe={row?.isMe} />
                <span className="ko-ghost-name">
                  {row?.isMe ? "You" : (row?.displayName ?? id)}
                </span>
                <span className="ko-dead-tag">cut in {ko.roundLabel}</span>
                <span className="ko-ghost-pts mono">{row?.points ?? ""}</span>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/* ─────────────────────────────── drill-in bottom sheet ─────────────────────────────── */

export function KOSheet({
  open,
  onClose,
  header,
  children,
}: {
  open: boolean;
  onClose: () => void;
  header: ReactNode;
  children: ReactNode;
}) {
  useScrollLock(open);
  if (!open) return null;
  return (
    <div className="ko-sheetwrap" role="dialog" aria-modal="true" aria-label="Head to head">
      <div className="ko-scrim" onClick={onClose} aria-hidden="true" />
      <div className="ko-sheet">
        <div className="ko-grab" aria-hidden="true">
          <i />
        </div>
        <div className="ko-shead">
          {header}
          <button type="button" className="ko-shead-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="ko-sheet-scroll">{children}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── the cutting ceremony ─────────────────────────────── */

type CeremonyPhase = "armed" | "wind" | "drop" | "aftermath";

export function KOCeremony({ ko, onClose }: { ko: KnockoutContext; onClose: () => void }) {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<CeremonyPhase>("armed");
  useScrollLock(true);
  useEffect(() => {
    if (reduced) {
      setPhase("aftermath");
      return;
    }
    const a = setTimeout(() => setPhase("wind"), 700);
    const b = setTimeout(() => setPhase("drop"), 1900);
    const c = setTimeout(() => setPhase("aftermath"), 2450);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
      clearTimeout(c);
    };
  }, [reduced]);
  const s = ko.settled;
  if (!s) return null;
  const after = phase === "aftermath";
  return (
    <div
      className={"koc is-" + phase}
      onClick={() => (after ? onClose() : setPhase("aftermath"))}
    >
      <div className="koc-inner" onClick={(e) => e.stopPropagation()}>
        <div className="koc-eyebrow">{s.roundLabel} · RESULTS OFFICIAL</div>
        <div className="koc-head">
          {after ? "THE BLADE HAS FALLEN" : `LOWEST ${s.cutCount} GET THE CHOP`}
        </div>
        <div className="koc-sub">
          {after ? `${s.aliveAfter} advance to the next round` : "The Chocoyo doesn’t miss."}
        </div>
        <div className="koc-mech">
          <Machete cls="koc-mach" />
          <img className="koc-trophy" src="/brand/trophy.png" alt="" />
          <span className="koc-slash" aria-hidden="true" />
        </div>
        <div className="koc-victims">
          {s.victims.map((v) => (
            <div key={v.managerId} className={"koc-victim" + (after ? " is-out" : "")}>
              <span className="koc-blood" aria-hidden="true" />
              <Avatar name={v.displayName} isMe={v.isMe} />
              <span className="koc-stamp">Eliminated!</span>
              <b className="koc-vname">{v.isMe ? "You" : v.displayName}</b>
              <span className="koc-vpts mono">{v.points} pts</span>
            </div>
          ))}
        </div>
        {after && (
          <div className="koc-verdict">
            {s.viewerOutcome === "out" ? (
              <span className="koc-verdict-out">
                ✗ Your run ends here{s.viewerRank ? ` — ${ordinal(s.viewerRank)} of ${s.viewerOf}` : ""}
              </span>
            ) : s.viewerOutcome === "survived" ? (
              <span className="koc-verdict-safe">
                ✓ You survive — {ordinal(s.viewerRank ?? 0)} of {s.viewerOf}
                {s.viewerMargin !== null
                  ? ` · ${s.viewerMargin > 0 ? "+" : ""}${s.viewerMargin} clear`
                  : ""}
              </span>
            ) : (
              <span className="koc-verdict-safe">The field narrows to {s.aliveAfter}</span>
            )}
            {/* Carry-forward FAAB truth (DECISIONS): the budget is one-time $100 for the whole
                tournament — NEVER "resets" (the reference line here is the excluded P1 stale copy). */}
            <span className="koc-faab">
              Your FAAB carries over — <a href="/waivers">reinforce via waivers</a>
            </span>
          </div>
        )}
        <div className="koc-actions">
          {after ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
              Back to the ladder
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPhase("aftermath")}
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
