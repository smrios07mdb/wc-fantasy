/**
 * The PURE view-logic behind the waivers screen — no React, no IO, no `Date.now()` baked in (the caller
 * passes `now`, so it is deterministic + unit-testable). These mirror the design sim's `claimStatus` /
 * `committedActive` / `claimableFAs` but are reconciled with the REAL FAAB engine (`@app/faab`) so the
 * UI's inline state never contradicts what the server would do:
 *
 *  • `isClaimVoid` — a pending claim whose ADD target's match has kicked off (cutoff passed) will be
 *    voided + refunded at the batch. Void is a DISPLAY state derived live from the kickoff vs `now`;
 *    the bid stays `pending` in the DB until the batch resolves it (there is no stored "void" status).
 *  • budget — the engine reserves EVERY pending bid against the budget (`faabBudget − Σ pending`), so the
 *    composer cap subtracts ALL other pending claims (incl. would-be-void ones). This is STRICTER than
 *    the design prototype (which capped at the full remaining budget) — a deliberate choice so the
 *    composer's "submit disabled + reason" can never disagree with the route's over-budget 409.
 *  • claim order — pending claims render amount-DESC, matching the engine's own-bid resolution order
 *    (higher bids settle first; a won claim's FAAB is spent before the next is evaluated).
 */
import type { AcquisitionWindow } from "@app/faab";
import { formatInLeagueTz } from "@app/shared";
import type { WvBatchWindow, WvBudget, WvClaim, WvPlayer, WvResult, WvResultGroup } from "./types";

/** True when the add target's acquisition cutoff has passed (his match kicked off at/under `now`). */
export function isPlayerCutoffPassed(player: WvPlayer, now: Date): boolean {
  if (player.kickoffAt === null) return false;
  return new Date(player.kickoffAt).getTime() <= now.getTime();
}

/** Which bound governs a player's ACTIONABLE acquisition cutoff — drives the tag's label copy. */
export type CutoffBound =
  /** The period's waiver batch fires first → bidding closes at the batch ("to batch"). */
  | "batch"
  /** His match kicks off strictly before the batch → a bid voids + refunds ("voids at kickoff"). */
  | "kickoff-void"
  /** No batch scheduled (free-agency / locked / no window) → his kickoff is the plain bound. */
  | "kickoff";

/** The resolved actionable cutoff for a player: the governing instant, which bound it is, and whether
 *  it has already passed. */
export interface EffectiveCutoff {
  /** The governing instant — the EARLIER of (period batch fire, player kickoff). */
  readonly at: Date;
  /** Which bound governs (the LABEL, a non-color signal, is keyed on this). */
  readonly bound: CutoffBound;
  /** True once the governing instant is at/behind `now` (→ the tag reads "cutoff passed"). */
  readonly passed: boolean;
}

/**
 * The ACTIONABLE acquisition cutoff for a player (W2-06 / spec v6): the displayed deadline is the EARLIER
 * of the period's waiver batch fire and the player's kickoff-void boundary — NEVER the bare per-player
 * kickoff. Both instants are already loaded upstream: `batchAt` is the current period's `effectiveBatchAt`
 * (the SAME time the "Waivers process at" line shows — non-null only in the sealed-bid phase), and
 * `kickoffAt` is the player's next still-acquirable fixture. PURE — the caller passes `now`.
 *
 * The four cases (mirrored by the unit suite):
 *  • batch fires strictly BEFORE kickoff (or kickoff unknown)  → the BATCH governs — bidding closes then.
 *  • kickoff strictly BEFORE the batch                         → the KICKOFF governs — a bid on him would
 *    VOID + refund (matches the composer's "Voided + refunded if his match kicks off before the batch").
 *  • no batch scheduled (FA / locked / no window)             → the KICKOFF governs as a plain bound.
 *  • the governing instant is already at/behind `now`         → passed (the tag reads "cutoff passed").
 *
 * A kickoff EXACTLY equal to the batch is NOT "before the batch" → the batch governs (no void), aligning
 * with the void rule's strict "before". Returns null when neither bound exists (no kickoff, no batch).
 */
