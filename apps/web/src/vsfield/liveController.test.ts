import { describe, it, expect, vi } from "vitest";
import type { VsFieldView } from "@app/vsfield";
import type { PostgresChangeBinding, RealtimeChannelLike, RealtimeClientLike } from "./realtime";
import { startVsFieldLive } from "./liveController";

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function view(id: string): VsFieldView {
  return {
    asOf: id,
    leagueId: "lg1",
    viewerManagerId: "m1",
    currentPeriod: { id: "md1", label: "MD1" },
    field: [],
    season: [],
    matches: [],
  };
}

function mockChannel() {
  const bindings: { binding: PostgresChangeBinding; cb: (p: unknown) => void }[] = [];
  let subscribeCb: ((status: string) => void) | undefined;
  const channel = {
    on(_t: "postgres_changes", binding: PostgresChangeBinding, cb: (p: unknown) => void) {
      bindings.push({ binding, cb });
      return channel as unknown as RealtimeChannelLike;
    },
    subscribe(cb?: (status: string) => void) {
      subscribeCb = cb;
      return channel as unknown as RealtimeChannelLike;
    },
    fireChange() {
      bindings[0]?.cb({ new: {} });
    },
    fireStatus(s: string) {
      subscribeCb?.(s);
    },
  };
  return channel;
}

function mockClient(channel: ReturnType<typeof mockChannel>) {
  return {
    realtime: { setAuth: vi.fn() },
    channel: vi.fn(() => channel as unknown as RealtimeChannelLike),
    removeChannel: vi.fn(),
  };
}

/** Controllable fetcher: each call returns a promise the test resolves explicitly (for ordering). */
function controllableFetcher() {
  const calls: {
    resolve: (v: VsFieldView | null) => void;
    promise: Promise<VsFieldView | null>;
  }[] = [];
  const fetchSnapshot = vi.fn(() => {
    let resolve!: (v: VsFieldView | null) => void;
    const promise = new Promise<VsFieldView | null>((r) => (resolve = r));
    calls.push({ resolve, promise });
    return promise;
  });
  return { fetchSnapshot, calls };
}

function manualTimers() {
  let tick: (() => void) | undefined;
  return {
    fire: () => tick?.(),
    timers: {
      setInterval: vi.fn((cb: () => void, _ms: number) => {
        tick = cb;
        return 1 as unknown;
      }),
      clearInterval: vi.fn(),
    },
  };
}

describe("startVsFieldLive — change-nudge + polling fallback → seq-guarded refetch", () => {
  function setup(token: string | null = "jwt") {
    const channel = mockChannel();
    const client = mockClient(channel);
    const { fetchSnapshot, calls } = controllableFetcher();
    const onSnapshot = vi.fn();
    const onStatus = vi.fn();
    const { fire: firePoll, timers } = manualTimers();
    const stop = startVsFieldLive({
      client: client as unknown as RealtimeClientLike,
      args: { leagueId: "lg1", currentPeriodId: "md1" },
      accessToken: token,
      fetchSnapshot,
      onSnapshot,
      onStatus,
      pollMs: 20_000,
      timers,
    });
    return { channel, client, fetchSnapshot, calls, onSnapshot, onStatus, firePoll, timers, stop };
  }

  it("authorizes + subscribes and registers the polling fallback interval", () => {
    const s = setup();
    expect(s.client.realtime.setAuth).toHaveBeenCalledWith("jwt");
    expect(s.client.channel).toHaveBeenCalledWith("vsfield:lg1");
    expect(s.timers.setInterval).toHaveBeenCalledWith(expect.any(Function), 20_000);
    s.stop();
  });

  it("refetches and applies the snapshot on a Realtime change frame", async () => {
    const s = setup();
    s.channel.fireChange();
    expect(s.fetchSnapshot).toHaveBeenCalledTimes(1);
    s.calls[0]!.resolve(view("v1"));
    await flush();
    expect(s.onSnapshot).toHaveBeenCalledWith(view("v1"));
    s.stop();
  });

  it("refetches and applies the snapshot on a polling-fallback tick", async () => {
    const s = setup();
    s.firePoll();
    expect(s.fetchSnapshot).toHaveBeenCalledTimes(1);
    s.calls[0]!.resolve(view("vp"));
    await flush();
    expect(s.onSnapshot).toHaveBeenCalledWith(view("vp"));
    s.stop();
  });

  it("seq-guards out-of-order responses: only the latest refetch is applied", async () => {
    const s = setup();
    s.channel.fireChange(); // refetch #1 (seq 1)
    s.firePoll(); // refetch #2 (seq 2)
    expect(s.fetchSnapshot).toHaveBeenCalledTimes(2);
    // The SECOND request resolves first…
    s.calls[1]!.resolve(view("latest"));
    await flush();
    // …then the slow FIRST request resolves — it must NOT clobber the newer state.
    s.calls[0]!.resolve(view("stale"));
    await flush();
    expect(s.onSnapshot).toHaveBeenCalledTimes(1);
    expect(s.onSnapshot).toHaveBeenCalledWith(view("latest"));
  });

  it("ignores a null snapshot (failed refetch) — keeps prior state", async () => {
    const s = setup();
    s.channel.fireChange();
    s.calls[0]!.resolve(null);
    await flush();
    expect(s.onSnapshot).not.toHaveBeenCalled();
    s.stop();
  });

  it("forwards channel status to onStatus", () => {
    const s = setup();
    s.channel.fireStatus("SUBSCRIBED");
    expect(s.onStatus).toHaveBeenCalledWith("SUBSCRIBED");
    s.stop();
  });

  it("teardown clears the interval and removes the channel", () => {
    const s = setup();
    s.stop();
    expect(s.timers.clearInterval).toHaveBeenCalledTimes(1);
    expect(s.client.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("does not subscribe or poll without a token (gates on a real session)", () => {
    const s = setup(null);
    expect(s.client.channel).not.toHaveBeenCalled();
    expect(s.timers.setInterval).not.toHaveBeenCalled();
  });
});
