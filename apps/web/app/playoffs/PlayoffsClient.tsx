"use client";
/**
 * The guillotine theater client shell — a thin AUTHED client over server-computed state (ARCHITECTURE §21).
 * It hydrates the SSR `loadPlayoffs` snapshot, then keeps it fresh: a JWT-authed Supabase Realtime
 * subscription (the Prompt-08 / vsfield pattern, reused via `startPlayoffsLive`) on `score_manager_period`
 * + `playoff_entry` NUDGES a refetch of the server-computed snapshot (`GET /api/playoffs`), with a
 * visibility-gated 20s poll as the documented fallback. The browser reads ONLY those two tables; the ladder,
 * the provisional cut, the reduced pitch + names are all server-derived (Theme F). The browser holds NO
 * playoff logic — only presentational layout state (board↔ladder, which round the nav inspects).
 *
 * The auth lifecycle lives here (Prompt-08 / mock-draft fix): `onAuthStateChange` fires INITIAL_SESSION once
 * the cookie session hydrates, then TOKEN_REFRESHED on refresh — each (re)creates the live controller with
 * the fresh JWT, tearing the prior one down first. `setAuth`-before-subscribe + the change-nudge→refetch +
 * the visibility-gated poll are all inside the (unit-tested) `startPlayoffsLive`.
 */
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { startPlayoffsLive } from "@/src/playoffs/liveController";
import { fetchPlayoffs } from "@/src/playoffs/snapshotClient";
import type { RealtimeClientLike } from "@/src/playoffs/realtime";
import type { PlayoffsView } from "./loadPlayoffs";
import {
  ConnPill,
  DesktopPlayoffs,
  MobilePlayoffs,
  type ConnState,
  type HeroDrop,
} from "./components";
import "./playoffs.css";

// The blade choreography timing (client-side; the loader is clockless). wind = "Chocoyo raises the
// blade", drop = "Chocoyo swings" → "CHOP!"; then the hero settles back onto the new live round.
const BLADE_WIND_MS = 850;
const BLADE_SETTLE_MS = 1950;