export function effectiveCutoff(input: {
  kickoffAt: string | null;
  batchAt: Date | null;
  now: Date;
}): EffectiveCutoff | null {
  const { kickoffAt, batchAt, now } = input;
  const kickoff = kickoffAt !== null ? new Date(kickoffAt) : null;

  if (kickoff === null && batchAt === null) return null;

  let at: Date;
  let bound: CutoffBound;
  if (kickoff === null) {
    // No fixture to void against — only the batch bounds the action.
    at = batchAt!;
    bound = "batch";
  } else if (batchAt === null) {
    // No batch scheduled (free-agency / locked / no window): his kickoff is the plain availability bound.
    at = kickoff;
    bound = "kickoff";
  } else if (kickoff.getTime() < batchAt.getTime()) {
    // His match kicks off strictly before the batch → a bid on him voids + refunds at the batch.
    at = kickoff;
    bound = "kickoff-void";
  } else {
    // The batch fires at/before his kickoff → it is the actionable deadline (bidding closes at the batch).
    at = batchAt;
    bound = "batch";
  }
  return { at, bound, passed: at.getTime() <= now.getTime() };
}

/** A pending claim is void (→ refund at the batch) once its ADD target's match has kicked off. */
export function isClaimVoid(claim: WvClaim, now: Date): boolean {
  return isPlayerCutoffPassed(claim.add, now);
}

/** The §D-amendment tiebreak, mirrored from the resolver's `intraManagerPriority` (every claim here is
 *  the SAME manager's, so no managerId gate): priority ASC, null after any numbered priority, both-null
 *  falls through to the deterministic tail. */
function comparePriority(a: WvClaim, b: WvClaim): number {
  if (a.priority === null && b.priority === null) return 0;
  if (a.priority === null) return 1;
  if (b.priority === null) return -1;
  return a.priority - b.priority;
}

/** Pending claims sorted in EFFECTIVE PROCESSING ORDER: sealed amount descending (the engine's primary
 *  ordering), then the manager's own priority ASC (§D amendment — the batch's intra-manager equal-amount
 *  tiebreak), then the stable bidId tail for pre-column rows. All pending claims clear at the SAME next
 *  batch run (the batch loads league-wide pending, even when submissions spanned add-periods), so this
 *  single list IS the one batch group — no per-batch sub-grouping exists to render. */
export function sortClaims(claims: readonly WvClaim[]): WvClaim[] {
  return [...claims].sort(
    (a, b) => b.amount - a.amount || comparePriority(a, b) || a.bidId.localeCompare(b.bidId),
  );
}

/** May the sorted claim at `index` swap with its `dir` neighbor? Only between ADJACENT EQUAL-AMOUNT
 *  claims — amount is the primary ordering, so crossing an amount boundary can never change processing
 *  order (the UI disables the arrow with the "raise the bid" hint instead). */
export function canMoveClaim(
  sorted: readonly WvClaim[],
  index: number,
  dir: "up" | "down",
): boolean {
  const j = dir === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= sorted.length || j < 0 || j >= sorted.length) return false;
  return sorted[j]!.amount === sorted[index]!.amount;
}

/** The FULL permutation of pending bidIds after swapping `index` with its `dir` neighbor — exactly what
 *  `PUT /api/faab/bid` persists as priority 1..N by position. The whole DISPLAYED order is sent (not
 *  just the swapped pair) so the stored priorities converge onto the effective processing order the
 *  manager is looking at. Null when the swap is not allowed. */
export function moveClaim(
  sorted: readonly WvClaim[],
  index: number,
  dir: "up" | "down",
): string[] | null {
  if (!canMoveClaim(sorted, index, dir)) return null;
  const j = dir === "up" ? index - 1 : index + 1;
  const ids = sorted.map((c) => c.bidId);
  [ids[index], ids[j]] = [ids[j]!, ids[index]!];
  return ids;
}

/** Sum of every pending bid amount — what the engine reserves against the budget. */
export function pendingTotal(claims: readonly WvClaim[]): number {
  return claims.reduce((sum, c) => sum + c.amount, 0);
}

/** Budget state for the FAAB bar: available pool, reserved pending, and what's left after. */
export function computeBudget(faabBudget: number, claims: readonly WvClaim[]): WvBudget {
  const pending = pendingTotal(claims);
  return { available: faabBudget, pending, after: faabBudget - pending };
}

/**
 * The most a single bid may be: the manager's full CURRENT budget. A single bid may not exceed the
 * budget, but the SUM of a manager's pending bids MAY exceed it — speculative bidding (2026-07-07
 * amendment). The batch's per-award budget-exhausted skip is the real enforcement, so the composer no
 * longer subtracts other pending claims from the cap. Kept as a named function (the single source for
 * the per-bid cap, and the symbol the composer's smoke test pins) though it is now the budget itself.
 */
