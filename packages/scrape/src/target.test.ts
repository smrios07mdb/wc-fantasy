import { describe, it, expect } from "vitest";
import { selectScrapeTargets, type ScrapeCandidate } from "./target";

const T = (iso: string) => new Date(iso).getTime();
const base = {
  sofascoreMatchId: 50,
  sofascorePlayerId: 1001,
  status: "completed",
  hasScrapeRating: false,
};

describe("selectScrapeTargets", () => {
  const now = new Date("2026-06-10T22:00:00Z");

  it("targets FT players lacking a scrape row, grouped by sofascore match", () => {
    const cands: ScrapeCandidate[] = [
      { ...base, matchId: "m1", playerId: "p1", kickoffMs: T("2026-06-10T18:00:00Z") },
      {
        ...base,
        matchId: "m1",
        playerId: "p2",
        sofascorePlayerId: 1002,
        kickoffMs: T("2026-06-10T18:00:00Z"),
      },
    ];
    expect(selectScrapeTargets(cands, now)).toEqual([
      {
        sofascoreMatchId: 50,
        players: [
          { matchId: "m1", playerId: "p1", sofascorePlayerId: 1001 },
          { matchId: "m1", playerId: "p2", sofascorePlayerId: 1002 },
        ],
      },
    ]);
  });

  it("skips players already scraped and matches not yet FT", () => {
    const cands: ScrapeCandidate[] = [
      {
        ...base,
        matchId: "m1",
        playerId: "p1",
        hasScrapeRating: true,
        kickoffMs: T("2026-06-10T18:00:00Z"),
      },
      {
        ...base,
        matchId: "m2",
        playerId: "p3",
        status: "in_progress",
        kickoffMs: T("2026-06-10T21:00:00Z"),
      },
    ];
    expect(selectScrapeTargets(cands, now)).toEqual([]);
  });

  it("skips matches that are stale (too long past kickoff)", () => {
    const cands: ScrapeCandidate[] = [
      { ...base, matchId: "m1", playerId: "p1", kickoffMs: T("2026-06-08T18:00:00Z") }, // >24h ago
    ];
    expect(selectScrapeTargets(cands, now)).toEqual([]);
  });
});
