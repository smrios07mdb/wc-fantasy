"use client";
/**
 * The interactive waivers surface (ported from `design/design_reference/waivers/{desktop,mobile}.jsx`
 * into ONE responsive component — desktop two-column, mobile stacked, via `waivers.css` media queries —
 * rather than the design's two fit-scaled frames). Two tabs: "My claims" + "Batch results".
 *
 * Boring + reliable, by design: NO Realtime, NO polling. Reads arrive as the `view` prop from the server
 * component; every mutation is a `/api/faab/bid` round-trip followed by `router.refresh()` (re-runs the
 * server component → fresh props). The only live thing is the `now` clock, ticked client-side so a
 * pending claim flips to its void+refund state the instant its add target's match kicks off.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { WaiversView, WvClaim, WvPlayer } from "./types";
import { computeBudget, isClaimVoid, resolveBidDeepLink, sortClaims } from "./waiversLogic";
import {
  BatchBar,
  ClaimRow,
  FaabBar,
  Refund,
  ResultsBatch,
  TeamBudgetsRail,
  WaiverOrderRail,
} from "./components";
import { BidComposer, type BidPayload } from "./BidComposer";
import { FreeAgentPanel, type FaGrantPayload } from "./FreeAgentPanel";
import { FaPlayerCardSheet } from "./FaPlayerCardSheet";
import { ReleasePanel } from "./ReleasePanel";
import "./waivers.css";

const FAAB_ALLOTMENT = 100; // the $100 budget — the FAAB bar's track denominator (design/CLAUDE.md §2).

/** Clean, user-facing messages for the rejections the route can return (the raw engine messages name
 *  player UUIDs). Falls back to the server `message` then a generic line. */
const ERROR_MESSAGES: Record<string, string> = {
  "over-budget": "Over budget — lower your bid or cancel another claim.",
  "add-owned": "That player is already owned in the league.",
  "add-kicked-off": "Too late — his match has already kicked off.",
  "bid-window-closed":
    "Sealed bids for his matchday have closed — grab him as a free agent instead.",
  "drop-required": "Pick a player to drop — your squad is full.",
  "drop-not-owned": "You don’t own the player you’re trying to drop.",
  "drop-equals-add": "The add and the drop can’t be the same player.",
  "drop-locked": "That drop is locked by play — he can’t be dropped this matchday.",
  "roster-illegal": "That add/drop would break your positional limits.",
  "amount-negative": "A bid can’t be negative.",
  // instant $0 free-agency grant (Prompt 48) — surfaced by the FA panel
  "fa-conflict": "Someone just grabbed that player — pick another free agent.",
  "fa-window-closed": "Free agency isn’t open for this player right now.",
  "fa-not-eligible": "That player isn’t an open free agent this period.",
  // playoff trim-down release (DECISIONS §D)
  "not-participant": "You’re not in the playoff field — waiver moves are closed for you.",
  "release-not-allowed": "Releasing players is only available in the playoff phase.",
  "release-nothing": "Pick at least one player to release.",
  "release-not-owned": "You can only release players you own.",
  "release-locked": "That player has played this round and can’t be released yet.",
  "release-below-floor": "That would leave too few players to field a lineup — keep at least 7.",
  "release-unfillable": "The players left can’t field a legal XI — confirm to release anyway.",
  bid_not_pending: "This claim was already processed.",
  bid_not_found: "That claim no longer exists.",
  not_your_manager: "You can only manage your own claims.",
  unknown_player: "That player couldn’t be found.",
  bad_request: "Something was off with that request — try again.",
};

type ComposerState = {
  open: boolean;
  editClaim: WvClaim | null;
  /** PLAYERS-1: the deep-link-seeded FA selection — set ONLY when the composer was opened by the
   *  /waivers?bid= hand-off, so a manual "+ New claim" never inherits it. */
  seededPlayer?: WvPlayer | null;
};

