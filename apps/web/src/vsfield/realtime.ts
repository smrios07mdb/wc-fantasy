/**
 * Supabase Realtime wiring for the live "vs the field" screen (ARCHITECTURE.md §5). State stays
 * AUTHORITATIVE in Postgres; the recompute sweeper upserts `score_manager_period` + `standing`, those
 * row changes broadcast, and the client RE-FETCHES the server-computed snapshot (it does NOT fold the
 * raw row in — the field/H2H/still-to-come are all server-derived). So the handler here is a single
 * change-NUDGE, not a row patcher.
 *
 * The two browser-readable tables are the ONLY ones the client subscribes to (Theme F): `standing`
 * (filtered by league) and `score_manager_period` (filtered by the current period — it has no league_id
 * column, and one league per tournament means the period filter scopes to the live wave). Both are
 * RLS-gated, so — exactly like the draft room (Prompt 08 + the mock-draft fix) — we MUST
 * `realtime.setAuth(<user JWT>)` BEFORE subscribe, gate the first subscribe on a real token, and
 * re-subscribe on token refresh (the lifecycle lives in the client shell / liveController). An anon
 * socket joins and streams broadcast/presence but every row-change frame is silently filtered to zero.
 *
 * The client (the structural {@link RealtimeClientLike}) is injected so this is unit-testable with a mock
 * channel; production passes the Prompt-07 browser client. Pure descriptors (channel name + the
 * postgres_changes table/row filters) are exported so a test can assert the targeting without a socket.
 */

/** Documented degraded-mode poll cadence (ARCHITECTURE §5: "15–30s"); midpoint default. Here it is the
 *  WIRED fallback (see liveController), with the subscription as the primary path. */
export const POLLING_FALLBACK_MS = 20_000;

export interface PostgresChangeBinding {
  event: "*" | "INSERT" | "UPDATE" | "DELETE";
  schema: "public";
  table: string;
  filter: string;
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

export interface VsFieldRealtimeHandlers {
  /** A `score_manager_period` (current period) or `standing` (league) row changed — nudge a refetch. */
  onChange?: () => void;
  /** Channel status ("SUBSCRIBED" / "CHANNEL_ERROR" / "TIMED_OUT" / …) — drives the connection pill. */
  onStatus?: (status: string) => void;
}

export interface SubscribeVsFieldArgs {
  leagueId: string;
  /** The current period whose `score_manager_period` rows we stream; null = no live wave (standing only). */
  currentPeriodId: string | null;
  /**
   * T15-CUT: also bind the league's `playoff_entry` rows so a round-advance (cut applied / champion
   * crowned) nudges a refetch — the ceremony latch + fallen section ride the SAME snapshot refresh.
   * OFF by default: the group-phase channel stays byte-identical to today. Client-side subscription
   * composition only — `playoff_entry` is already published + RLS-readable (the /playoffs channel
   * binds it); NO publication/RLS change.
   */
  subscribeKnockout?: boolean;
}

/** The per-league vs-the-field channel name. */
export function vsFieldChannelName(leagueId: string): string {
  return `vsfield:${leagueId}`;
}

/** postgres_changes binding for the current period's `score_manager_period` rows (the live running scores). */
export function scoreManagerPeriodBinding(periodId: string): PostgresChangeBinding {
  return {
    event: "*",
    schema: "public",
    table: "score_manager_period",
    filter: `period_id=eq.${periodId}`,
  };
}

/** postgres_changes binding for the league's `standing` rows (the all-play-all power record). */
export function standingBinding(leagueId: string): PostgresChangeBinding {
  return { event: "*", schema: "public", table: "standing", filter: `league_id=eq.${leagueId}` };
}

/**
 * postgres_changes binding for the league's `playoff_entry` rows (knockout mode only — T15-CUT).
 * LEAGUE-FILTERED by contract (rider D): this deliberately does NOT copy the /playoffs channel's
 * unfiltered binding — the launch audit flagged that shape as the anti-pattern; every vsfield
 * binding scopes to the viewer's league (or period) server-side.
 */
export function playoffEntryBinding(leagueId: string): PostgresChangeBinding {
  return {
    event: "*",
    schema: "public",
    table: "playoff_entry",
    filter: `league_id=eq.${leagueId}`,
  };
}

/**
 * Subscribe to the league's score/standing changes and nudge `onChange` on any of them. Returns an
 * unsubscribe fn that tears the channel down. `accessToken` is the signed-in user's JWT:
 * `realtime.setAuth(accessToken)` runs BEFORE subscribe so the RLS-gated postgres_changes are delivered.
 */
export function subscribeVsField(
  client: RealtimeClientLike,
  args: SubscribeVsFieldArgs,
  handlers: VsFieldRealtimeHandlers,
  accessToken: string | null,
): () => void {
  // Authorize the socket with the USER JWT first — this is what lets postgres_changes pass RLS.
  client.realtime.setAuth(accessToken);

  const channel = client.channel(vsFieldChannelName(args.leagueId));
  if (args.currentPeriodId) {
    channel.on("postgres_changes", scoreManagerPeriodBinding(args.currentPeriodId), () =>
      handlers.onChange?.(),
    );
  }
  channel.on("postgres_changes", standingBinding(args.leagueId), () => handlers.onChange?.());
  if (args.subscribeKnockout) {
    channel.on("postgres_changes", playoffEntryBinding(args.leagueId), () =>
      handlers.onChange?.(),
    );
  }
  channel.subscribe((status) => handlers.onStatus?.(status));

  return () => {
    void client.removeChannel(channel);
  };
}
