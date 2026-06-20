/**
 * Supabase Realtime wiring for the live `/standings` page (ARCHITECTURE §4 read surface; the vsfield /
 * playoffs pattern). State stays AUTHORITATIVE in Postgres; the recompute sweeper upserts
 * `score_manager_period` (the live wave's running scores) and `standing` (the all-play-all power
 * record). Those row changes broadcast, and the client RE-FETCHES the server-computed snapshot
 * (`GET /api/standings`) — it does NOT fold the raw row in (both tabs are server-derived from the
 * period scores). So the handler here is a single change-NUDGE, not a patcher.
 *
 * The TWO browser-readable tables the client subscribes to (Theme F) — BOTH UNFILTERED:
 *   • `score_manager_period` — the live matchday's running scores (also re-seeds the cumulative tab).
 *   • `standing`             — the persisted all-play-all power record.
 * Neither carries a filter. `score_manager_period` has no `league_id` column to scope by, and the
 * `standing` rows could be scoped by `league_id` (the vsfield analog) but are deliberately left
 * unfiltered to keep `StandingsView` free of a `leagueId` (the playoffs precedent — no read-model
 * change beyond the snapshot). ARCHITECTURE §4 pins ONE permanent league, and BOTH tables are RLS-gated
 * (the `standing_select_league_member` policy + the `score_manager_period` SECURITY DEFINER helper), so
 * every delivered row is this league's and a member sees exactly the field — an unfiltered binding is
 * league-scoped IN EFFECT.
 *
 * Both tables are RLS-gated, so — exactly like the draft room, vsfield, and the playoffs theater — we
 * MUST `realtime.setAuth(<user JWT>)` BEFORE subscribe; an anon socket joins and streams but every
 * row-change frame is silently filtered to zero. The token gate + re-subscribe on refresh live in the
 * client shell / liveController. The client ({@link RealtimeClientLike}) is injected so this is
 * unit-testable with a mock channel; the pure binding descriptors are exported so a test asserts the
 * targeting without a socket.
 */

/** Documented degraded-mode poll cadence (ARCHITECTURE §5: "15–30s"); midpoint default — the WIRED
 *  fallback in liveController (visibility-gated), with the subscription as the primary path. */
export const POLLING_FALLBACK_MS = 20_000;

/** One permanent league (ARCHITECTURE §4), so a single stable channel name; clients multiplex onto it
 *  and each receives their own RLS-filtered postgres_changes stream. */
export const STANDINGS_CHANNEL = "standings";

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

export interface StandingsRealtimeHandlers {
  /** A `score_manager_period` (live scores) or `standing` (power record) row changed. */
  onChange?: () => void;
  /** Channel status ("SUBSCRIBED" / "CHANNEL_ERROR" / "TIMED_OUT" / …) — drives the connection pill. */
  onStatus?: (status: string) => void;
}

/** postgres_changes binding for `score_manager_period` (the live matchday's running scores). UNFILTERED. */
export function scoreManagerPeriodBinding(): PostgresChangeBinding {
  return { event: "*", schema: "public", table: "score_manager_period" };
}

/** postgres_changes binding for `standing` (the all-play-all power record). UNFILTERED — see file header. */
export function standingBinding(): PostgresChangeBinding {
  return { event: "*", schema: "public", table: "standing" };
}

/**
 * Subscribe to the league's score/standing changes and nudge `onChange` on any of them. Returns an
 * unsubscribe fn that tears the channel down. `accessToken` is the signed-in user's JWT:
 * `realtime.setAuth(accessToken)` runs BEFORE subscribe so the RLS-gated postgres_changes are delivered.
 */
export function subscribeStandings(
  client: RealtimeClientLike,
  handlers: StandingsRealtimeHandlers,
  accessToken: string | null,
): () => void {
  // Authorize the socket with the USER JWT first — this is what lets postgres_changes pass RLS.
  client.realtime.setAuth(accessToken);

  const channel = client.channel(STANDINGS_CHANNEL);
  channel.on("postgres_changes", scoreManagerPeriodBinding(), () => handlers.onChange?.());
  channel.on("postgres_changes", standingBinding(), () => handlers.onChange?.());
  channel.subscribe((status) => handlers.onStatus?.(status));

  return () => {
    void client.removeChannel(channel);
  };
}
