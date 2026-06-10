import { describe, it, expect } from "vitest";
import { buildPushPayload, buildTestPayload } from "./payload";

describe("buildPushPayload — pure kind → notification payload", () => {
  it("draft_turn → points at /draft with a stable collapse tag", () => {
    const p = buildPushPayload({ kind: "draft_turn" });
    expect(p.url).toBe("/draft");
    expect(p.tag).toBe("draft_turn");
    expect(p.title.length).toBeGreaterThan(0);
    expect(p.body.length).toBeGreaterThan(0);
  });

  it("player_not_starting → names the player, links /lineup, tags per-player", () => {
    const p = buildPushPayload({
      kind: "player_not_starting",
      playerId: "plr-42",
      playerName: "Bukayo Saka",
    });
    expect(p.url).toBe("/lineup");
    expect(p.body).toContain("Bukayo Saka");
    expect(p.tag).toBe("player_not_starting:plr-42");
  });

  it("match_starting → labels the fixture, links /vsfield, tags per-match", () => {
    const p = buildPushPayload({
      kind: "match_starting",
      matchId: "mtch-7",
      matchLabel: "England vs USA",
    });
    expect(p.url).toBe("/vsfield");
    expect(p.body).toContain("England vs USA");
    expect(p.tag).toBe("match_starting:mtch-7");
  });

  it("payloads are JSON-serializable (the SW receives them over the wire)", () => {
    const p = buildPushPayload({ kind: "draft_turn" });
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });
});

describe("buildTestPayload — the /test transport probe", () => {
  it("returns a self-evident success payload pointing back at /settings", () => {
    const p = buildTestPayload();
    expect(p.url).toBe("/settings");
    expect(p.tag).toBe("test");
    expect(p.title.length).toBeGreaterThan(0);
    expect(p.body.length).toBeGreaterThan(0);
  });
});
