"use client";
/**
 * Standings client shell — a thin AUTHED client over server-computed state (ARCHITECTURE §4 read
 * surface). It hydrates the SSR `loadStandings` snapshot and keeps it fresh: a JWT-authed Supabase
 * Realtime subscription (the vsfield / playoffs pattern, reused via `startStandingsLive`) on
 * `score_manager_period` + `standing` NUDGES a refetch of the server-computed snapshot
 * (`GET /api/standings`), with a visibility-gated 20s poll as the documented fallback. The browser
 * reads ONLY those two tables; both tabs are server-derived (Theme F). The browser holds NO standings
 * logic — only presentational state (active tab, selected matchday, expanded row).
 *
 * Auth lifecycle (Prompt-08 / mock-draft fix): `onAuthStateChange` fires INITIAL_SESSION once the cookie
 * session hydrates, then TOKEN_REFRESHED on refresh — each (re)creates the live controller with a fresh
 * JWT, tearing the prior one down first. `setAuth`-before-subscribe + change-nudge→refetch + the
 * visibility-gated poll all live inside the unit-tested `startStandingsLive`.
 */
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { startStandingsLive } from "@/src/standings/liveController";
import { fetchStandings } from "@/src/standings/snapshotClient";
import type { RealtimeClientLike } from "@/src/standings/realtime";
import type { StandingsView } from "@app/recompute";
import {
  ConnPill,
  ContextBand,
  CumulativeTable,
  MatchdayPanel,
  type ConnState,
} from "./components";
import "./standings.css";

type Tab = "matchday" | "cumulative";

export function StandingsClient({ initial }: { initial: StandingsView }) {
  const [view, setView] = useState<StandingsView>(initial);
  const [conn, setConn] = useState<ConnState>("loading");
  const [tab, setTab] = useState<Tab>("matchday");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(
    initial.defaultMatchdayPeriodId,
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let teardown: (() => void) | undefined;
    let cancelled = false;

    const resubscribe = (token: string | null) => {
      teardown?.();
      teardown = undefined;
      if (cancelled || !token) return; // anon socket receives zero RLS-gated postgres_changes
      teardown = startStandingsLive({
        client: supabase as unknown as RealtimeClientLike,
        accessToken: token,
        fetchSnapshot: () => fetchStandings({ fetch: (input, init) => fetch(input, init) }),
        onSnapshot: (v) => setView(v),
        // Page Visibility via a window-bound lambda wrapper (never a bare ref) — poll skips a hidden tab.
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
    // Empty deps (both bindings unfiltered) — only the auth lifecycle re-subscribes.
  }, []);

  // The selected matchday survives a refetch while it still exists; otherwise fall back to the default
  // (the live period if any, else the latest scored). Live reorders apply automatically.
  const effectiveSelected =
    selectedPeriodId && view.matchday[selectedPeriodId]
      ? selectedPeriodId
      : view.defaultMatchdayPeriodId;
  const matchdayRows = effectiveSelected ? (view.matchday[effectiveSelected] ?? []) : [];

  return (
    <div className="st-app">
      <div className="st-screenhead">
        <div className="st-screenhead-title">
          <h1 className="t-h2">Standings</h1>
          <span className="t-micro text-tertiary">All-play-all power record · Group stage</span>
        </div>
        <div className="st-screenhead-right">
          {conn === "reconnecting" && (
            <span className="st-recon t-micro">Reconnecting — points may be a moment behind.</span>
          )}
          <ConnPill state={conn} />
        </div>
      </div>

      <div className="tabs st-tabs" role="tablist" aria-label="Standings view">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "matchday"}
          className={"tab" + (tab === "matchday" ? " is-active" : "")}
          onClick={() => setTab("matchday")}
        >
          Matchday
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "cumulative"}
          className={"tab" + (tab === "cumulative" ? " is-active" : "")}
          onClick={() => setTab("cumulative")}
        >
          Cumulative
        </button>
      </div>

      {tab === "matchday" ? (
        <MatchdayPanel
          periods={view.periods}
          selectedId={effectiveSelected}
          onSelect={setSelectedPeriodId}
          rows={matchdayRows}
        />
      ) : (
        <div className="st-cumulative">
          <ContextBand rows={view.cumulative} fieldSize={view.fieldSize} />
          <CumulativeTable
            rows={view.cumulative}
            fieldSize={view.fieldSize}
            expandedId={expandedId}
            onExpand={setExpandedId}
          />
        </div>
      )}
    </div>
  );
}
