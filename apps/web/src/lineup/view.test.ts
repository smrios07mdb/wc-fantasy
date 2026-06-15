import { describe, it, expect } from "vitest";
import type { Position } from "@app/shared";
import { formatInLeagueTz } from "@app/shared";
import {
  buildPitch,
  evaluateProposal,
  isMovable,
  canSwap,
  swapStarters,
  defaultStarterIds,
  kickoffByTeam,
  resolveKickoffByPlayer,
  resolveOpponentByPlayer,
  resolveStarterStatusByPlayer,
} from "./view";
import type { LineupPlayer, PeriodLineup } from "./types";

const NOW = new Date("2026-06-12T10:00:00.000Z");

function player(id: string, position: Position): LineupPlayer {
  return {
    id,
    displayName: id.toUpperCase(),
    firstName: null,
    lastName: id,
    position,
    country: null,
  };
}

const SQUAD: LineupPlayer[] = [
  player("gk1", "GK"),
  player("gk2", "GK"),
  player("d1", "DEF"),
  player("d2", "DEF"),
  player("d3", "DEF"),
  player("d4", "DEF"),
  player("d5", "DEF"),
  player("m1", "MID"),
  player("m2", "MID"),
  player("m3", "MID"),
  player("m4", "MID"),
  player("m5", "MID"),
  player("f1", "FWD"),
  player("f2", "FWD"),
  player("f3", "FWD"),
];

