import { describe, it, expect } from "vitest";
import { MemoryScrapeStore } from "./memoryStore";

describe("MemoryScrapeStore.writeScrapeRating", () => {
  it("upserts the scrape rating and marks (match,player) dirty (idempotent re-scrape)", async () => {
    const store = new MemoryScrapeStore();
    await store.writeScrapeRating("m1", "p1", 7.4);
    await store.writeScrapeRating("m1", "p1", 7.9); // re-scrape overwrites
    expect(store.scrapeRating("m1", "p1")).toBe(7.9);
    expect(store.isDirty("m1", "p1")).toBe(true);
  });

  it("re-dirties WITHOUT clobbering an existing stat row (mirror the 05a guard, scraper write path)", async () => {
    const store = new MemoryScrapeStore();
    store.seedStat("m1", "p1", { minutesPlayed: 90, goals: 1 });
    store.clearDirty("m1", "p1");
    await store.writeScrapeRating("m1", "p1", 7.4);
    expect(store.stat("m1", "p1")).toMatchObject({ minutesPlayed: 90, goals: 1 }); // stats preserved
    expect(store.isDirty("m1", "p1")).toBe(true);
  });
});
