/**
 * Supabase Realtime wiring for the draft room (ARCHITECTURE.md §5). State stays AUTHORITATIVE in
 * Postgres; this is broadcast-on-change so a new pick or an advance (`current_pick_no` /
 * `current_manager_id` / `pick_deadline_at`) pushes to every connected client, who re-render from the
 * authoritative row carried in the payload. Presence tracks who's online on the draft channel.
 *
 * The client (the structural {@link RealtimeClientLike}) is injected so the wiring is unit-testable with
 * a mock channel; production passes the Prompt-07 browser client. The pure descriptors (channel name +
 * the postgres_changes table/row filters) are exported separately so a test can assert the targeting
 * without a live socket.
 *
 * POLLING FALLBACK (ARCHITECTURE §5): if the socket drops, the screen can fall back to re-fetching the
 * snapshot every 15–30s. We default to the subscription (the vendor is already wired) and leave the
 * fallback as a seam — see {@link POLLING_FALLBACK_MS}.
 * TODO(confirm): wire the 15–30s poll as a degraded-mode fallback (reconnect/backoff policy unspecified).
 */

/** Documented degraded-mode poll cadence (ARCHITECTURE §5: "15–30s"); midpoint default. Seam only. */
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
  on(
    type: "presence",
    binding: { event: "sync" | "join" | "leave" },
    cb: (payload: unknown) => void,
  ): RealtimeChannelLike;
  subscribe(cb?: (status: string) => void): RealtimeChannelLike;
  track(payload: Record<string, unknown>): Promise<unknown> | unknown;
  presenceState(): Record<string, Array<Record<string, unknown>>>;
}

export interface RealtimeClientLike {
  channel(name: string, opts?: unknown): RealtimeChannelLike;
  removeChannel(channel: RealtimeChannelLike): unknown;
}

export interface DraftPresenceContext {
  sessionManagerId: string;
}

export interface DraftRealtimeHandlers {
  /** A `draft` row changed (pointer advance / new deadline). Payload is the postgres_changes record. */
  onDraftChange?: (payload: unknown) => void;
  /** A `draft_pick` row changed (a pick landed). Payload is the postgres_changes record. */
  onPickChange?: (payload: unknown) => void;
  /** Presence synced — the deduped online manager ids. */
  onPresence?: (onlineManagerIds: string[]) => void;
  /** Channel status changes (e.g. "SUBSCRIBED" / "CHANNEL_ERROR") — drives the connection pill. */
  onStatus?: (status: string) => void;
}

/** The per-draft channel name. */
export function draftChannelName(draftId: string): string {
  return `draft-room:${draftId}`;
}

/** postgres_changes binding for the `draft` row (the pointer + deadline). */
export function draftChangeBinding(draftId: string): PostgresChangeBinding {
  return { event: "*", schema: "public", table: "draft", filter: `id=eq.${draftId}` };
}

/** postgres_changes binding for this draft's `draft_pick` rows. */
export function pickChangeBinding(draftId: string): PostgresChangeBinding {
  return { event: "*", schema: "public", table: "draft_pick", filter: `draft_id=eq.${draftId}` };
}

/** Flatten Supabase presence state into a unique list of online manager ids. */
export function presenceOnlineManagerIds(
  state: Record<string, Array<Record<string, unknown>>>,
): string[] {
  const ids = new Set<string>();
  for (const presences of Object.values(state)) {
    for (const p of presences) {
      const id = p.managerId;
      if (typeof id === "string") ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Subscribe to a draft's authoritative changes + presence. Returns an unsubscribe fn. The handlers fire
 * on every broadcast; the caller re-renders from the row payload (state stays authoritative in Postgres).
 */
export function subscribeDraft(
  client: RealtimeClientLike,
  draftId: string,
  ctx: DraftPresenceContext,
  handlers: DraftRealtimeHandlers,
): () => void {
  const channel = client.channel(draftChannelName(draftId), {
    config: { presence: { key: ctx.sessionManagerId } },
  });

  channel
    .on("postgres_changes", draftChangeBinding(draftId), (payload) =>
      handlers.onDraftChange?.(payload),
    )
    .on("postgres_changes", pickChangeBinding(draftId), (payload) =>
      handlers.onPickChange?.(payload),
    )
    .on("presence", { event: "sync" }, () =>
      handlers.onPresence?.(presenceOnlineManagerIds(channel.presenceState())),
    )
    .subscribe((status) => {
      handlers.onStatus?.(status);
      if (status === "SUBSCRIBED") {
        void channel.track({ managerId: ctx.sessionManagerId });
      }
    });

  return () => {
    void client.removeChannel(channel);
  };
}
