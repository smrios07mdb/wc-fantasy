import { describe, it, expect, vi } from "vitest";
import {
  draftChannelName,
  draftChangeBinding,
  pickChangeBinding,
  presenceOnlineManagerIds,
  subscribeDraft,
} from "./realtime";

/** A mock Supabase channel that records `.on(...)` bindings and lets the test fire them. */
function mockChannel() {
  const bindings: { type: string; filter: unknown; cb: (payload: unknown) => void }[] = [];
  let subscribeCb: ((status: string) => void) | undefined;
  const channel = {
    bindings,
    on(type: string, filter: unknown, cb: (payload: unknown) => void) {
      bindings.push({ type, filter, cb });
      return channel;
    },
    subscribe: vi.fn((cb?: (status: string) => void) => {
      subscribeCb = cb;
      return channel;
    }),
    track: vi.fn(async () => {}),
    untrack: vi.fn(async () => {}),
    presenceState: vi.fn(() => ({}) as Record<string, Array<Record<string, unknown>>>),
    fireSubscribed: () => subscribeCb?.("SUBSCRIBED"),
    fire: (type: string, table: string | undefined, payload: unknown) => {
      for (const b of bindings) {
        const f = b.filter as { table?: string; event?: string } | undefined;
        if (b.type === type && (table === undefined || f?.table === table)) b.cb(payload);
      }
    },
  };
  return channel;
}

function mockClient(channel: ReturnType<typeof mockChannel>) {
  return {
    realtime: { setAuth: vi.fn() },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  };
}

/** A signed-in user's access token (any non-empty JWT-ish string is fine for the wiring tests). */
const TOKEN = "user-jwt-token";

describe("pure realtime descriptors", () => {
  it("names the channel per draft", () => {
    expect(draftChannelName("d1")).toBe("draft-room:d1");
  });

  it("binds postgres_changes to the right tables + row filters", () => {
    expect(draftChangeBinding("d1")).toEqual({
      event: "*",
      schema: "public",
      table: "draft",
      filter: "id=eq.d1",
    });
    expect(pickChangeBinding("d1")).toEqual({
      event: "*",
      schema: "public",
      table: "draft_pick",
      filter: "draft_id=eq.d1",
    });
  });

  it("flattens presence state into a unique online manager id list", () => {
    const state = {
      key1: [{ managerId: "m1" }],
      key2: [{ managerId: "m2" }, { managerId: "m2" }],
    };
    expect(presenceOnlineManagerIds(state).sort()).toEqual(["m1", "m2"]);
  });
});

describe("subscribeDraft — wiring", () => {
  it("subscribes to draft + draft_pick changes and presence on the draft channel", () => {
    const channel = mockChannel();
    const client = mockClient(channel);
    subscribeDraft(client, "d1", { sessionManagerId: "m1" }, {}, TOKEN);

    expect(client.channel).toHaveBeenCalledWith("draft-room:d1", expect.anything());
    const tables = channel.bindings
      .filter((b) => b.type === "postgres_changes")
      .map((b) => (b.filter as { table: string }).table);
    expect(tables).toEqual(["draft", "draft_pick"]);
    expect(channel.bindings.some((b) => b.type === "presence")).toBe(true);
  });

  it("authorizes the socket with the user JWT BEFORE subscribing (RLS-gated postgres_changes)", () => {
    const channel = mockChannel();
    const client = mockClient(channel);

    subscribeDraft(client, "d1", { sessionManagerId: "m1" }, {}, TOKEN);

    expect(client.realtime.setAuth).toHaveBeenCalledWith(TOKEN);
    // Ordering is load-bearing: postgres_changes RLS is evaluated at subscribe time, so setAuth must run
    // first — otherwise the channel joins as anon and every draft/draft_pick frame is silently filtered.
    expect(client.realtime.setAuth.mock.invocationCallOrder[0]!).toBeLessThan(
      channel.subscribe.mock.invocationCallOrder[0]!,
    );
  });

  it("re-renders on a simulated change: a draft row update fires onDraftChange; a new pick fires onPickChange", () => {
    const channel = mockChannel();
    const client = mockClient(channel);
    const onDraftChange = vi.fn();
    const onPickChange = vi.fn();
    subscribeDraft(
      client,
      "d1",
      { sessionManagerId: "m1" },
      { onDraftChange, onPickChange },
      TOKEN,
    );

    channel.fire("postgres_changes", "draft", { new: { current_pick_no: 3 } });
    channel.fire("postgres_changes", "draft_pick", { new: { pick_no: 2, player_id: "p9" } });

    expect(onDraftChange).toHaveBeenCalledWith({ new: { current_pick_no: 3 } });
    expect(onPickChange).toHaveBeenCalledWith({ new: { pick_no: 2, player_id: "p9" } });
  });

  it("reports presence on sync, surfaces status, and tracks the session manager once subscribed", () => {
    const channel = mockChannel();
    channel.presenceState.mockReturnValue({ a: [{ managerId: "m1" }], b: [{ managerId: "m7" }] });
    const client = mockClient(channel);
    const onPresence = vi.fn();
    const onStatus = vi.fn();
    subscribeDraft(client, "d1", { sessionManagerId: "m1" }, { onPresence, onStatus }, TOKEN);

    channel.fire("presence", undefined, { event: "sync" });
    expect(onPresence).toHaveBeenCalledWith(expect.arrayContaining(["m1", "m7"]));

    channel.fireSubscribed();
    expect(onStatus).toHaveBeenCalledWith("SUBSCRIBED");
    expect(channel.track).toHaveBeenCalledWith(expect.objectContaining({ managerId: "m1" }));
  });

  it("unsubscribe removes the channel", () => {
    const channel = mockChannel();
    const client = mockClient(channel);
    const unsubscribe = subscribeDraft(client, "d1", { sessionManagerId: "m1" }, {}, TOKEN);
    unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