export function WaiversClient({
  view,
  deepLinkBidPlayerId = null,
}: {
  view: WaiversView;
  /** PLAYERS-1: a `?bid=<playerId>` param handed off from the read-only /players browser — its ONLY
   *  acquisition affordance (acquisition itself stays single-sourced on this screen). Preselects an
   *  open, still-claimable free agent; anything else (window closed, owned, kicked off, unknown) is a
   *  silent no-op. Preselection ONLY — no auto-submit, engine/composer untouched. */
  deepLinkBidPlayerId?: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"claims" | "results">("claims");
  // Resolve the /players hand-off ONCE from the initial server snapshot — a lazy initializer, never an
  // effect, so it can't re-fire when the user later closes the composer. Non-null only when the window
  // is open AND the player is still claimable (the pure `resolveBidDeepLink` mirrors the picker rule).
  const deepLink = useState(() =>
    resolveBidDeepLink({
      playerId: deepLinkBidPlayerId,
      phase: view.batchWindow?.phase ?? null,
      canAct: !view.isPlayoffPhase || view.isParticipant,
      freeAgents: view.freeAgents,
      claims: view.claims,
      now: new Date(view.nowIso),
    }),
  )[0];
  // A sealed-bid deep-link opens the composer preselected at mount; free-agency seeds the FA row below.
  const [composer, setComposer] = useState<ComposerState>(() =>
    deepLink?.mode === "sealed-bid"
      ? { open: true, editClaim: null, seededPlayer: deepLink.player }
      : { open: false, editClaim: null },
  );
  // The view-only player card (Prompt 56): opened from a picker row's dedicated info control. Purely
  // informational — separate from the composer's acquisition selection, which it never touches. It is
  // always the period-less FaPlayerCardSheet: the FA pool / claims / player cards are live/global by design
  // (the T11 over-applied per-matchday drill-down was removed; the period concept lives only in Batch
  // results, where each settled batch is labelled with its matchday — see WvBatch.matchdayLabel).
  const [cardPlayer, setCardPlayer] = useState<WvPlayer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [faError, setFaError] = useState<string | null>(null);
  const [busyBidId, setBusyBidId] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  // D4 (trim-down): a playoff non-participant may not acquire OR release. Group phase ⇒ everyone can act.
  const canAct = !view.isPlayoffPhase || view.isParticipant;
  const overCap = view.roster.length > view.rosterCap;

  // The current period's acquisition phase drives the tab's acquisition surface (the SAME state the
  // BatchBar shows): sealed-bid → the sealed claim form (below); free-agency → instant $0 FA pickups;
  // locked → the FA list browses but adds are disabled. No window (season over) keeps the sealed form.
  const phase = view.batchWindow?.phase ?? null;
  const faMode = phase === "free-agency" || phase === "locked";

  // Live clock — seeded from the server time (no hydration mismatch), then ticked every 30s so a
  // claim's void+refund state appears the moment its add target kicks off.
  const [now, setNow] = useState(() => new Date(view.nowIso));
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // The viewer's PRIVATE watchlist (T2). Seeded from the server view, then re-synced after each
  // router.refresh (a new view object → new watchedPlayerIds reference → the effect re-hydrates from server
  // truth). `handleToggleStar` flips it OPTIMISTICALLY so the star feels instant, reverting if the write fails.
  const [watchedIds, setWatchedIds] = useState<ReadonlySet<string>>(
    () => new Set(view.watchedPlayerIds),
  );
  useEffect(() => {
    setWatchedIds(new Set(view.watchedPlayerIds));
  }, [view.watchedPlayerIds]);

  const sortedClaims = useMemo(() => sortClaims(view.claims), [view.claims]);
  const budget = useMemo(
    () => computeBudget(view.faabBudget, view.claims),
    [view.faabBudget, view.claims],
  );
  const voidCount = useMemo(
    () => view.claims.filter((c) => isClaimVoid(c, now)).length,
    [view.claims, now],
  );
  const myPosition = view.waiverOrder.find((s) => s.isMe)?.position ?? null;

  const formatRunAt = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: view.timezone,
    });
    return (iso: string) => fmt.format(new Date(iso));
  }, [view.timezone]);

  function closeComposer() {
    setComposer({ open: false, editClaim: null });
    setComposerError(null);
  }

  async function callBid(method: "POST" | "PATCH" | "DELETE", body: unknown) {
    const res = await fetch("/api/faab/bid", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    return { ok: res.ok, data };
  }

  function friendly(data: { error?: string; message?: string } | null): string {
    if (!data) return "Something went wrong — please try again.";
    const mapped = data.error ? ERROR_MESSAGES[data.error] : undefined;
    if (mapped) return mapped;
    return data.message ?? "Your claim was rejected — please review and try again.";
  }

  async function handleSubmit(payload: BidPayload) {
    setSubmitting(true);
    setComposerError(null);
    const editing = composer.editClaim;
    const { ok, data } = editing
      ? await callBid("PATCH", {
          managerId: view.managerId,
          bidId: editing.bidId,
          amount: payload.amount,
          playerDropId: payload.dropId,
          note: null,
        })
      : await callBid("POST", {
          managerId: view.managerId,
          playerAddId: payload.addId,
          playerDropId: payload.dropId,
          amount: payload.amount,
          note: null,
        });
    setSubmitting(false);
    if (ok) {
      closeComposer();
      router.refresh();
    } else {
      setComposerError(friendly(data));
    }
  }

  async function handleCancel(bidId: string) {
    setBusyBidId(bidId);
    setListError(null);
    const { ok, data } = await callBid("DELETE", { managerId: view.managerId, bidId });
    setBusyBidId(null);
    if (ok) router.refresh();
    else setListError(friendly(data));
  }

  // Toggle a private watchlist star (T2). Optimistic: flip locally first (instant feedback), POST the toggle
  // to the dedicated /api/manager/watchlist route, then router.refresh() to reconcile with server truth;
  // revert on failure. Fully DECOUPLED from FAAB — the body carries no managerId (resolved server-side) and
  // never touches budget / claims / roster. There is no error surface: a star is best-effort, costs nothing.
  async function handleToggleStar(player: WvPlayer) {
    const next = !watchedIds.has(player.id);
    const flip = (add: boolean) =>
      setWatchedIds((prev) => {
        const s = new Set(prev);
        if (add) s.add(player.id);
        else s.delete(player.id);
        return s;
      });
    flip(next);
    const res = await fetch("/api/manager/watchlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: player.id, watched: next }),
    });
    if (res.ok) router.refresh();
    else flip(!next); // revert the optimistic flip
  }

  // Instant $0 free-agency pickup — the same fetch→router.refresh shape as a bid, but against the
  // dedicated FA route, which applies the add/drop immediately (first-come). The fa-conflict (409) loss
  // is surfaced inline (mapped via `friendly`), and the screen is NOT refreshed on failure.
  async function handleGrant(payload: FaGrantPayload) {
    setSubmitting(true);
    setFaError(null);
    const res = await fetch("/api/faab/free-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        managerId: view.managerId,
        playerAddId: payload.addId,
        playerDropId: payload.dropId,
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    setSubmitting(false);
    if (res.ok) router.refresh();
    else setFaError(friendly(data));
  }

  // Drop-only playoff release (the 9-cap net-shed). Same fetch→router.refresh shape; the panel re-submits
  // with `confirmedUnfillable` after a `release-unfillable` 409 (the server confirm gate).
  async function handleRelease(dropIds: string[], confirmedUnfillable: boolean) {
    setReleasing(true);
    setReleaseError(null);
    const res = await fetch("/api/faab/release", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ managerId: view.managerId, dropIds, confirmedUnfillable }),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    setReleasing(false);
    if (res.ok) router.refresh();
    else setReleaseError(friendly(data));
  }

  return (
    <div className="wv-app">
      <div className="wv-tabs" role="tablist" aria-label="Waivers">
        <button
          role="tab"
          aria-selected={tab === "claims"}
          className={"wv-tab" + (tab === "claims" ? " is-active" : "")}
          onClick={() => setTab("claims")}
        >
          My claims
          {view.claims.length > 0 && <span className="wv-tab-badge">{view.claims.length}</span>}
        </button>
        <button
          role="tab"
          aria-selected={tab === "results"}
          className={"wv-tab" + (tab === "results" ? " is-active" : "")}
          onClick={() => setTab("results")}
        >
          Batch results
        </button>
      </div>

      {view.isPlayoffPhase && (
        <div className="wv-resetbanner">
          <Refund />
          <span>
            <b>FAAB carries over.</b> Your one <b>$100</b> tournament budget carries into the
            guillotine — group-stage spend is <b>not</b> wiped or replenished.
          </span>
        </div>
      )}

      {view.isPlayoffPhase && !view.isParticipant && (
        <div className="wv-resetbanner">
          <span>
            <b>You&rsquo;re not in the playoff field.</b> Waiver moves are closed for you.
          </span>
        </div>
      )}

      {view.isPlayoffPhase && view.isParticipant && overCap && (
        <ReleasePanel
          roster={view.roster}
          lockedPlayerIds={view.lockedPlayerIds}
          rosterCap={view.rosterCap}
          forfeitDeadlineIso={view.playoffForfeitDeadlineIso}
          batchWindow={view.batchWindow}
          timezone={view.timezone}
          submitting={releasing}
          errorMessage={releaseError}
          onRelease={handleRelease}
          onOpen={setCardPlayer}
        />
      )}

      {tab === "claims" ? (
        <div className="wv-claims-page">
          <div className="wv-claims-main">
            {view.batchWindow && <BatchBar w={view.batchWindow} now={now} />}

            {voidCount > 0 && (
              <div className="wv-voidnote">
                <Refund />
                <span>
                  <b>{voidCount}</b> of your claims target a player whose match already kicked off —
                  they&rsquo;ll be <b>voided and refunded</b> at the batch.
                </span>
              </div>
            )}

            {canAct && faMode && (
              <FreeAgentPanel
                enabled={phase === "free-agency"}
                initialSelected={deepLink?.mode === "free-agency" ? deepLink.player : null}
                rosterCap={view.rosterCap}
                freeAgents={view.freeAgents}
                claims={view.claims}
                roster={view.roster}
                lockedPlayerIds={view.lockedPlayerIds}
                now={now}
                submitting={submitting}
                errorMessage={faError}
                onGrant={handleGrant}
                onOpen={setCardPlayer}
                watched={watchedIds}
                onToggleStar={handleToggleStar}
              />
            )}

            <div className="wv-claims-head">
              <span className="t-label">Pending claims · {view.claims.length}</span>
              {canAct && !faMode && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setComposerError(null);
                    setComposer({ open: true, editClaim: null });
                  }}
                >
                  + New claim
                </button>
              )}
            </div>

            {listError && <div className="wv-comp-error">{listError}</div>}

            {view.claims.length === 0 ? (
              <div className="wv-empty">
                <b>No pending claims.</b>
                <span className="t-sm text-tertiary">
                  {faMode
                    ? "Free agency is open — add an unclaimed player instantly above."
                    : "Place a sealed FAAB bid on a free agent — it processes at the next batch."}
                </span>
                {canAct && !faMode && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setComposer({ open: true, editClaim: null })}
                  >
                    + New claim
                  </button>
                )}
              </div>
            ) : (
              <div className="wv-claims-list">
                {sortedClaims.map((claim) => (
                  <ClaimRow
                    key={claim.bidId}
                    claim={claim}
                    now={now}
                    voided={isClaimVoid(claim, now)}
                    busy={busyBidId === claim.bidId}
                    onEdit={() => {
                      setComposerError(null);
                      setComposer({ open: true, editClaim: claim });
                    }}
                    onCancel={() => handleCancel(claim.bidId)}
                  />
                ))}
              </div>
            )}

            <div className="wv-claims-foot t-micro text-tertiary">
              Higher claims process first — once a claim wins, its FAAB is spent before the next is
              evaluated.
            </div>
            {/* PLAYERS-1: the one link into the read-only full-tournament browser. Acquisition stays
                here — /players hands a free agent back via ?bid= (see WaiversClient deep-link). */}
            <a className="wv-browse-all t-sm" href="/players">
              Browse all players →
            </a>
          </div>

          <aside className="wv-rail">
            <div className="wv-card">
              <FaabBar
                available={budget.available}
                pending={budget.pending}
                after={budget.after}
                budget={FAAB_ALLOTMENT}
              />
            </div>
            <div className="wv-card">
              <WaiverOrderRail order={view.waiverOrder} myPosition={myPosition} />
            </div>
            <div className="wv-card">
              <TeamBudgetsRail budgets={view.teamBudgets} />
            </div>
          </aside>
        </div>
      ) : (
        <div className="wv-results-page">
          <div className="wv-results-head">
            <span className="t-label">Processed batches</span>
            <span className="t-micro text-tertiary">Sealed amounts revealed after processing</span>
          </div>
          {view.batches.length === 0 ? (
            <div className="wv-empty">
              <b>No batches yet.</b>
              <span className="t-sm text-tertiary">
                Results appear here once the first waiver batch processes.
              </span>
            </div>
          ) : (
            view.batches.map((batch) => (
              <ResultsBatch key={batch.batchId} batch={batch} formatRunAt={formatRunAt} />
            ))
          )}
          <div className="wv-claims-foot t-micro text-tertiary">
            Void + refund returns the full bid when a claim&rsquo;s player kicks off before the
            batch. Equal bids break on the rolling waiver order.
          </div>
        </div>
      )}

      {composer.open && (
        <BidComposer
          key={composer.editClaim?.bidId ?? "new"}
          editClaim={composer.editClaim}
          initialSelected={composer.seededPlayer ?? null}
          rosterCap={view.rosterCap}
          now={now}
          freeAgents={view.freeAgents}
          claims={view.claims}
          roster={view.roster}
          lockedPlayerIds={view.lockedPlayerIds}
          faabBudget={view.faabBudget}
          submitting={submitting}
          errorMessage={composerError}
          onClose={closeComposer}
          onSubmit={handleSubmit}
          onOpen={setCardPlayer}
          watched={watchedIds}
          onToggleStar={handleToggleStar}
        />
      )}

      {/* The player drill-down is the period-less FaPlayerCardSheet — the FA pool / claims / player cards
          are live/global by design (the T11 over-applied per-matchday box-score swap was removed). */}
      {cardPlayer && (
        <FaPlayerCardSheet
          player={cardPlayer}
          now={now}
          watched={watchedIds.has(cardPlayer.id)}
          onClose={() => setCardPlayer(null)}
          onToggleStar={handleToggleStar}
        />
      )}
    </div>
  );
}
