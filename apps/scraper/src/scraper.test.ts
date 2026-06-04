import { describe, it, expect } from "vitest";
import { runScrapeTick } from "./scraper";
import { MemoryScrapeStore, type BrowserTransport, type ScrapeCandidate } from "@app/scrape";

const page = (players: Array<{ id: number; rating: number | null }>) =>
  `<script id="__SOFA_DATA__" type="application/json">${JSON.stringify({ players })}</script>`;
const T = (iso: string) => new Date(iso).getTime();

function cand(over: Partial<ScrapeCandidate>): ScrapeCandidate {
  return {
    matchId: "m1",
    playerId: "p1",
    sofascoreMatchId: 50,
    sofascorePlayerId: 1001,
    status: "completed",
    kickoffMs: T("2026-06-10T18:00:00Z"),
    hasScrapeRating: false,
    ...over,
  };
}

describe("runScrapeTick", () => {
  const now = new Date("2026-06-10T22:00:00Z");

  it("scrapes + writes the rating for each targeted player, marking dirty", async () => {
    const store = new MemoryScrapeStore();
    store.seedCandidate(cand({}));
    const transport: BrowserTransport = {
      fetchMatchHtml: () => Promise.resolve(page([{ id: 1001, rating: 7.4 }])),
      close: () => Promise.resolve(),
    };
    await runScrapeTick(transport, store, now, 0);
    expect(store.scrapeRating("m1", "p1")).toBe(7.4);
    expect(store.isDirty("m1", "p1")).toBe(true);
  });

  it("writes NO row when the rating is absent (→ resolver falls back)", async () => {
    const store = new MemoryScrapeStore();
    store.seedCandidate(cand({}));
    const transport: BrowserTransport = {
      fetchMatchHtml: () => Promise.resolve(page([])), // player not rated
      close: () => Promise.resolve(),
    };
    await runScrapeTick(transport, store, now, 0);
    expect(store.scrapeRating("m1", "p1")).toBeUndefined();
  });

  it("ISOLATION: a fetch that throws on one match does NOT propagate or block another match's write", async () => {
    const store = new MemoryScrapeStore();
    store.seedCandidate(cand({ sofascoreMatchId: 50, matchId: "bad", playerId: "pbad" }));
    store.seedCandidate(
      cand({ sofascoreMatchId: 51, matchId: "good", playerId: "pgood", sofascorePlayerId: 2002 }),
    );
    const transport: BrowserTransport = {
      fetchMatchHtml: (id) =>
        id === 50
          ? Promise.reject(new Error("blocked"))
          : Promise.resolve(page([{ id: 2002, rating: 6.6 }])),
      close: () => Promise.resolve(),
    };
    await expect(runScrapeTick(transport, store, now, 0)).resolves.toBeUndefined(); // never throws
    expect(store.scrapeRating("bad", "pbad")).toBeUndefined(); // the blocked match left no row
    expect(store.scrapeRating("good", "pgood")).toBe(6.6); // the other match still wrote
  });
});
