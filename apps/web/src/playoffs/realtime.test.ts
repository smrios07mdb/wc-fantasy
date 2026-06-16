import { describe, it, expect, vi } from "vitest";
import {
  PLAYOFFS_CHANNEL,
  playoffEntryBinding,
  scoreManagerPeriodBinding,
  subscribePlayoffs,
  type RealtimeChannelLike,
  type RealtimeClientLike,
} from "./realtime";

describe("playoffs realtime — pure channel + binding descriptors", () => {
  it("uses one stable channel name (single permanent league)", () => {
    expect(PLAYOFFS_CHANNEL).toBe("playoffs");
  });

  it("subscribes to playoff_entry UNFILTERED (RLS + single-league scope delivery; no leagueId attachment)", () => {
    const b = playoffEntryBinding();
    expect(b).toEqual({ event: "*", schema: "public", table: "playoff_entry" });
    expect(b.filter).toBeUndefined();
  });

  it("subscribes to score_manager_period UNFILTERED (no league_id column; RLS + single-league scope it)", () => {
    const b = scoreManagerPeriodBinding();
    expect(b).toEqual({ event: "*", schema: "public", table: "score_manager_period" });
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

describe("subscribePlayoffs — setAuth-before-subscribe, both tables, nudge + teardown", () => {
  it("authorizes the socket with the JWT BEFORE subscribing (RLS gate)", () => {
    const f = fakeClient();
    subscribePlayoffs(f.client, {}, "jwt-123");
    const setAuthAt = f.calls.indexOf("setAuth:jwt-123");
    const subscribeAt = f.calls.indexOf("subscribe");
    expect(setAuthAt).toBeGreaterThanOrEqual(0);
    expect(subscribeAt).toBeGreaterThan(setAuthAt);
  });

  it("binds postgres_changes for BOTH score_manager_period and playoff_entry (and not standing)", () => {
    const f = fakeClient();
    subscribePlayoffs(f.client, {}, "jwt");
    const tables = f.onBindings.map((b) => b.table);
    expect(tables).toEqual(["score_manager_period", "playoff_entry"]);
    expect(tables).not.toContain("standing");
  });

  it("nudges onChange when either table's row changes", () => {
    const f = fakeClient();
    const onChange = vi.fn();
    subscribePlayoffs(f.client, { onChange }, "jwt");
    f.onBindings[0]!.cb({}); // a score change
    f.onBindings[1]!.cb({}); // an elimination
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("forwards channel status to onStatus (drives the connection pill)", () => {
    const f = fakeClient();
    const onStatus = vi.fn();
    subscribePlayoffs(f.client, { onStatus }, "jwt");
    f.fireStatus("SUBSCRIBED");
    expect(onStatus).toHaveBeenCalledWith("SUBSCRIBED");
  });

  it("returns an unsubscribe that tears the channel down", () => {
    const f = fakeClient();
    const teardown = subscribePlayoffs(f.client, {}, "jwt");
    teardown();
    expect(f.calls).toContain("removeChannel");
  });
});
