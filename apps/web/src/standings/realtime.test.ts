import { describe, it, expect, vi } from "vitest";
import {
  STANDINGS_CHANNEL,
  scoreManagerPeriodBinding,
  standingBinding,
  subscribeStandings,
  type RealtimeChannelLike,
  type RealtimeClientLike,
} from "./realtime";

describe("standings realtime — pure channel + binding descriptors", () => {
  it("uses one stable channel name (single permanent league)", () => {
    expect(STANDINGS_CHANNEL).toBe("standings");
  });

  it("subscribes to score_manager_period UNFILTERED (no league_id column; RLS + single-league scope it)", () => {
    const b = scoreManagerPeriodBinding();
    expect(b).toEqual({ event: "*", schema: "public", table: "score_manager_period" });
    expect(b.filter).toBeUndefined();
  });

  it("subscribes to standing UNFILTERED (RLS league policy + single-league scope delivery)", () => {
    const b = standingBinding();
    expect(b).toEqual({ event: "*", schema: "public", table: "standing" });
    expect(b.filter).toBeUndefined();
  });
});

// A recording fake of the Supabase client surface the subscribe path uses.
function fakeClient() {
  const calls: string[] = [];
  const onBindings: { table: string; cb: (p: unknown) => void }[] = [];
  let statusCb: ((s: string) => void) | undefined;
  const channel: RealtimeChannelLike = {
    on(_type, binding, cb) {
      calls.push(`on:${binding.table}`);
      onBindings.push({ table: binding.table, cb });
      return channel;
    },
    subscribe(cb) {
      calls.push("subscribe");
      statusCb = cb;
      return channel;
    },
  };
  const client: RealtimeClientLike = {
    realtime: {
      setAuth(token: string | null) {
        calls.push(`setAuth:${token ?? "null"}`);
        return undefined;
      },
    },
    channel(name: string) {
      calls.push(`channel:${name}`);
      return channel;
    },
    removeChannel() {
      calls.push("removeChannel");
      return undefined;
    },
  };
  return { client, calls, onBindings, fireStatus: (s: string) => statusCb?.(s) };
}

describe("subscribeStandings — setAuth-before-subscribe, both tables, nudge + teardown", () => {
  it("authorizes the socket with the JWT BEFORE subscribing (RLS gate)", () => {
    const f = fakeClient();
    subscribeStandings(f.client, {}, "jwt-123");
    const setAuthAt = f.calls.indexOf("setAuth:jwt-123");
    const subscribeAt = f.calls.indexOf("subscribe");
    expect(setAuthAt).toBeGreaterThanOrEqual(0);
    expect(subscribeAt).toBeGreaterThan(setAuthAt);
  });

  it("binds postgres_changes for BOTH score_manager_period and standing", () => {
    const f = fakeClient();
    subscribeStandings(f.client, {}, "jwt");
    const tables = f.onBindings.map((b) => b.table);
    expect(tables).toEqual(["score_manager_period", "standing"]);
  });

  it("nudges onChange when either table's row changes", () => {
    const f = fakeClient();
    const onChange = vi.fn();
    subscribeStandings(f.client, { onChange }, "jwt");
    f.onBindings[0]!.cb({}); // a live score change
    f.onBindings[1]!.cb({}); // a standing recompute
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("forwards channel status to onStatus (drives the connection pill)", () => {
    const f = fakeClient();
    const onStatus = vi.fn();
    subscribeStandings(f.client, { onStatus }, "jwt");
    f.fireStatus("SUBSCRIBED");
    expect(onStatus).toHaveBeenCalledWith("SUBSCRIBED");
  });

  it("returns an unsubscribe that tears the channel down", () => {
    const f = fakeClient();
    const teardown = subscribeStandings(f.client, {}, "jwt");
    teardown();
    expect(f.calls).toContain("removeChannel");
  });
});
