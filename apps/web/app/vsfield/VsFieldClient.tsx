"use client";
/**
 * The "vs the field" client shell — a thin AUTHED client over server-computed state. It hydrates the
 * SSR snapshot, then keeps it fresh: a JWT-authed Supabase Realtime subscription (Prompt-08 pattern,
 * reused via `startVsFieldLive`) on `score_manager_period` + `standing` NUDGES a refetch of the
 * server-computed snapshot (`GET /api/vsfield`), with a 15–30s poll as the documented fallback. The
 * browser reads ONLY those two tables; the field/H2H/still-to-come are all server-derived.
 *
 * The auth lifecycle lives here (Prompt-08 / mock-draft fix): `onAuthStateChange` fires INITIAL_SESSION
 * once the cookie session hydrates, then TOKEN_REFRESHED on refresh — each (re)creates the live
 * controller with the fresh JWT, tearing the prior one down first. `setAuth`-before-subscribe + the
 * change-nudge→refetch + the poll are all inside the (unit-tested) `startVsFieldLive`.
 */
import { useEffect, useState } from "react";
import type { VsFieldView } from "@app/vsfield";
import { createClient } from "@/lib/supabase/client";
import { startVsFieldLive } from "@/src/vsfield/liveController";
import { fetchVsField } from "@/src/vsfield/snapshotClient";
import type { RealtimeClientLike } from "@/src/vsfield/realtime";
import { PlayerScoreSheet } from "@/components/PlayerScoreSheet";
import {
  CompareBand,
  ConnPill,
  Leaderboard,
  MaH2H,
  MaStandings,
  MatchStrip,
  SeasonTable,
  XIPanel,
  YouVsField,
  type ConnState,
} from "./components";

const VIEW_TABS: ["period" | "season", string][] = [
  ["period", "This period"],
  ["season", "Season"],
];

