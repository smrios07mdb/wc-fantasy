import { describe, it, expect } from "vitest";
import { createBalldontlieClient } from "./index";
import type { FetchLike } from "./http";

const json = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

describe("createBalldontlieClient", () => {
  it("parses match_events and follows the cursor across pages", async () => {
    const urls: string[] = [];
    const transport: FetchLike = (url) => {
      urls.push(url);
      if (url.includes("cursor=2")) {
        return Promise.resolve(
          json({ data: [{ id: 20, match_id: 7, incident_type: "goal" }], meta: {} }),
        );
      }
      return Promise.resolve(
        json({
          data: [
            {
              id: 10,
              match_id: 7,
              incident_type: "substitution",
              player_in_id: 99,
              time_minute: 61,
            },
          ],
          meta: { next_cursor: 2 },
        }),
      );
    };
    const client = createBalldontlieClient({ apiKey: "k", transport, requestsPerMinute: 600 });
    const res = await client.matchEvents({ matchId: 7 });

    expect(res.data.map((e) => e.id)).toEqual([10, 20]); // both pages, in order
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("match_events");
    expect(urls[0]).toContain("match_id=7");
    expect(urls[1]).toContain("cursor=2");
  });

  it("sends the API key as the Authorization header", async () => {
    let seenAuth: string | undefined;
    const transport: FetchLike = (_url, init) => {
      seenAuth = init?.headers?.["Authorization"];
      return Promise.resolve(json({ data: [], meta: {} }));
    };
    const client = createBalldontlieClient({ apiKey: "secret", transport, requestsPerMinute: 600 });
    await client.matches();
    expect(seenAuth).toBe("secret");
  });

  it("targets the FIFA World Cup GOAT base path (api.balldontlie.io/fifa/worldcup/v1)", async () => {
    // Confirmed against the official OpenAPI spec + docs: the WC endpoints live under /fifa/worldcup/v1,
    // NOT /fifa/v1. A wrong prefix 404s every request and silently breaks schedule-sync.
    let seenUrl = "";
    const transport: FetchLike = (url) => {
      seenUrl = url;
      return Promise.resolve(json({ data: [], meta: {} }));
    };
    const client = createBalldontlieClient({ apiKey: "k", transport, requestsPerMinute: 600 });
    await client.matches();
    expect(seenUrl).toContain("https://api.balldontlie.io/fifa/worldcup/v1/matches");
  });

  it("does not send a match_id query for the unscoped matches endpoint", async () => {
    let seenUrl = "";
    const transport: FetchLike = (url) => {
      seenUrl = url;
      return Promise.resolve(json({ data: [], meta: {} }));
    };
    const client = createBalldontlieClient({ apiKey: "k", transport, requestsPerMinute: 600 });
    await client.matches({ seasons: [2026] });
    expect(seenUrl).not.toContain("matchId");
    expect(seenUrl).toContain("seasons");
  });

  it("throws BalldontlieHttpError on a non-ok response", async () => {
    const transport: FetchLike = () =>
      Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) });
    const client = createBalldontlieClient({ apiKey: "k", transport, requestsPerMinute: 600 });
    await expect(client.matches()).rejects.toThrow(/HTTP 429/);
  });
});