const XI = ["gk1", "d1", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f2"];

function period(over: Partial<PeriodLineup> = {}): PeriodLineup {
  return {
    periodId: "md1",
    label: "MD1",
    kind: "group_md",
    status: "open",
    closesAt: "2026-06-12T18:00:00.000Z",
    starterIds: XI,
    locks: [],
    slotMeta: {},
    kickoffByPlayer: {},
    opponentByPlayer: {},
    ...over,
  };
}

describe("buildPitch — renders XI + bench from authoritative state", () => {
  it("groups the 11 starters by position and lists the 4 bench", () => {
    const view = buildPitch(SQUAD, period());
    expect(view.lanes.GK.map((s) => s.player.id)).toEqual(["gk1"]);
    expect(view.lanes.DEF).toHaveLength(4);
    expect(view.lanes.MID).toHaveLength(4);
    expect(view.lanes.FWD).toHaveLength(2);
    expect(view.bench.map((s) => s.player.id).sort()).toEqual(["d5", "f3", "gk2", "m5"]);
    expect(view.formationLabel).toBe("4-4-2");
  });

  it("marks locked players non-movable (non-draggable) and movable ones movable", () => {
    const view = buildPitch(SQUAD, period({ locks: [{ playerId: "d1", isStarter: true }] }));
    const d1 = view.lanes.DEF.find((s) => s.player.id === "d1");
    const d2 = view.lanes.DEF.find((s) => s.player.id === "d2");
    expect(d1?.movable).toBe(false);
    expect(d2?.movable).toBe(true);
  });
});

describe("kickoffByTeam — per-team kickoff within a period's fixtures", () => {
  it("maps each team to its match kickoff, EARLIEST when a team plays more than once", () => {
    const map = kickoffByTeam([
      { homeTeamId: "ESP", awayTeamId: "FRA", kickoffAt: "2026-06-14T18:00:00.000Z" },
      { homeTeamId: "BRA", awayTeamId: "ESP", kickoffAt: "2026-06-13T15:00:00.000Z" },
    ]);
    expect(map.get("FRA")).toBe("2026-06-14T18:00:00.000Z");
    expect(map.get("BRA")).toBe("2026-06-13T15:00:00.000Z");
    // Spain plays twice — the earlier kickoff wins (the relevant lock deadline)
    expect(map.get("ESP")).toBe("2026-06-13T15:00:00.000Z");
  });

  it("ignores null team ids (e.g. a knockout fixture with TBD sides)", () => {
    const map = kickoffByTeam([
      { homeTeamId: null, awayTeamId: null, kickoffAt: "2026-07-01T18:00:00.000Z" },
    ]);
    expect(map.size).toBe(0);
  });
});

describe("resolveKickoffByPlayer — each squad player's fixture kickoff this period", () => {
  const matches = [{ homeTeamId: "ESP", awayTeamId: "FRA", kickoffAt: "2026-06-14T18:00:00.000Z" }];

  it("resolves a player to his team's kickoff; a TBD/unlinked team resolves to null", () => {
    const out = resolveKickoffByPlayer(
      [
        { id: "p-es", teamId: "ESP" },
        { id: "p-fr", teamId: "FRA" },
        { id: "p-de", teamId: "GER" }, // not playing this period
        { id: "p-x", teamId: null }, // no team linked
      ],
      matches,
    );
    expect(out["p-es"]).toBe("2026-06-14T18:00:00.000Z");
    expect(out["p-fr"]).toBe("2026-06-14T18:00:00.000Z");
    expect(out["p-de"]).toBeNull(); // resolve-miss → "TBD"/"—", never a crash
    expect(out["p-x"]).toBeNull();
  });

  it("the resolved kickoff formats as the league-local wall clock in a non-UTC tz", () => {
    const out = resolveKickoffByPlayer([{ id: "p-es", teamId: "ESP" }], matches);
    // 18:00Z on Jun 14 → 2:00 PM EDT in America/New_York (UTC−4), with the zone abbreviation
    const shown = formatInLeagueTz(new Date(out["p-es"]!), "America/New_York");
    expect(shown).toContain("2:00 PM");
    expect(shown).toContain("EDT");
    expect(shown).toContain("Jun");
    expect(shown).toContain("14");
  });
});

describe("isMovable — the lock projection the UI uses to forbid dragging", () => {
  it("a locked player is not movable; an unlocked one is", () => {
    const p = period({ locks: [{ playerId: "gk1", isStarter: true }] });
    expect(isMovable(p, "gk1")).toBe(false);
    expect(isMovable(p, "d1")).toBe(true);
  });
});

describe("evaluateProposal — live legality feedback (drives save-disabled + reason)", () => {
  it("a legal XI can be saved", () => {
    const res = evaluateProposal(SQUAD, period(), XI, NOW);
    expect(res.ok).toBe(true);
  });

  it("an illegal formation disables save and explains why", () => {
    const bad = ["gk1", "d1", "d2", "m1", "m2", "m3", "m4", "m5", "f1", "f2", "f3"]; // 2 DEF
    const res = evaluateProposal(SQUAD, period(), bad, NOW);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error.code).toBe("illegal-formation");
    expect(res.error.message).toMatch(/DEF/);
  });

  it("benching a played (locked) player disables save (the C1 client still blocks it — needs a forfeit confirm)", () => {
    const p = period({ locks: [{ playerId: "d1", isStarter: true }] });
    const benchD1 = ["gk1", "d5", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f2"];
    const res = evaluateProposal(SQUAD, p, benchD1, NOW);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    // C1 sends no forfeit confirm → benching a played starter is rejected (save stays disabled), exactly
    // as before; only the reason code is now the forfeit-model one. C2 adds the destructive-confirm path.
    expect(res.error.code).toBe("forfeit-requires-confirm");
  });
});

describe("swap helpers — start↔bench swaps drive formation changes + live legality", () => {
  it("allows a same-position start↔bench swap (m4 starter ↔ m5 bench)", () => {
    expect(canSwap(period(), SQUAD, XI, "m4", "m5")).toBe(true);
  });

  it("allows a CROSS-position outfield swap so the formation can change (4-4-2 → 3-4-3)", () => {
    expect(canSwap(period(), SQUAD, XI, "m4", "f3")).toBe(true); // MID starter ↔ FWD bench
  });

  it("keeps GK on its own side: a keeper may not swap with an outfielder", () => {
    expect(canSwap(period(), SQUAD, XI, "d1", "gk2")).toBe(false); // DEF starter ↔ GK bench
  });

  it("allows the two keepers to swap (GK↔GK)", () => {
    expect(canSwap(period(), SQUAD, XI, "gk1", "gk2")).toBe(true);
  });

  it("rejects a no-op swap of two starters, or of two bench players", () => {
    expect(canSwap(period(), SQUAD, XI, "m4", "m1")).toBe(false); // both starters
    expect(canSwap(period(), SQUAD, XI, "m5", "f3")).toBe(false); // both bench
  });

  it("rejects a swap touching a locked player", () => {
    const p = period({ locks: [{ playerId: "m4", isStarter: true }] });
    expect(canSwap(p, SQUAD, XI, "m4", "m5")).toBe(false);
  });

  it("swapStarters replaces the outgoing starter with the incoming bench player", () => {
    const next = swapStarters(XI, "m4", "m5");
    expect(next).toContain("m5");
    expect(next).not.toContain("m4");
    expect(next).toHaveLength(11);
  });
});

describe("defaultStarterIds — the canonical 4-3-3 when no lineup is saved yet (4+ DEF squad)", () => {
  it("picks 1 GK + 4 DEF + 3 MID + 3 FWD and is a legal XI", () => {
    const xi = defaultStarterIds(SQUAD);
    expect(xi).toHaveLength(11);
    // The canonical group default is 4-3-3 (design modeConf def), surfaced now that the default is
    // formation-aware — a squad that can field it gets it, unfillable shapes fall through.
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const id of xi) counts[SQUAD.find((p) => p.id === id)!.position] += 1;
    expect(counts).toEqual({ GK: 1, DEF: 4, MID: 3, FWD: 3 });
    const res = evaluateProposal(SQUAD, period({ starterIds: xi }), xi, NOW);
    expect(res.ok).toBe(true);
  });
});

