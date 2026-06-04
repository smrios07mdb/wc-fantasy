import { describe, it, expect } from "vitest";
import { normalizeName, proposeMatchMappings, proposePlayerMappings } from "./keyMatch";

describe("normalizeName", () => {
  it("lowercases, strips accents + non-letters", () => {
    expect(normalizeName("José Mourinho-Félix")).toBe("josemourinhofelix");
  });
});

describe("proposeMatchMappings (date + team codes)", () => {
  it("auto-accepts a unique date+codes match; flags one with no candidate", () => {
    const feed = [
      { fifaMatchId: "m1", dateIso: "2026-06-10", homeCode: "BRA", awayCode: "ARG" },
      { fifaMatchId: "m2", dateIso: "2026-06-11", homeCode: "ENG", awayCode: "FRA" },
    ];
    const sofa = [
      { sofascoreMatchId: 50, dateIso: "2026-06-10", homeCode: "BRA", awayCode: "ARG" },
    ];
    const out = proposeMatchMappings(feed, sofa);
    expect(out.proposals).toEqual([{ fifaMatchId: "m1", sofascoreMatchId: 50 }]);
    expect(out.flagged.map((f) => f.fifaMatchId)).toEqual(["m2"]);
  });

  it("FLAGS (never auto-writes) an ambiguous date+codes match", () => {
    const feed = [{ fifaMatchId: "m1", dateIso: "2026-06-10", homeCode: "BRA", awayCode: "ARG" }];
    const sofa = [
      { sofascoreMatchId: 50, dateIso: "2026-06-10", homeCode: "BRA", awayCode: "ARG" },
      { sofascoreMatchId: 51, dateIso: "2026-06-10", homeCode: "BRA", awayCode: "ARG" },
    ];
    const out = proposeMatchMappings(feed, sofa);
    expect(out.proposals).toEqual([]);
    expect(out.flagged.map((f) => f.fifaMatchId)).toEqual(["m1"]);
  });
});

describe("proposePlayerMappings (team + normalized name)", () => {
  const sofa = [
    { sofascorePlayerId: 1001, teamCode: "BRA", name: "Vinícius Júnior" },
    { sofascorePlayerId: 1002, teamCode: "BRA", name: "Vinícius Tobias" },
  ];
  it("auto-writes a unique exact normalized match", () => {
    const out = proposePlayerMappings(
      [{ playerId: "p1", teamCode: "BRA", name: "Vinicius Junior" }],
      sofa,
    );
    expect(out.proposals).toEqual([{ playerId: "p1", sofascorePlayerId: 1001 }]);
    expect(out.flagged).toEqual([]);
  });
  it("FLAGS (never auto-writes) when there's no exact hit", () => {
    const out = proposePlayerMappings(
      [{ playerId: "p9", teamCode: "BRA", name: "Vinicius" }],
      sofa,
    );
    expect(out.proposals).toEqual([]);
    expect(out.flagged.map((f) => f.playerId)).toEqual(["p9"]);
  });
});
