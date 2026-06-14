import { describe, it, expect } from "vitest";
import { createBalldontlieClient, type FeedClient } from "./index";
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
              player_in: { id: 99 },
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
    const firstUrl = decodeURIComponent(urls[0] ?? "");
    expect(firstUrl).toContain("match_ids[]=7"); // server-side array scope
    expect(firstUrl).not.toContain("match_id="); // the ignored scalar is gone
    expect(urls[1]).toContain("cursor=2");
  });

  // Every PAGINATED match-scoped helper must scope server-side with the bracketed `match_ids[]` array — the
  // ONLY match filter the GOAT FIFA paginated endpoints honour. The scalar `match_id` is silently ignored on
  // them (valid only on /odds/player_props), which previously forced a full-tournament scan per peek.
  const matchScopedCalls: ReadonlyArray<
    [endpoint: string, call: (c: FeedClient) => Promise<unknown>]
  > = [
    ["match_lineups", (c) => c.matchLineups({ matchId: 7 })],
    ["match_events", (c) => c.matchEvents({ matchId: 7 })],
    ["player_match_stats", (c) => c.playerMatchStats({ matchId: 7 })],
    ["team_match_stats", (c) => c.teamMatchStats({ matchId: 7 })],
    ["match_shots", (c) => c.matchShots({ matchId: 7 })],
  ];
  for (const [endpoint, call] of matchScopedCalls) {
    it(`${endpoint}: scopes via match_ids[] (not a bare match_id) at per_page=100`, async () => {
      let seenUrl = "";
      const transport: FetchLike = (url) => {
        seenUrl = url;
        return Promise.resolve(json({ data: [], meta: {} }));
      };
      const client = createBalldontlieClient({ apiKey: "k", transport, requestsPerMinute: 600 });
      await call(client);
      const q = decodeURIComponent(seenUrl);
      expect(seenUrl).toContain(`/fifa/worldcup/v1/${endpoint}`);
      expect(q).toContain("match_ids[]=7"); // the bracket form (NOT `match_ids=7`, NOT `match_ids[0]=7`)
      expect(q).not.toContain("match_id="); // scalar `match_id` is ignored by these endpoints → must be gone
      expect(q).toContain("per_page=100"); // one fixture resolves in a single page
    });
  }

  it("drops cross-fixture rows the server may still return (belt-and-suspenders client filter)", async () => {
    // Even with `match_ids[]` scoping the wire is re-filtered on match_id, so a contaminated firehose
    // response can never reach ingest (defence in depth after the 2026-06-12 cross-match lock leak).
    const transport: FetchLike = () =>
      Promise.resolve(
        json({
          data: [
            { id: 1, match_id: 7, incident_type: "goal" },
            { id: 2, match_id: 999, incident_type: "goal" }, // foreign fixture — must be dropped
          ],
          meta: {},
        }),
      );
    const client = createBalldontlieClient({ apiKey: "k", transport, requestsPerMinute: 600 });
    const res = await client.matchEvents({ matchId: 7 });
    expect(res.data.map((e) => e.match_id)).toEqual([7]);
  });

  it("rosters still emits team_ids[] / player_ids[] (array scoping unchanged)", async () => {
    let seenUrl = "";
    const transport: FetchLike = (url) => {
      seenUrl = url;
      return Promise.resolve(json({ data: [], meta: {} }));
    };
    const client = createBalldontlieClient({ apiKey: "k", transport, requestsPerMinute: 600 });
    await client.rosters({ teamIds: [3, 5], playerIds: [9] });
    const q = decodeURIComponent(seenUrl);
    expect(q).toContain("team_ids[]=3");
    expect(q).toContain("team_ids[]=5");
    expect(q).toContain("player_ids[]=9");
    expect(q).toContain("seasons[]=2026"); // default season still applied
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

  it("scopes player props to a match and parses the milestone market", async () => {
    let seenUrl = "";
    const transport: FetchLike = (url) => {
      seenUrl = url;
      return Promise.resolve(
        json({
          data: [
            {
              id: 1,
              match_id: 42,
              player_id: 7,
              vendor: "draftkings",
              prop_type: "anytime_goal",
              line_value: "1",
              market: { type: "milestone", odds: -110 },
            },
          ],
          meta: {},
        }),
      );
    };
    const client = createBalldontlieClient({ apiKey: "k", transport, requestsPerMinute: 600 });
    const res = await client.playerProps({ matchId: 42 });
    expect(seenUrl).toContain("/fifa/worldcup/v1/odds/player_props");
    expect(seenUrl).toContain("match_id=42");
    expect(res.data[0]?.market).toMatchObject({ type: "milestone", odds: -110 });
  });

  it("requests futures for the default 2026 season", async () => {
    let seenUrl = "";
    const transport: FetchLike = (url) => {
      seenUrl = url;
      return Promise.resolve(
        json({
          data: [
            {
              id: 9,
              market_type: "tournament_winner",
              subject: { id: 3 },
              vendor: "fanduel",
              american_odds: 450,
            },
          ],
          meta: {},
        }),
      );
    };
    const client = createBalldontlieClient({ apiKey: "k", transport, requestsPerMinute: 600 });
    const res = await client.futures();
    expect(seenUrl).toContain("/fifa/worldcup/v1/odds/futures");
    expect(seenUrl).toContain("seasons%5B%5D=2026");
    expect(res.data[0]).toMatchObject({ market_type: "tournament_winner", american_odds: 450 });
    expect(res.data).toHaveLength(1);
  });
});