describe("resolveOpponentByPlayer — P53 opponent fixture per squad player", () => {
  const matches = [
    {
      homeTeamId: "ESP",
      awayTeamId: "FRA",
      kickoffAt: "2026-06-14T18:00:00.000Z",
      homeTeamName: "Spain",
      awayTeamName: "France",
    },
  ];

  it("home player → away team as opponent with isHome true", () => {
    const out = resolveOpponentByPlayer([{ id: "p-es", teamId: "ESP" }], matches);
    expect(out["p-es"]).toEqual({ opponentName: "France", opponentNation: "France", isHome: true });
  });

  it("away player → home team as opponent with isHome false", () => {
    const out = resolveOpponentByPlayer([{ id: "p-fr", teamId: "FRA" }], matches);
    expect(out["p-fr"]).toEqual({ opponentName: "Spain", opponentNation: "Spain", isHome: false });
  });

  it("player whose team has no fixture this period → null (resolve-miss)", () => {
    const out = resolveOpponentByPlayer(
      [
        { id: "p-de", teamId: "GER" }, // not playing this period
        { id: "p-x", teamId: null }, // no team linked
      ],
      matches,
    );
    expect(out["p-de"]).toBeNull();
    expect(out["p-x"]).toBeNull();
  });

  it("TBD knockout fixture (null teamId side) → null for both players", () => {
    const tbd = [{ homeTeamId: null, awayTeamId: null, kickoffAt: "2026-07-01T18:00:00.000Z" }];
    const out = resolveOpponentByPlayer([{ id: "p-x", teamId: "ESP" }], tbd);
    expect(out["p-x"]).toBeNull();
  });
});

describe("resolveStarterStatusByPlayer — pre-kickoff availability badge per squad player", () => {
  // A peeked fixture: ESP vs FRA, lineup announced — p1 starts, p2 benched (an is_starter:false row).
  const peeked = [
    {
      homeTeamId: "ESP",
      awayTeamId: "FRA",
      kickoffAt: "2026-06-14T18:00:00.000Z",
      starterByPlayer: { p1: true, p2: false },
    },
  ];

  it("starting — the match has entries and the player is a starter", () => {
    expect(resolveStarterStatusByPlayer([{ id: "p1", teamId: "ESP" }], peeked)["p1"]).toBe(
      "starting",
    );
  });

  it("not_starting — via an is_starter:false row", () => {
    expect(resolveStarterStatusByPlayer([{ id: "p2", teamId: "ESP" }], peeked)["p2"]).toBe(
      "not_starting",
    );
  });

  it("not_starting — via a player ABSENT from a populated match (XI-only feed)", () => {
    // p3 plays for FRA (a participant in the peeked match) but isn't in the snapshot → not in the XI.
    expect(resolveStarterStatusByPlayer([{ id: "p3", teamId: "FRA" }], peeked)["p3"]).toBe(
      "not_starting",
    );
  });

  it("null (no badge) — the match has NO entries yet, or an empty snapshot (lineup not announced)", () => {
    const notPeeked = [
      { homeTeamId: "ESP", awayTeamId: "FRA", kickoffAt: "2026-06-14T18:00:00.000Z" },
    ];
    expect(resolveStarterStatusByPlayer([{ id: "p1", teamId: "ESP" }], notPeeked)["p1"]).toBeNull();
    const empty = [
      {
        homeTeamId: "ESP",
        awayTeamId: "FRA",
        kickoffAt: "2026-06-14T18:00:00.000Z",
        starterByPlayer: {},
      },
    ];
    expect(resolveStarterStatusByPlayer([{ id: "p1", teamId: "ESP" }], empty)["p1"]).toBeNull();
  });

  it("null — the player's team has no fixture this period (or no linked team)", () => {
    expect(resolveStarterStatusByPlayer([{ id: "p1", teamId: "GER" }], peeked)["p1"]).toBeNull();
    expect(resolveStarterStatusByPlayer([{ id: "p1", teamId: null }], peeked)["p1"]).toBeNull();
  });

  it("references the SAME fifa_match row as kickoff & opponent (earliest-kickoff tie-break)", () => {
    // ESP plays TWICE this period; the EARLIER fixture is the binding lock/sub deadline AND the one
    // kickoff/opponent resolve to — starter-status must read that SAME (earlier) fixture's snapshot.
    const two = [
      {
        homeTeamId: "ESP",
        awayTeamId: "FRA",
        kickoffAt: "2026-06-14T15:00:00.000Z", // EARLIER
        homeTeamName: "Spain",
        awayTeamName: "France",
        starterByPlayer: { p1: true }, // started the early game
      },
      {
        homeTeamId: "ESP",
        awayTeamId: "ITA",
        kickoffAt: "2026-06-14T21:00:00.000Z", // later
        homeTeamName: "Spain",
        awayTeamName: "Italy",
        starterByPlayer: { p1: false }, // would be benched in the late game
      },
    ];
    const squad = [{ id: "p1", teamId: "ESP" }];
    // kickoff + opponent both resolve to the EARLY fixture …
    expect(resolveKickoffByPlayer(squad, two)["p1"]).toBe("2026-06-14T15:00:00.000Z");
    expect(resolveOpponentByPlayer(squad, two)["p1"]?.opponentName).toBe("France");
    // … so starter-status MUST too: "starting" (early fixture), NOT "not_starting" (the late one).
    expect(resolveStarterStatusByPlayer(squad, two)["p1"]).toBe("starting");
  });
});
