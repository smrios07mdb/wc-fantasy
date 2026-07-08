/**
 * The typed props the waivers SERVER component (`app/waivers/loadWaivers.ts`) hands the CLIENT
 * (`WaiversClient.tsx`). The client NEVER touches Prisma — it renders these shapes and round-trips
 * mutations through `/api/faab/bid`. Kept in `src/` so the loader, the client, and the Vitest suite all
 * agree on one contract (mirrors how `@app/vsfield` exposes its `VsFieldView`).
 *
 * Dates cross the server→client boundary as ISO strings (a server component may pass `Date`s, but
 * stringifying keeps the props trivially serialisable + testable without `Date` fixtures).
 */
import type { AcquisitionWindow } from "@app/faab";
import type { Position } from "@app/shared";
// The opponent shape is the SAME one the set-lineup screen renders — reused read-only (never re-derived)
// so the waivers "next opponent" tag matches lineup's OpponentTag field-for-field (Prompt 53 / T8).
import type { OpponentInfo } from "../lineup/types";

export type { OpponentInfo };

/** A player as the waivers screen needs him — identity + the cutoff clock (his next fixture kickoff). */
export interface WvPlayer {
  readonly id: string;
  /** Full display name, e.g. "Kylian Mbappé". */
  readonly name: string;
  /** First initial + surname, e.g. "K. Mbappé" — precomputed server-side from first/last/display. */
  readonly shortName: string;
  readonly position: Position;
  /** Nation (player.country) for the flag/position chip; null when unknown. */
  readonly nation: string | null;
  readonly teamName: string | null;
  /**
   * ISO kickoff of his next still-acquirable fixture — the acquisition-cutoff clock (the SAME
   * `fifa_match.kickoff_at` the lock-on-play machinery + the FAAB engine read). null = no upcoming
   * fixture (never voids on time). The client compares this to `Date.now()` to derive void live.
   */
  readonly kickoffAt: string | null;
  /** Season fantasy points, when cheaply available; null renders as "—". */
  readonly seasonPoints: number | null;
  /**
   * The player's NEXT fixture opponent ("vs/@ + flag + name"), for the free-agent picker row (T8). Resolved
   * by the shared `resolveOpponentByPlayer` (`@/src/lineup/view`) against the SAME still-acquirable fixture
   * set as `kickoffAt`, so the row's cutoff clock + opponent reference one match. Optional + only populated
   * for the free-agent pool (the lone consumer); null when the player's team has no fixture this period
   * (eliminated / knockout side undecided) → the picker renders "TBD".
   */
  readonly opponent?: OpponentInfo | null;
}

/** One of the viewing manager's own PENDING bids (self-scoped — never another manager's pending). */
export interface WvClaim {
  readonly bidId: string;
  readonly amount: number;
  /** Manager-set processing priority (§D amendment) — the batch's intra-manager EQUAL-AMOUNT tiebreak
   *  only (amount stays primary). Null = pre-column row; sorts after any numbered priority. */
  readonly priority: number | null;
  readonly add: WvPlayer;
  /** Every full-squad claim names a drop; null only for the open-slot reinforcement case. */
  readonly drop: WvPlayer | null;
}

/** A single manager's outcome row inside a settled batch (public post-batch per RLS). */
export interface WvResult {
  readonly bidId: string;
  readonly managerId: string;
  readonly managerName: string;
  readonly isMine: boolean;
  readonly add: WvPlayer;
  readonly drop: WvPlayer | null;
  readonly amount: number;
  /** Maps `BidStatus` (won | lost | voided_refunded) to the design's three outcome states. */
  readonly outcome: "won" | "lost" | "void";
}

/** T11 R2 (Fix B-2): one CONTESTED PLAYER inside a settled batch, with EVERY bid for him (winner +
 *  losers + voids) grouped together so the whole contest reads at a glance instead of being scattered
 *  across amount-ordered rows. Pure presentation regroup of `WvResult[]` — see `groupResultsByPlayer`. */
export interface WvResultGroup {
  readonly playerId: string;
  /** The added player's identity (taken from the top bid — all bids in the group share one add). */
  readonly add: WvPlayer;
  /** This player's bids, amount-desc (winner on top); the dropped-player detail rides the winning bid. */
  readonly results: readonly WvResult[];
}

/** A processed batch + its revealed result rows, newest first. */
export interface WvBatch {
  readonly batchId: string;
  /** ISO run time; the client formats it league-local. */
  readonly runAt: string;
  /** T11 Fix B: the matchday/round this batch settled (the period whose `batch_cleared_at` equals this
   *  batch's `run_at` — stamped together in one transaction). Null if no period maps (graceful: the card
   *  then shows the run time alone). This is the only period concept on /waivers — the FA pool / claims /
   *  player cards stay live/global. */
  readonly matchdayLabel: string | null;
  readonly results: readonly WvResult[];
}