export function composerMaxBid(faabBudget: number): number {
  return faabBudget;
}

/**
 * The free agents a manager may still CLAIM in the composer / FA panel: cutoff still open (his match
 * hasn't kicked off), matching the optional position + search query. Sorted by season points desc (nulls
 * last), then name.
 *
 * S3 (speculative bids, 2026-07-07): the pool is CLAIMS-AGNOSTIC — a player the manager already has a
 * pending bid on stays visible (the UI badges the row "Your bid ×N" via {@link pendingBidCountByPlayer}),
 * so a second, different bid can be placed on him. The old "hide own-bid targets" exclusion is retired.
 */
export function claimableFreeAgents(
  freeAgents: readonly WvPlayer[],
  now: Date,
  opts: {
    query?: string;
    position?: "ALL" | WvPlayer["position"];
    /** Selected nation from the collapsible country filter; "ALL" (or omitted) is a no-op. */
    nation?: string | "ALL";
  } = {},
): WvPlayer[] {
  const { query = "", position = "ALL", nation = "ALL" } = opts;
  const q = query.trim().toLowerCase();
  return freeAgents
    .filter((p) => {
      if (isPlayerCutoffPassed(p, now)) return false;
      if (position !== "ALL" && p.position !== position) return false;
      if (nation !== "ALL" && p.nation !== nation) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort(
      (a, b) => (b.seasonPoints ?? -1) - (a.seasonPoints ?? -1) || a.name.localeCompare(b.name),
    );
}

/**
 * Count of the viewer's live pending claims per add-target player id — drives the pool row's "Your bid
 * ×N" indicator (S2 speculative bids). Pure. In the free-agency phase there are no pending sealed claims,
 * so this is empty there and the badge never renders.
 */
export function pendingBidCountByPlayer(claims: readonly WvClaim[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const c of claims) counts.set(c.add.id, (counts.get(c.add.id) ?? 0) + 1);
  return counts;
}

/**
 * The distinct nations present in a pool, sorted — the source for the collapsible country-filter chips
 * (mirrors how the draft pool derives its `nations` list). Skips players with no nation. Display-only.
 */
export function freeAgentNations(freeAgents: readonly WvPlayer[]): string[] {
  return [
    ...new Set(freeAgents.map((p) => p.nation).filter((n): n is string => n !== null && n !== "")),
  ].sort((a, b) => a.localeCompare(b));
}

/**
 * The free agents the viewer has starred — the "Watched only" filter (T2 — Waiver Watchlist). Keyed on
 * `p.id` against the viewer's private watchlist set, mirroring how `claimableFreeAgents` keys its
 * `takenAddIds` exclusion. Pure + display-only; preserves the input order. A starred player who has left
 * the pool (acquired, eliminated) simply isn't in `freeAgents`, so he drops out — no stale row.
 */
export function watchedFreeAgents(
  freeAgents: readonly WvPlayer[],
  watched: ReadonlySet<string>,
): WvPlayer[] {
  return freeAgents.filter((p) => watched.has(p.id));
}

/**
 * Project the current period's acquisition phase into the "next batch" element's display strings. PURE:
 * the phase + the two instants are computed upstream via the shared `@app/faab` `acquisitionWindowState`
 * / `effectiveBatchAt`, so this only maps state → copy (DECISIONS.md → Theme D). The three phases mirror
 * the prompt's renderings; only the sealed-bid phase carries a live countdown (`countdownToIso`).
 */
export function buildBatchWindowView(input: {
  phase: AcquisitionWindow;
  periodLabel: string;
  /** `effectiveBatchAt` for the period (override ?? firstKickoff − lead); null = no anchorable time. */
  batchAt: Date | null;
  /** The period's first kickoff = the hard lock boundary; null = no fixtures. */
  firstKickoffAt: Date | null;
  timezone: string;
}): WvBatchWindow {
  const { phase, periodLabel, batchAt, firstKickoffAt, timezone } = input;
  const fmt = (d: Date | null) => (d ? formatInLeagueTz(d, timezone) : "TBD");

  switch (phase) {
    case "sealed-bid":
      return {
        phase,
        caption: "Waivers process at",
        value: fmt(batchAt),
        sub: periodLabel,
        countdownToIso: batchAt ? batchAt.toISOString() : null,
      };
    case "free-agency":
      return {
        phase,
        caption: "Free agency open — locks at",
        value: fmt(firstKickoffAt),
        sub: periodLabel,
        countdownToIso: null,
      };
    case "locked":
      return {
        phase,
        caption: "Waivers locked for",
        value: periodLabel,
        sub: null,
        countdownToIso: null,
      };
  }
}

/**
 * Resolve the `/waivers?bid=<playerId>` deep-link (PLAYERS-1 — the /players browser's ONLY
 * acquisition affordance, a hand-off; acquisition itself stays single-sourced on /waivers). PURE +
 * mount-once by contract: the caller evaluates it exactly once from the server snapshot.
 *
 * A deep-link PRESELECTS (never submits) iff, at mount:
 *   • the acquisition window is OPEN (`sealed-bid` → the composer opens preselected;
 *     `free-agency` → the FA panel's row selection is seeded) — `locked`/no-window → null;
 *   • the viewer may act (D4: playoff non-participants get no acquisition surface at all);
 *   • the player is STILL CLAIMABLE per the same {@link claimableFreeAgents} rule the pickers
 *     enforce (live-unowned pool, cutoff not passed). Since S3 (speculative bids) the pool is
 *     claims-agnostic, so a player the viewer ALREADY has a pending bid on preselects for a SECOND bid.
 * Anything else — unknown id, owned since, kicked off — resolves null and the screen renders exactly as
 * if the param were absent (graceful no-op, never a throw).
 */
export function resolveBidDeepLink(input: {
  playerId: string | null;
  phase: AcquisitionWindow | null;
  canAct: boolean;
  freeAgents: readonly WvPlayer[];
  now: Date;
}): { mode: "sealed-bid" | "free-agency"; player: WvPlayer } | null {
  const { playerId, phase, canAct, freeAgents, now } = input;
  if (!playerId || !canAct) return null;
  if (phase !== "sealed-bid" && phase !== "free-agency") return null;
  const player = claimableFreeAgents(freeAgents, now).find((p) => p.id === playerId);
  return player ? { mode: phase, player } : null;
}

/** Droppable roster players: owned, NOT locked by play. Sorted by season points asc (weakest first). */
export function droppableRoster(
  roster: readonly WvPlayer[],
  lockedPlayerIds: readonly string[],
): WvPlayer[] {
  const locked = new Set(lockedPlayerIds);
  return roster
    .filter((p) => !locked.has(p.id))
    .sort((a, b) => (a.seasonPoints ?? 0) - (b.seasonPoints ?? 0) || a.name.localeCompare(b.name));
}

/**
 * T11 R2 (Fix B-2): regroup a settled batch's flat `WvResult[]` (one row per bid) into one entry per
 * CONTESTED PLAYER, with ALL his bids beneath him — so e.g. a player won by one manager and lost by
 * another reads as a single contest instead of two scattered rows. Pure presentation: no new query;
 * the loader already hands every winning + losing + voided bid.
 *
 * Ordering: within a player, bids sort amount-desc (winner on top — the FAAB winner is the top bid;
 * `bidId` tiebreaks for determinism). Across players, groups sort by their top bid amount desc
 * (highest-stakes contest first), `playerId` tiebreaking. The dropped-player detail is already carried
 * per-bid on the winning bid, so it rides along untouched.
 */
export function groupResultsByPlayer(results: readonly WvResult[]): WvResultGroup[] {
  const byPlayer = new Map<string, WvResult[]>();
  for (const r of results) {
    const bucket = byPlayer.get(r.add.id);
    if (bucket) bucket.push(r);
    else byPlayer.set(r.add.id, [r]);
  }
  const groups: WvResultGroup[] = [];
  for (const [playerId, bids] of byPlayer) {
    const sorted = [...bids].sort((a, b) => b.amount - a.amount || a.bidId.localeCompare(b.bidId));
    const top = sorted[0];
    if (!top) continue; // unreachable (each bucket holds ≥1 bid) — satisfies noUncheckedIndexedAccess
    groups.push({ playerId, add: top.add, results: sorted });
  }
  // Highest-stakes contest first; the top bid (index 0) always exists per the guard above.
  return groups.sort(
    (a, b) =>
      (b.results[0]?.amount ?? 0) - (a.results[0]?.amount ?? 0) ||
      a.playerId.localeCompare(b.playerId),
  );
}
