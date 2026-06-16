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
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { startPlayoffsLive } from "@/src/playoffs/liveController";
import { fetchPlayoffs } from "@/src/playoffs/snapshotClient";
import type { RealtimeClientLike } from "@/src/playoffs/realtime";
import { buildReducedPitch } from "@/src/playoffs/theaterView";
import type { PlayoffsView } from "./loadPlayoffs";
import {
  ChampionBanner,
  ConnPill,
  DesktopPlayoffs,
  MobilePlayoffs,
  type ConnState,
} from "./components";
import "./playoffs.css";

export function PlayoffsClient({ initialView }: { initialView: PlayoffsView }) {
  const [view, setView] = useState<PlayoffsView>(initialView);
  const [conn, setConn] = useState<ConnState>("loading");
  const [layout, setLayout] = useState<"board" | "ladder">("board");
  // The round the board/nav inspects. null = FOLLOW the live round (the default) — so a refetch that
  // advances the cut (round rollover) moves the board with it; a user click PINS a specific round.
  const [pinnedRoundIdx, setPinnedRoundIdx] = useState<number | null>(null);
  const viewRoundIdx = pinnedRoundIdx ?? view.currentRoundIdx;

  // The viewer's reduced playoff pitch, mapped from the server-composed reducedLineup (live lock + pts).
  const pitch = useMemo(() => buildReducedPitch(view.reducedLineup), [view.reducedLineup]);

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
          <b className="display">Guillotine</b>
          <span className="t-micro text-tertiary" style={{ letterSpacing: ".06em" }}>
            {currentRound
              ? `${currentRound.round.toUpperCase()} · ROUND ${view.currentRoundIdx + 1} OF ${view.totalRounds}`
              : "KNOCKOUT PLAYOFFS"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="tabs po-layout-tabs">
            <button
              type="button"
              className={"tab" + (layout === "board" ? " is-active" : "")}
              onClick={() => setLayout("board")}
            >
              Board
            </button>
            <button
              type="button"
              className={"tab" + (layout === "ladder" ? " is-active" : "")}
              onClick={() => setLayout("ladder")}
            >
              Ladder
            </button>
          </div>
          <ConnPill state={conn} />
        </div>
      </div>

      {view.complete && view.champion && (
        <ChampionBanner
          champion={view.champion}
          names={view.managerNames}
          viewerId={view.managerId}
        />
      )}

      {conn === "reconnecting" && (
        <div className="po-banner po-banner-recon">
          Reconnecting — points may be a moment behind.
        </div>
      )}

      <DesktopPlayoffs
        view={view}
        pitch={pitch}
        layout={layout}
        viewRoundIdx={viewRoundIdx}
        onViewRound={setPinnedRoundIdx}
      />
      <MobilePlayoffs
        view={view}
        layout={layout}
        viewRoundIdx={viewRoundIdx}
        onViewRound={setPinnedRoundIdx}
      />
    </div>
  );
}
