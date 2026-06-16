/**
 * Supabase Realtime wiring for the live guillotine theater (/playoffs, ARCHITECTURE §21 + §5). State stays
 * AUTHORITATIVE in Postgres; the recompute sweeper upserts `score_manager_period` and the round-cut / champion
 * jobs flip `playoff_entry` rows — those row changes broadcast, and the client RE-FETCHES the server-computed
 * snapshot (`GET /api/playoffs`); it does NOT fold the raw row in (the ladder, the provisional cut, the
 * reduced pitch + names are all server-derived). So the handler here is a single change-NUDGE, not a patcher.
 *
 * The TWO browser-readable tables the client subscribes to (Theme F) — BOTH UNFILTERED:
 *   • `playoff_entry`        — the eliminations / champion (the round-cut writes).
 *   • `score_manager_period` — the live round's running scores.
 * Neither carries a filter. `score_manager_period` has no `league_id` column to scope by, and the live
 * round's `period_id` is not on the snapshot; `playoff_entry` HAS a `league_id`, but scoping by it would
 * need a `leagueId` attached to `PlayoffsView` — deliberately NOT added, to keep the loader's `managerNames`
 * map the SOLE read-model change (the scoped read-model exception, DECISIONS). ARCHITECTURE §4 pins ONE
 * permanent league, and BOTH tables are RLS-gated (the `playoff_entry_select_league_member` policy + the
 * `score_manager_period` SECURITY DEFINER helper), so every delivered row is this league's and a member sees
 * exactly the field — an unfiltered binding is league-scoped IN EFFECT. Settled periods never change, so in
 * practice only the live round's score writes nudge a refetch. TODO(confirm): if precise scoping is wanted,
 * attach `leagueId` (+ `currentRoundPeriodId`) to the snapshot and filter on them (the vsfield analog).
 *
 * Both tables are RLS-gated, so — exactly like the draft room (Prompt 08 + the mock-draft fix) and vsfield —
 * we MUST `realtime.setAuth(<user JWT>)` BEFORE subscribe; an anon socket joins and streams but every
 * row-change frame is silently filtered to zero. The token gate + re-subscribe on refresh live in the
 * client shell / liveController. The client ({@link RealtimeClientLike}) is injected so this is unit-testable
 * with a mock channel; the pure binding descriptors are exported so a test asserts the targeting without a
 * socket. Do NOT subscribe to `standing` (frozen at the transition).
 */

/** Documented degraded-mode poll cadence (ARCHITECTURE §5: "15–30s"); midpoint default — the WIRED
 *  fallback in liveController (visibility-gated), with the subscription as the primary path. */
export const POLLING_FALLBACK_MS = 20_000;

/** One permanent league (ARCHITECTURE §4), so a single stable channel name; clients multiplex onto it and
 *  each receives their own RLS-filtered postgres_changes stream. */
export const PLAYOFFS_CHANNEL = "playoffs";

export interface PostgresChangeBinding {
  event: "*" | "INSERT" | "UPDATE" | "DELETE";
  schema: "public";
  table: string;
  /** Optional row filter (`col=eq.value`). Omitted here — RLS + the single-league invariant scope delivery. */
  filter?: string;
}

export interface RealtimeChannelLike {
  on(
    type: "postgres_changes",
    binding: PostgresChangeBinding,
    cb: (payload: unknown) => void,
  ): RealtimeChannelLike;
  subscribe(cb?: (status: string) => void): RealtimeChannelLike;
}

export interface RealtimeClientLike {
  /** Authorize the Realtime socket with the signed-in user's JWT. postgres_changes is RLS-gated, so the
   *  anon apikey alone is silently filtered to zero rows. Must be set BEFORE subscribing. */
  realtime: { setAuth(token: string | null): unknown };
  channel(name: string, opts?: unknown): RealtimeChannelLike;
  removeChannel(channel: RealtimeChannelLike): unknown;
}

export interface PlayoffsRealtimeHandlers {
  /** A `score_manager_period` (live round) or `playoff_entry` (eliminations/champion) row changed. */
  onChange?: () => void;
  /** Channel status ("SUBSCRIBED" / "CHANNEL_ERROR" / "TIMED_OUT" / …) — drives the connection pill. */
  onStatus?: (status: string) => void;
}

/** postgres_changes binding for `playoff_entry` (eliminations + champion). UNFILTERED — see file header. */
export function playoffEntryBinding(): PostgresChangeBinding {
  return { event: "*", schema: "public", table: "playoff_entry" };
}

/** postgres_changes binding for `score_manager_period` (the live round's running scores). UNFILTERED. */
export function scoreManagerPeriodBinding(): PostgresChangeBinding {
  return { event: "*", schema: "public", table: "score_manager_period" };
}

/**
 * Subscribe to the league's score/elimination changes and nudge `onChange` on any of them. Returns an
 * unsubscribe fn that tears the channel down. `accessToken` is the signed-in user's JWT:
 * `realtime.setAuth(accessToken)` runs BEFORE subscribe so the RLS-gated postgres_changes are delivered.
 */
export function subscribePlayoffs(
  client: RealtimeClientLike,
  handlers: PlayoffsRealtimeHandlers,
  accessToken: string | null,
): () => void {
  // Authorize the socket with the USER JWT first — this is what lets postgres_changes pass RLS.
  client.realtime.setAuth(accessToken);

  const channel = client.channel(PLAYOFFS_CHANNEL);
  channel.on("postgres_changes", scoreManagerPeriodBinding(), () => handlers.onChange?.());
  channel.on("postgres_changes", playoffEntryBinding(), () => handlers.onChange?.());
  channel.subscribe((status) => handlers.onStatus?.(status));

  return () => {
    void client.removeChannel(channel);
  };
}
