import { describe, it, expect, vi } from "vitest";
import type { PlayoffsView } from "@/app/playoffs/loadPlayoffs";
import { startPlayoffsLive } from "./liveController";
import type { RealtimeChannelLike, RealtimeClientLike } from "./realtime";

const view = (id: string) => ({ managerId: id }) as unknown as PlayoffsView;
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

// A fake client that records the subscribe path + lets a test fire a change-nudge and the status.
function fakeClient() {
  const calls: string[] = [];
  let changeCb: (() => void) | undefined;
  let statusCb: ((s: string) => void) | undefined;
  const channel: RealtimeChannelLike = {
    on(_t, _b, cb) {
      changeCb = cb as () => void; // last binding wins; either nudges the same refetch
      return channel;
    },
    subscribe(cb) {
      statusCb = cb;
      calls.push("subscribe");
      return channel;
    },
  };
  const client: RealtimeClientLike = {
    realtime: { setAuth: () => undefined },
    channel: () => channel,
    removeChannel: () => {
      calls.push("removeChannel");
      return undefined;
    },
  };
  return { client, calls, nudge: () => changeCb?.(), fireStatus: (s: string) => statusCb?.(s) };
}

// A fake interval timer the test drives manually.
function fakeTimers() {
  let cb: (() => void) | null = null;
  let cleared = false;
  return {
    timers: {
      setInterval: (fn: () => void) => {
        cb = fn;
        return 7;
      },
      clearInterval: () => {
        cleared = true;
      },
    },
    tick: () => cb?.(),
    isCleared: () => cleared,
  };
}

describe("startPlayoffsLive — token gate, seq-guarded refetch, visibility-gated poll, teardown", () => {
  it("is a no-op (no subscribe) without an access token — an anon socket gets zero RLS-gated changes", () => {
    const f = fakeClient();
    const stop = startPlayoffsLive({
      client: f.client,
      accessToken: null,
      fetchSnapshot: async () => view("x"),
      onSnapshot: () => {},
    });
    expect(f.calls).not.toContain("subscribe");
    stop(); // safe no-op
  });

  it("subscribes with a token and applies the refetched snapshot on a change-nudge", async () => {
    const f = fakeClient();
    const onSnapshot = vi.fn();
    startPlayoffsLive({
      client: f.client,
      accessToken: "jwt",
      fetchSnapshot: async () => view("fresh"),
      onSnapshot,
      timers: fakeTimers().timers,
    });
    expect(f.calls).toContain("subscribe");
    f.nudge();
    await flush();
    expect(onSnapshot).toHaveBeenCalledWith(view("fresh"));
  });

  it("seq-guards concurrent refetches: only the LATEST response is applied", async () => {
    const f = fakeClient();
    const onSnapshot = vi.fn();
    const resolvers: ((v: PlayoffsView) => void)[] = [];
    startPlayoffsLive({
      client: f.client,
      accessToken: "jwt",
      fetchSnapshot: () => new Promise<PlayoffsView>((res) => resolvers.push(res)),
      onSnapshot,
      timers: fakeTimers().timers,
    });
    f.nudge(); // refetch #1 (seq 1)
    f.nudge(); // refetch #2 (seq 2)
    resolvers[1]!(view("v2")); // newest resolves first
    await flush();
    resolvers[0]!(view("v1")); // stale earlier resolves later — must be ignored
    await flush();
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenCalledWith(view("v2"));
  });

  it("polls on the interval tick ONLY when the document is visible (a hidden tab skips)", async () => {
    const f = fakeClient();
    const ft = fakeTimers();
    const fetchSnapshot = vi.fn(async () => view("poll"));
    let visible = false;
    startPlayoffsLive({
      client: f.client,
      accessToken: "jwt",
      fetchSnapshot,
      onSnapshot: () => {},
      isVisible: () => visible,
      timers: ft.timers,
    });
    ft.tick(); // hidden → skipped
    await flush();
    expect(fetchSnapshot).not.toHaveBeenCalled();
    visible = true;
    ft.tick(); // visible → refetch
    await flush();
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it("teardown clears the interval, unsubscribes, and ignores a late in-flight response", async () => {
    const f = fakeClient();
    const ft = fakeTimers();
    const onSnapshot = vi.fn();
    const resolvers: ((v: PlayoffsView) => void)[] = [];
    const stop = startPlayoffsLive({
      client: f.client,
      accessToken: "jwt",
      fetchSnapshot: () => new Promise<PlayoffsView>((res) => resolvers.push(res)),
      onSnapshot,
      isVisible: () => true,
      timers: ft.timers,
    });
    f.nudge(); // refetch in flight
    stop();
    expect(ft.isCleared()).toBe(true);
    expect(f.calls).toContain("removeChannel");
    resolvers[0]!(view("late")); // resolves AFTER teardown → must not be applied
    await flush();
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("forwards channel status to onStatus", () => {
    const f = fakeClient();
    const onStatus = vi.fn();
    startPlayoffsLive({
      client: f.client,
      accessToken: "jwt",
      fetchSnapshot: async () => view("x"),
      onSnapshot: () => {},
      onStatus,
      timers: fakeTimers().timers,
    });
    f.fireStatus("SUBSCRIBED");
    expect(onStatus).toHaveBeenCalledWith("SUBSCRIBED");
  });
});