export function VsFieldClient({ initialView }: { initialView: VsFieldView }) {
  const [view, setView] = useState<VsFieldView>(initialView);
  const [conn, setConn] = useState<ConnState>("loading");
  const [tab, setTab] = useState<"period" | "season">("period");
  // Direction-A selection (replaces `selected`): `"field"` = the aggregate view, a managerId (UUID —
  // can never collide with the sentinel) = that opponent's H2H, null = nothing picked yet. Desktop
  // resolves null → "field" (the cockpit always shows something); mobile keeps null as the
  // leaderboard-first home and treats "field"/managerId as drill-ins with a back button.
  const [effSel, setEffSel] = useState<string | null>(null);
  // Box-score modal target. INFO-ONLY on vsfield: opened from the H2H XI lists for a played/locked
  // player (own OR opponent's), rendered with NO forfeitProps — vsfield never edits lineups.
  const [boxPlayer, setBoxPlayer] = useState<string | null>(null);

  const { leagueId } = initialView;
  // Drive the subscription from the LIVE period, not the SSR-frozen one: a mid-session wave rollover
  // (or pre-season → first matchday) changes this id, so the effect tears down + re-subscribes the
  // score binding to the new period. Normal refetches keep the same id → no re-subscribe thrash.
  const currentPeriodId = view.currentPeriod?.id ?? null;

  useEffect(() => {
    const supabase = createClient();
    let teardown: (() => void) | undefined;
    let cancelled = false;

    const resubscribe = (token: string | null) => {
      teardown?.();
      teardown = undefined;
      // Gate on a real session: an anon socket receives zero RLS-gated postgres_changes.
      if (cancelled || !token) return;
      teardown = startVsFieldLive({
        client: supabase as unknown as RealtimeClientLike,
        args: { leagueId, currentPeriodId },
        accessToken: token,
        fetchSnapshot: () => fetchVsField({ fetch: (input, init) => fetch(input, init) }),
        onSnapshot: (v) => setView(v),
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
  }, [leagueId, currentPeriodId]);

  // Compute the "updated" label CLIENT-ONLY (after mount) so the server (UTC) and the browser (local
  // tz) don't disagree on the SSR text node — a hydration mismatch. asOf is a tz-stable UTC ISO string.
  const [updated, setUpdated] = useState<string | null>(null);
  useEffect(() => {
    setUpdated(new Date(view.asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  }, [view.asOf]);

  const periodLabel = view.currentPeriod?.label ?? "No live period";
  const noPeriod = view.currentPeriod === null;
  const empty = view.field.every((e) => e.points === 0);

  // Desktop always shows a main view; selecting your own row collapses to the aggregate.
  const meId = view.field.find((e) => e.isMe)?.managerId ?? null;
  const select = (id: string) => setEffSel(id === meId ? "field" : id);
  const desktopSel = effSel ?? "field";
  const opp =
    desktopSel !== "field" ? view.field.find((e) => e.managerId === desktopSel) : undefined;
  const me = view.field.find((e) => e.isMe);
  const dimLive = conn !== "live";

  return (
    <div className="vf-app">
      <div className="vf-top">
        {/* De-branded screen-context strip. The brand lockup (trophy · "XI" · league name) now lives
            ONCE in the AppShell topbar (Prompt 20 / BRAND.md §1/§5), so the body's former `.vf-logo` "W"
            badge + wordmark were removed here to stop doubling it — mirrors the Prompt-22 `.dr-logo`
            de-dup. This keeps only the vsfield-LOCAL context: the screen label + the live period line. */}
        <div className="vf-status">
          <b className="display vf-brand-title">The Field</b>
          <span className="t-micro text-tertiary" style={{ letterSpacing: ".06em" }}>
            {periodLabel.toUpperCase()}
          </span>
        </div>
        <div className="tabs vf-viewtabs">
          {VIEW_TABS.map(([k, l]) => (
            <button
              key={k}
              className={"tab" + (tab === k ? " is-active" : "")}
              onClick={() => setTab(k)}
            >
              {l}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div className="vf-top-right">
          <span className="t-micro text-tertiary">Updated {updated ?? "…"}</span>
          <ConnPill state={conn} />
        </div>
      </div>

      {tab === "season" ? (
        <div className="vf-scroll">
          <SeasonTable season={view.season} />
        </div>
      ) : (
        <>
          <MatchStrip matches={view.matches} />
          {noPeriod ? (
            <div className="vf-banner vf-banner-empty">
              No live scoring period right now — the field lights up when the next matchday opens.
              The season standings are under the Season tab.
            </div>
          ) : (
            empty && (
              <div className="vf-banner vf-banner-empty">
                Scoring hasn’t started — points begin at kickoff. Every manager’s full XI is still
                swappable right now.
              </div>
            )
          )}
          {/* Desktop split cockpit: leaderboard left rail + the compare/aggregate main area.
              Hidden on phones via the .da-body media query (the .ma-scroll tree takes over). */}
          <div className="da-body">
            <Leaderboard
              field={view.field}
              effSel={desktopSel}
              onSelect={select}
              dimLive={dimLive}
            />
            <div className="da-main">
              <div className="da-scroll">
                {me && opp && !opp.isMe ? (
                  <>
                    <CompareBand me={me} opp={opp} />
                    <div className="da-teams2">
                      <XIPanel entry={me} onOpenPlayer={setBoxPlayer} dimLive={dimLive} />
                      <XIPanel entry={opp} onOpenPlayer={setBoxPlayer} dimLive={dimLive} />
                    </div>
                    <p
                      className="t-caption text-tertiary"
                      style={{ textAlign: "center", margin: "2px 0 0" }}
                    >
                      Tap any player for the categories &amp; stats behind their points · kit
                      brightness shows lock-on-play
                    </p>
                  </>
                ) : (
                  <YouVsField
                    field={view.field}
                    periodLabel={periodLabel}
                    onOpenPlayer={setBoxPlayer}
                    dimLive={dimLive}
                  />
                )}
              </div>
            </div>
          </div>
          {/* Mobile (leaderboard-first) tree — shown only under the .ma-scroll media query. */}
          <div className="ma-scroll">
            {effSel === null ? (
              <MaStandings field={view.field} onSelect={select} dimLive={dimLive} />
            ) : effSel === "field" || effSel === meId ? (
              <>
                <button
                  type="button"
                  className="ma-back"
                  onClick={() => setEffSel(null)}
                  style={{ marginBottom: 10 }}
                >
                  ‹ Standings
                </button>
                <YouVsField
                  field={view.field}
                  periodLabel={periodLabel}
                  onOpenPlayer={setBoxPlayer}
                  dimLive={dimLive}
                />
              </>
            ) : (
              <MaH2H
                field={view.field}
                oppId={effSel}
                onBack={() => setEffSel(null)}
                onOpenPlayer={setBoxPlayer}
                dimLive={dimLive}
              />
            )}
          </div>
        </>
      )}

      {/* Info-only box-score modal — NO forfeitProps (vsfield never edits lineups). currentPeriod is
          present whenever a played/locked player exists, but guard it so playerId+periodId pair up. */}
      {boxPlayer && view.currentPeriod && (
        <PlayerScoreSheet
          periodId={view.currentPeriod.id}
          playerId={boxPlayer}
          onClose={() => setBoxPlayer(null)}
        />
      )}
    </div>
  );
}
