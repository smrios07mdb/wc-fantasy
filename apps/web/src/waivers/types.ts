/**
 * The typed props the waivers SERVER component (`app/waivers/loadWaivers.ts`) hands the CLIENT
 * (`WaiversClient.tsx`). The client NEVER touches Prisma — it renders these shapes and round-trips
 * mutations through `/api/faab/bid`. Kept in `src/` so the loader, the client, and the Vitest suite all
 * agree on one contract (mirrors how `@app/vsfield` exposes its `VsFieldView`).
 *
 * Dates cross the server→client boundary as ISO strings (a server component may pass `Date`s, but
 * stringifying keeps the props trivially serialisable + testable without `Date` fixtures).
 */
import type { Position } from "@app/shared";

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
}

/** One of the viewing manager's own PENDING bids (self-scoped — never another manager's pending). */
export interface WvClaim {
  readonly bidId: string;
  readonly amount: number;
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

/** A processed batch + its revealed result rows, newest first. */
export interface WvBatch {
  readonly batchId: string;
  /** ISO run time; the client formats it league-local. */
  readonly runAt: string;
  readonly results: readonly WvResult[];
}

/** One seat in the rolling waiver order. */
export interface WvWaiverSeat {
  readonly managerId: string;
  readonly name: string;
  readonly position: number;
  readonly isMe: boolean;
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
  readonly claims: readonly WvClaim[];
  readonly batches: readonly WvBatch[];
  readonly waiverOrder: readonly WvWaiverSeat[];
  /** League-local HH:mm the batch runs + the IANA tz, for the "next batch" display. */
  readonly batchLocalTime: string;
  readonly timezone: string;
  /** True only when the league is in a playoff phase — gates the FAAB-reset banner. */
  readonly isPlayoffPhase: boolean;
  /** Server render time (ISO) — seeds the client's live clock so SSR + hydration agree (no mismatch). */
  readonly nowIso: string;
}
