import { describe, it, expect, vi } from "vitest";
import {
  scoreManagerPeriodBinding,
  standingBinding,
  subscribeVsField,
  vsFieldChannelName,
  type PostgresChangeBinding,
  type RealtimeChannelLike,
  type RealtimeClientLike,
} from "./realtime";

function mockChannel() {
  const bindings: { binding: PostgresChangeBinding; cb: (p: unknown) => void }[] = [];
  let subscribeCb: ((status: string) => void) | undefined;
  const channel = {
    bindings,
    on(_type: "postgres_changes", binding: PostgresChangeBinding, cb: (p: unknown) => void) {
      bindings.push({ binding, cb });
      return channel as unknown as RealtimeChannelLike;
    },
    subscribe(cb?: (status: string) => void) {
      subscribeCb = cb;
      return channel as unknown as RealtimeChannelLike;
    },
    fire(table: string) {
      for (const b of bindings) if (b.binding.table === table) b.cb({ new: { id: "x" } });
    },
    fireStatus(status: string) {
      subscribeCb?.(status);
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

const TOKEN = "user-jwt";

describe("vs-the-field Realtime descriptors", () => {
  it("targets score_manager_period by period and standing by league", () => {
    expect(vsFieldChannelName("lg1")).toBe("vsfield:lg1");
    expect(scoreManagerPeriodBinding("md1")).toEqual({
      event: "*",
      schema: "public",
      table: "score_manager_period",
      filter: "period_id=eq.md1",
    });
    expect(standingBinding("lg1")).toEqual({
      event: "*",
      schema: "public",
      table: "standing",
      filter: "league_id=eq.lg1",
    });
  });
});

describe("subscribeVsField — JWT-authed postgres_changes (Prompt-08 pattern)", () => {
  it("calls realtime.setAuth(token) BEFORE subscribe (else postgres_changes are silently dropped)", () => {
    const channel = mockChannel();
    const client = mockClient(channel);
    const subSpy = vi.spyOn(channel, "subscribe");
    subscribeVsField(
      client as unknown as RealtimeClientLike,
      { leagueId: "lg1", currentPeriodId: "md1" },
      {},
      TOKEN,
    );
    expect(client.realtime.setAuth).toHaveBeenCalledWith(TOKEN);
    expect(client.realtime.setAuth.mock.invocationCallOrder[0]!).toBeLessThan(
      subSpy.mock.invocationCallOrder[0]!,
    );
    expect(client.channel).toHaveBeenCalledWith("vsfield:lg1");
  });

  it("binds both tables and nudges onChange when either fires", () => {
    const channel = mockChannel();
    const client = mockClient(channel);
    const onChange = vi.fn();
    subscribeVsField(
      client as unknown as RealtimeClientLike,
      { leagueId: "lg1", currentPeriodId: "md1" },
      { onChange },
      TOKEN,
    );
    expect(channel.bindings.map((b) => b.binding.table)).toEqual([
      "score_manager_period",
      "standing",
    ]);
    channel.fire("score_manager_period");
    channel.fire("standing");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("subscribes to standing only when there is no current period", () => {
    const channel = mockChannel();
    const client = mockClient(channel);
    subscribeVsField(
      client as unknown as RealtimeClientLike,
      { leagueId: "lg1", currentPeriodId: null },
      {},
      TOKEN,
    );
    expect(channel.bindings.map((b) => b.binding.table)).toEqual(["standing"]);
  });

  it("forwards channel status and tears the channel down on unsubscribe", () => {
    const channel = mockChannel();
    const client = mockClient(channel);
    const onStatus = vi.fn();
    const unsubscribe = subscribeVsField(
      client as unknown as RealtimeClientLike,
      { leagueId: "lg1", currentPeriodId: "md1" },
      { onStatus },
      TOKEN,
    );
    channel.fireStatus("SUBSCRIBED");
    expect(onStatus).toHaveBeenCalledWith("SUBSCRIBED");
    unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
  });
});