/**
 * The "next batch" element's content for the current period's acquisition window — the live state the
 * worker fires against, projected into display strings. The PHASE is derived server-side via the shared
 * `acquisitionWindowState`/`effectiveBatchAt` (`@app/faab`), so the screen shows the EXACT batch instant
 * the worker uses. All fields are strings (already league-tz formatted) so the only live piece is the
 * client's countdown to `countdownToIso`.
 */
export interface WvBatchWindow {
  readonly phase: AcquisitionWindow;
  /** The small caption (`t-label`), e.g. "Waivers process at" / "Free agency open — locks at". */
  readonly caption: string;
  /** The bold value (`wv-batchbar-when`): the league-tz batch/lock time, or the period label when locked. */
  readonly value: string;
  /** Micro context (`t-micro`) — the period label, or null when it is already the value (locked). */
  readonly sub: string | null;
  /** ISO of the batch deadline — present ONLY in the sealed-bid phase, for the live "Processes in" countdown. */
  readonly countdownToIso: string | null;
}

/** One seat in the rolling waiver order. */
export interface WvWaiverSeat {
  readonly managerId: string;
  readonly name: string;
  readonly position: number;
  readonly isMe: boolean;
}

/** One team's remaining FAAB for the league-wide budgets rail — read straight off
 *  `manager.faabBudget` (the column the resolver debits on a won claim), never recomputed from bid
 *  history. Display-only; budget-desc order is computed server-side in the loader. */
export interface WvTeamBudget {
  readonly managerId: string;
  readonly name: string;
  readonly budget: number;
  readonly isMe: boolean;
  /** True when this manager's `playoff_entry.status` is "eliminated" (CONTRACT-P3 data-existence
   *  contract) — strikes the row in the rail without removing it. */
  readonly eliminated: boolean;
}

/** The viewing manager's budget. All three are engine-consistent (see WaiversClient budget notes). */
export interface WvBudget {
  /** manager.faabBudget — the remaining pool, already net of won spend. */
  readonly available: number;
  /** Sum of ALL pending bid amounts (what the engine reserves until the batch). */
  readonly pending: number;
  /** available − pending. */
  readonly after: number;
}

/** Everything the client needs, assembled server-side. */
export interface WaiversView {
  readonly managerId: string;
  readonly faabBudget: number;
  /** The pool a claimant can drop into / from — the manager's current 15-man squad. */
  readonly roster: readonly WvPlayer[];
  /** Roster player ids locked by play this matchday (can't be dropped) — resolved via @app/lineup. */
  readonly lockedPlayerIds: readonly string[];
  /** League-wide unowned players — the composer's free-agent picker source. */
  readonly freeAgents: readonly WvPlayer[];
  /** Player ids the viewer has starred (their PRIVATE watchlist) — drives the FA star toggle + filter. */
  readonly watchedPlayerIds: readonly string[];
  readonly claims: readonly WvClaim[];
  readonly batches: readonly WvBatch[];
  readonly waiverOrder: readonly WvWaiverSeat[];
  /** Every team's remaining FAAB, budget-desc — the league-wide budgets rail (display-only). */
  readonly teamBudgets: readonly WvTeamBudget[];
  /**
   * The current period's acquisition-window state for the "next batch" element. Null when no period is
   * live (nothing open and nothing pending — e.g. the season is over). The IANA tz is baked into the
   * formatted strings; `timezone` below stays for the batch-results formatter.
   */
  readonly batchWindow: WvBatchWindow | null;
  readonly timezone: string;
  /** True only when the league is in a playoff phase — gates the FAAB-reset banner + the release panel. */
  readonly isPlayoffPhase: boolean;
  /** The phase squad cap (15 group / 9 playoff) — view-driven (NOT hardcoded), drives the X/N display
   *  + the release panel's over-cap mount. */
  readonly rosterCap: number;
  /** D4 (trim-down): false ONLY for a playoff non-participant — hides the bid/FA/release affordances. */
  readonly isParticipant: boolean;
  /** ISO of the league-wide R32 first kickoff — the CONSERVATIVE forfeit bound (the earliest possible
   *  per-player lock; a survivor's own earliest kickoff may be later). Null when not in the playoff phase.
   *  Shown as a STATIC timestamp in the release panel (no countdown). */
  readonly playoffForfeitDeadlineIso: string | null;
  /** Server render time (ISO) — seeds the client's live clock so SSR + hydration agree (no mismatch). */
  readonly nowIso: string;
}