export function PlayoffsClient({ initialView }: { initialView: PlayoffsView }) {
  const [view, setView] = useState<PlayoffsView>(initialView);
  const [conn, setConn] = useState<ConnState>("loading");

  // ── the blade CHOREOGRAPHY — a purely CLIENT-side state machine (STOP seam: no loader/view-model
  // change; the snapshot is clockless). At rest the hero centres on the live round (idle sway) or, once
  // complete, the settled champion state. The drop fires ONE-TIME only when a round the client is
  // WATCHING flips live→past between refetches — detected by a transition latch over per-round-idx status
  // (round idx is a stable identity). It never loops and never fires on mount for an already-past round.
  const [drop, setDrop] = useState<HeroDrop>({
    focusIdx: initialView.currentRoundIdx,
    phase: "rest",
  });
  const prevStatusRef = useRef<string[] | null>(null);
  const currentIdxRef = useRef(view.currentRoundIdx);
  currentIdxRef.current = view.currentRoundIdx;
  const reducedMotionRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Read the reduced-motion preference once (client only); declared BEFORE the latch so the ref is set.
  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const cur = view.rounds.map((r) => r.status);
    const prev = prevStatusRef.current;
    prevStatusRef.current = cur;

    // No history yet (first render) or reduced motion → never animate; just settle on the current round.
    if (!prev || reducedMotionRef.current) {
      setDrop((d) =>
        d.phase === "rest" && d.focusIdx === view.currentRoundIdx
          ? d
          : { focusIdx: view.currentRoundIdx, phase: "rest" },
      );
      return;
    }

    // A round the client was watching flipped live→past → a cut just landed. Play wind → drop → settle
    // onto the (now-advanced) live round. Round idx is stable, so this is unambiguous across refetches.
    const flipped = cur.findIndex((s, i) => prev[i] === "live" && s === "past");
    if (flipped === -1) {
      // No cut this refetch — keep the hero on the current round, but never interrupt a running swing.
      setDrop((d) =>
        d.phase !== "rest" || d.focusIdx === view.currentRoundIdx
          ? d
          : { focusIdx: view.currentRoundIdx, phase: "rest" },
      );
      return;
    }

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setDrop({ focusIdx: flipped, phase: "wind" });
    timersRef.current.push(
      setTimeout(() => setDrop({ focusIdx: flipped, phase: "drop" }), BLADE_WIND_MS),
    );
    // Settle onto the LATEST live round (currentIdxRef, not the stale closure) once reactions clear.
    timersRef.current.push(
      setTimeout(
        () => setDrop({ focusIdx: currentIdxRef.current, phase: "rest" }),
        BLADE_SETTLE_MS,
      ),
    );
  }, [view]);

  useEffect(() => {
    const supabase = createClient();
    let teardown: (() => void) | undefined;
    let cancelled = false;

    const resubscribe = (token: string | null) => {
      teardown?.();
      teardown = undefined;
      // Gate on a real session: an anon socket receives zero RLS-gated postgres_changes.
      if (cancelled || !token) return;
      teardown = startPlayoffsLive({
        client: supabase as unknown as RealtimeClientLike,
        accessToken: token,
        fetchSnapshot: () => fetchPlayoffs({ fetch: (input, init) => fetch(input, init) }),
        onSnapshot: (v) => setView(v),
        // Page Visibility via a window-bound lambda wrapper (never a bare ref) — the poll skips a hidden tab.
        isVisible: () => !document.hidden,
        onStatus: (status) =>
          setConn(
            status === "SUBSCRIBED"
              ? "live"
              : status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED"
                ? "reconnecting"
                : "loading",
          ),
      });
    };

    // INITIAL_SESSION (cookie hydrated) → first subscribe; TOKEN_REFRESHED → re-subscribe fresh.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      resubscribe(session?.access_token ?? null);
    });

    return () => {
      cancelled = true;
      teardown?.();
      subscription.unsubscribe();
    };
    // Empty deps (unlike vsfield's [leagueId, currentPeriodId]): BOTH bindings are unfiltered, so there is
    // nothing data-driven to re-subscribe on — the auth lifecycle (onAuthStateChange) is the only re-subscribe.
  }, []);

  const currentRound = view.rounds[view.currentRoundIdx];

  return (
    <div className="po-app">
      {/* De-branded screen-context strip: the brand lockup lives ONCE in the AppShell topbar (BRAND.md §5),
          so the body keeps only the screen label + the live round line + the layout toggle + ConnPill. */}
      <div className="po-screenhead">
        <div className="po-screenhead-title">
          {/* T15-CUT demote-lite: /playoffs is the ceremonial THEATER — the Board/Ladder toggle
              (walkthrough step-64's status-bar-zone tap trap) is gone with the board; the live
              ladder lives on The Cut (/vsfield). The Chocoyo hero below owns the show. */}
          <b className="display">Theater</b>
          <span className="t-micro text-tertiary" style={{ letterSpacing: ".06em" }}>
            {currentRound
              ? `${currentRound.round.toUpperCase()} · ROUND ${view.currentRoundIdx + 1} OF ${view.totalRounds}`
              : "KNOCKOUT PLAYOFFS"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ConnPill state={conn} />
        </div>
      </div>

      {conn === "reconnecting" && (
        <div className="po-banner po-banner-recon">
          Reconnecting — points may be a moment behind.
        </div>
      )}

      {/* The champion / tournament-complete endgame is OWNED BY THE HERO (it swaps the CHOP framing for
          the celebratory trophy in-place), so there is no separate top-of-page ChampionBanner. */}
      <DesktopPlayoffs view={view} drop={drop} />
      <MobilePlayoffs view={view} drop={drop} />
    </div>
  );
}
