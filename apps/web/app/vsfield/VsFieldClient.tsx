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
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { VsFieldViewWithBenches } from "@/src/vsfield/benches";
import { createClient } from "@/lib/supabase/client";
import { startVsFieldLive } from "@/src/vsfield/liveController";
import { fetchVsField } from "@/src/vsfield/snapshotClient";
import type { RealtimeClientLike } from "@/src/vsfield/realtime";
import { PlayerScoreSheet } from "@/components/PlayerScoreSheet";
import {
  Avatar,
  BenchStrip,
  benchFor,
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
import {
  KOCeremony,
  KOChampion,
  KOFallen,
  KOMarquee,
  KOReducedShape,
  KOSheet,
  KOYouBand,
  KoLadder,
  ordinal,
} from "./KnockoutUI";

const VIEW_TABS: ["period" | "season", string][] = [
  ["period", "This period"],
  ["season", "Season"],
];

export function VsFieldClient({
  initialView,
  initialSelection = null,
}: {
  initialView: VsFieldViewWithBenches;
  /**
   * Server-validated deep-link seed for `effSel` (`?manager=<id>` → that manager's H2H, or `"field"`
   * for your own row; null when absent/unknown). Mount-only — `useState`'s initializer ignores it on
   * later renders, so live refetches and manual selection are never overridden / re-seeded.
   */
  initialSelection?: string | null;
}) {
  const [view, setView] = useState<VsFieldViewWithBenches>(initialView);
  const [conn, setConn] = useState<ConnState>("loading");
  const [tab, setTab] = useState<"period" | "season">("period");
  // Direction-A selection (replaces `selected`): `"field"` = the aggregate view, a managerId (UUID —
  // can never collide with the sentinel) = that opponent's H2H, null = nothing picked yet. Desktop
  // resolves null → "field" (the cockpit always shows something); mobile keeps null as the
  // leaderboard-first home and treats "field"/managerId as drill-ins with a back button.
  const [effSel, setEffSel] = useState<string | null>(initialSelection);
  // Box-score modal target. INFO-ONLY on vsfield: opened from the H2H XI lists for a played/locked
  // player (own OR opponent's), rendered with NO forfeitProps — vsfield never edits lineups.
  const [boxPlayer, setBoxPlayer] = useState<string | null>(null);

  const { leagueId } = initialView;
  // T15-CUT: the knockout ("The Cut") projection — present only on the live knockout wave (or the
  // champion endgame). undefined ⇒ every ko branch below is inert and the group render is unchanged.
  const ko = view.ko;
  // Drive the subscription from the LIVE period, not the SSR-frozen one: a mid-session wave rollover
  // (or pre-season → first matchday) changes this id, so the effect tears down + re-subscribes the
  // score binding to the new period. Normal refetches keep the same id → no re-subscribe thrash.
  const currentPeriodId = view.currentPeriod?.id ?? null;
  // T11: the live Realtime subscription runs ONLY for the live wave. A selected prior matchday is static
  // (fully scored, fully revealed because locked), so there is nothing to subscribe to — and the refetch
  // path (GET /api/vsfield, which always loads the live wave) must not overwrite the historical snapshot.
  const isLivePeriod = view.isLivePeriod;

  useEffect(() => {
    if (!isLivePeriod) {
      setConn("historical");
      return;
    }
    const supabase = createClient();
    let teardown: (() => void) | undefined;
    let cancelled = false;

    const resubscribe = (token: string | null) => {
      teardown?.();
      teardown = undefined;
      // Gate on a real session: an anon socket receives zero RLS-gated postgres_changes.
      if (cancelled || !token) return;
      teardown = startVsFieldLive<VsFieldViewWithBenches>({
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
  }, [leagueId, currentPeriodId, isLivePeriod]);

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
  // Dim only while a LIVE wave is mid-reconnect. A prior matchday is settled (everything locked/played), so
  // it shows at full brightness regardless of `conn`.
  const dimLive = isLivePeriod && conn !== "live";

  // T11 prior-matchday selector. The default (live) view carries no `?period`, so the first load is
  // byte-identical; selecting any option navigates with `?period=<id>` (preserving `?manager`), which
  // re-runs the server component through the SAME loadVsField read path. Shown only when a prior exists.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectPeriod = (periodId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", periodId);
    router.push(`${pathname}?${params.toString()}`);
  };
  const displayedPeriodId = view.currentPeriod?.id ?? null;

  // ── T15-CUT client state (every hook runs unconditionally; all render branches gate on `ko`) ──

  // Phone detection for the drill-in SHEET mount only (the sheet is a phone pattern; desktop keeps the
  // split cockpit). A matchMedia hook — not a layout fork — because the sheet carries a body-scroll-lock
  // side effect that must never fire on desktop. Initial false ⇒ hydration-safe.
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 760px)");
    setIsPhone(mq.matches);
    const onChange = () => setIsPhone(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // The cutting-ceremony transition latch (the shipped Chocoyo pattern): fires ONE-TIME when a round
  // the client was watching flips live→past between refetches — never on mount, never in a loop.
  // KOCeremony itself honors prefers-reduced-motion (static aftermath — the verdict is information).
  const [ceremonyOpen, setCeremonyOpen] = useState(false);
  const prevRoundStatuses = useRef<readonly string[] | null>(null);
  useEffect(() => {
    const cur = ko?.roundStatuses ?? null;
    const prev = prevRoundStatuses.current;
    prevRoundStatuses.current = cur;
    if (!cur || !prev || prev.length !== cur.length) return;
    const flipped = cur.findIndex((s, i) => prev[i] === "live" && s === "past");
    if (flipped !== -1 && ko?.settled) setCeremonyOpen(true);
  }, [view, ko]);

  // The mobile drill-in opens as a bottom sheet pushing the EXISTING validated `?manager=` param via
  // native history (Next App Router shallow support), so the hardware back-gesture closes it. Desktop
  // selection (the cockpit) never touches history — same as today.
  const pushedSheetRef = useRef(false);
  const fieldRef = useRef(view.field);
  fieldRef.current = view.field;
  const openManagerSheet = (id: string) => {
    setEffSel(id === meId ? "field" : id);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("manager", id);
    window.history.pushState({ koSheet: true }, "", url);
    pushedSheetRef.current = true;
  };
  const closeManagerSheet = () => {
    if (pushedSheetRef.current) {
      pushedSheetRef.current = false;
      window.history.back();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("manager");
    window.history.replaceState({}, "", url);
    setEffSel(null);
  };
  useEffect(() => {
    if (!ko) return;
    const onPop = () => {
      pushedSheetRef.current = false;
      const id = new URLSearchParams(window.location.search).get("manager");
      setEffSel(id && fieldRef.current.some((e) => e.managerId === id) ? id : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [ko !== undefined]);

  // A fallen row's drill-in is a T11 lookup of their CUT round (started prior ⇒ fully revealed):
  // navigate to that period with the manager pre-selected — the same server-gated read path.
  const openFallenLookup = (managerId: string, roundLabel: string) => {
    const target = view.selectablePeriods.find((p) => p.label === roundLabel);
    if (!target) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", target.id);
    params.set("manager", managerId);
    router.push(`${pathname}?${params.toString()}`);
  };

  // Sheet identity header — PINNED TO THE MANAGER (rank/pts update live from the latest snapshot).
  const sheetManagerId = ko && isPhone && effSel && effSel !== "field" ? effSel : null;
  const sheetEntry = sheetManagerId
    ? view.field.find((e) => e.managerId === sheetManagerId)
    : undefined;
  const sheetRow = sheetManagerId
    ? ko?.ladder.find((r) => r.managerId === sheetManagerId)
    : undefined;

  return (
    <div className="vf-app">
      <div className="vf-top">
        {/* De-branded screen-context strip. The brand lockup (trophy · "XI" · league name) now lives
            ONCE in the AppShell topbar (Prompt 20 / BRAND.md §1/§5), so the body's former `.vf-logo` "W"
            badge + wordmark were removed here to stop doubling it — mirrors the Prompt-22 `.dr-logo`
            de-dup. This keeps only the vsfield-LOCAL context: the screen label + the live period line. */}
        <div className="vf-status">
          <b className="display vf-brand-title">{ko ? "The Cut" : "The Field"}</b>
          <span className="t-micro text-tertiary" style={{ letterSpacing: ".06em" }}>
            {ko ? `${ko.roundName.toUpperCase()} · GUILLOTINE` : periodLabel.toUpperCase()}
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
          {isLivePeriod && <span className="t-micro text-tertiary">Updated {updated ?? "…"}</span>}
          <ConnPill state={conn} />
        </div>
      </div>

      {/* T11 prior-matchday selector — completed priors + the live one, in canonical order. Shown only on
          the period tab and only when a prior exists. Selecting one re-runs loadVsField for that period;
          a prior is fully revealed because it is over, and future matchdays are never offered. */}
      {tab === "period" && view.selectablePeriods.length > 1 && (
        <div className="tabs vf-periodtabs" role="tablist" aria-label="Matchday">
          {view.selectablePeriods.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === displayedPeriodId}
              className={"tab" + (p.id === displayedPeriodId ? " is-active" : "")}
              onClick={() => selectPeriod(p.id)}
            >
              {p.label}
              {p.isLive && <span className="vf-tab-sub t-micro"> · live</span>}
            </button>
          ))}
        </div>
      )}

      {tab === "season" ? (
        <div className="vf-scroll">
          <SeasonTable season={view.season} />
        </div>
      ) : (
        <>
          {/* T15-CUT: the theater marquee sits under the header, above the match strip (spec §5);
              the champion endgame replaces it once the tournament completes (state e). */}
          {ko && (ko.complete && ko.champion ? <KOChampion ko={ko} /> : <KOMarquee ko={ko} />)}
          <MatchStrip matches={view.matches} />
          {noPeriod ? (
            <div className="vf-banner vf-banner-empty">
              No live scoring period right now — the field lights up when the next matchday opens.
              The season standings are under the Season tab.
            </div>
          ) : (
            empty &&
            isLivePeriod && (
              <div className="vf-banner vf-banner-empty">
                Scoring hasn’t started — points begin at kickoff. Every manager’s full XI is still
                swappable right now.
              </div>
            )
          )}
          {/* Desktop split cockpit: leaderboard left rail + the compare/aggregate main area.
              Hidden on phones via the .da-body media query (the .ma-scroll tree takes over). */}
          <div className="da-body">
            {ko ? (
              /* Knockout rail: YOU band + reduced-shape strip + the authoritative ladder + the
                 fallen. The "You vs the field" aggregate BUTTON is hidden in knockout (its
                 record-vs-everyone includes the dead; the YOU band replaces its job) — selecting
                 your own row still collapses the main area to the aggregate view. */
              <div className="da-lb">
                <KOYouBand ko={ko} />
                <KOReducedShape />
                <div className="da-lb-head">
                  <span className="t-label">The ladder</span>
                  <span className="t-micro text-tertiary">live · pts</span>
                </div>
                <KoLadder
                  ko={ko}
                  field={view.field}
                  onSelect={select}
                  dimLive={dimLive}
                  effSel={desktopSel}
                  mob={false}
                />
                <KOFallen
                  fallen={ko.fallen}
                  complete={ko.complete}
                  viewerFallen={ko.viewer.state === "out"}
                  onOpen={openFallenLookup}
                />
              </div>
            ) : (
              <Leaderboard
                field={view.field}
                effSel={desktopSel}
                onSelect={select}
                dimLive={dimLive}
              />
            )}
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
                    {/* Benches under the H2H — your subs (left) and the opponent's (right), mirroring
                        the You-left / Opp-right XI columns above. */}
                    <div className="da-benches">
                      <BenchStrip
                        label="You"
                        isMe
                        players={benchFor(view.benches, me.managerId)}
                        onOpenPlayer={setBoxPlayer}
                        dimLive={dimLive}
                      />
                      <BenchStrip
                        label={opp.displayName}
                        players={benchFor(view.benches, opp.managerId)}
                        onOpenPlayer={setBoxPlayer}
                        dimLive={dimLive}
                      />
                    </div>
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
          {/* Mobile (leaderboard-first) tree — shown only under the .ma-scroll media query. In
              knockout mode the ladder home ALWAYS renders and the drill-in overlays as a bottom
              sheet (state d) instead of the group-mode in-place swap. */}
          <div className="ma-scroll">
            {ko ? (
              <>
                <KOYouBand ko={ko} mob />
                <KOReducedShape />
                <div className="ma-listlab">
                  <span className="t-label">The ladder · tap to compare</span>
                  <span className="t-micro text-tertiary">live · pts</span>
                </div>
                <div className="ma-list">
                  <KoLadder
                    ko={ko}
                    field={view.field}
                    onSelect={openManagerSheet}
                    dimLive={dimLive}
                    effSel={null}
                    mob
                  />
                </div>
                <KOFallen
                  fallen={ko.fallen}
                  complete={ko.complete}
                  viewerFallen={ko.viewer.state === "out"}
                  onOpen={openFallenLookup}
                />
              </>
            ) : effSel === null ? (
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
                benches={view.benches}
              />
            )}
          </div>
        </>
      )}

      {/* T15-CUT: the phone drill-in sheet — pinned to the MANAGER (header rank/pts update live);
          the hardware back-gesture closes it via the pushed `?manager=` history entry. */}
      {ko && isPhone && effSel !== null && (
        <KOSheet
          open
          onClose={closeManagerSheet}
          header={
            effSel === "field" || !sheetEntry ? (
              <div className="ko-shead-id">
                <div className="nm">You vs the whole field</div>
                <div className="sub">{periodLabel}</div>
              </div>
            ) : (
              <>
                <Avatar name={sheetEntry.displayName} isMe={sheetEntry.isMe} />
                <div className="ko-shead-id">
                  <div className="nm">{sheetEntry.displayName}</div>
                  <div className="sub">
                    {sheetRow ? `${ordinal(sheetRow.rank)} of ${ko.aliveCount} · ` : ""}
                    {sheetEntry.points} pts
                    {isLivePeriod && conn === "live" && <span className="lv"> · ● LIVE</span>}
                  </div>
                </div>
              </>
            )
          }
        >
          {effSel === "field" || !sheetEntry ? (
            <YouVsField
              field={view.field}
              periodLabel={periodLabel}
              onOpenPlayer={setBoxPlayer}
              dimLive={dimLive}
            />
          ) : (
            <>
              <MaH2H
                field={view.field}
                oppId={effSel}
                onBack={closeManagerSheet}
                onOpenPlayer={setBoxPlayer}
                dimLive={dimLive}
                benches={view.benches}
                sheet
              />
              <div className="ko-sfoot">
                Tap any player for the minute-by-minute breakdown · <b>✕, tap outside, or go
                back</b> to return to the ladder
              </div>
            </>
          )}
        </KOSheet>
      )}

      {/* T15-CUT: the cutting ceremony — a one-shot takeover fired by the live→past latch above. */}
      {ko && ceremonyOpen && ko.settled && (
        <KOCeremony ko={ko} onClose={() => setCeremonyOpen(false)} />
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
