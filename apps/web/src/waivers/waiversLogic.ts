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
import type { WvBatchWindow, WvBudget, WvClaim, WvPlayer } from "./types";

/** True when the add target's acquisition cutoff has passed (his match kicked off at/under `now`). */
export function isPlayerCutoffPassed(player: WvPlayer, now: Date): boolean {
  if (player.kickoffAt === null) return false;
  return new Date(player.kickoffAt).getTime() <= now.getTime();
}

/** A pending claim is void (→ refund at the batch) once its ADD target's match has kicked off. */
export function isClaimVoid(claim: WvClaim, now: Date): boolean {
  return isPlayerCutoffPassed(claim.add, now);
}

/** Pending claims sorted by sealed amount descending (the engine's own-bid resolution order). */
export function sortClaims(claims: readonly WvClaim[]): WvClaim[] {
  // Stable tiebreak on bidId keeps the order deterministic when amounts are equal (the intra-manager
  // equal-amount tiebreak is the deferred priority column — see WaiversClient TODO(confirm)).
  return [...claims].sort((a, b) => b.amount - a.amount || a.bidId.localeCompare(b.bidId));
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
 * The most a single bid may be, matching the engine's over-budget rule: budget minus the manager's
 * OTHER pending bids. When editing, the bid being edited is excluded (a raise is measured against the
 * rest), so its own amount is effectively freed back into the cap.
 */
export function composerMaxBid(
  faabBudget: number,
  claims: readonly WvClaim[],
  editingBidId: string | null,
): number {
  const others = claims.filter((c) => c.bidId !== editingBidId);
  return Math.max(0, faabBudget - pendingTotal(others));
}

/**
 * The free agents a manager may still CLAIM in the composer: cutoff still open (his match hasn't kicked
 * off), not already named in another pending claim (unless editing THAT claim), matching the optional
 * position + search query. Sorted by season points desc (nulls last), then name.
 */
export function claimableFreeAgents(
  freeAgents: readonly WvPlayer[],
  claims: readonly WvClaim[],
  now: Date,
  opts: {
    query?: string;
    position?: "ALL" | WvPlayer["position"];
    /** Selected nation from the collapsible country filter; "ALL" (or omitted) is a no-op. */
    nation?: string | "ALL";
    editingBidId?: string | null;
  } = {},
): WvPlayer[] {
  const { query = "", position = "ALL", nation = "ALL", editingBidId = null } = opts;
  const takenAddIds = new Set(claims.filter((c) => c.bidId !== editingBidId).map((c) => c.add.id));
  const q = query.trim().toLowerCase();
  return freeAgents
    .filter((p) => {
      if (takenAddIds.has(p.id)) return false;
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
 * The distinct nations present in a pool, sorted — the source for the collapsible country-filter chips
 * (mirrors how the draft pool derives its `nations` list). Skips players with no nation. Display-only.
 */
export function freeAgentNations(freeAgents: readonly WvPlayer[]): string[] {
  return [
    ...new Set(freeAgents.map((p) => p.nation).filter((n): n is string => n !== null && n !== "")),
  ].sort((a, b) => a.localeCompare(b));
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
