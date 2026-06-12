import { describe, it, expect } from "vitest";
import type { Position } from "@app/shared";
import { validateLineup, type SquadPlayer, type SlotState, type PeriodWindow } from "./validate";

// ── Fixtures ──────────────────────────────────────────────────────────────────
// A legal 15-man squad: 2 GK / 5 DEF / 5 MID / 3 FWD (DECISIONS.md Theme B).
const SQUAD: SquadPlayer[] = [
  { playerId: "gk1", position: "GK" },
  { playerId: "gk2", position: "GK" },
  { playerId: "d1", position: "DEF" },
  { playerId: "d2", position: "DEF" },
  { playerId: "d3", position: "DEF" },
  { playerId: "d4", position: "DEF" },
  { playerId: "d5", position: "DEF" },
  { playerId: "m1", position: "MID" },
  { playerId: "m2", position: "MID" },
  { playerId: "m3", position: "MID" },
  { playerId: "m4", position: "MID" },
  { playerId: "m5", position: "MID" },
  { playerId: "f1", position: "FWD" },
  { playerId: "f2", position: "FWD" },
  { playerId: "f3", position: "FWD" },
];

const NOW = new Date("2026-06-12T10:00:00.000Z");

// An OPEN window, comfortably before its close.
const OPEN: PeriodWindow = {
  id: "md1",
  status: "open",
  closesAt: new Date("2026-06-12T18:00:00.000Z"),
};

// A legal 4-4-2: 1 GK + 4 DEF + 4 MID + 2 FWD = 11. Bench: gk2, d5, m5, f3.
const XI_442 = ["gk1", "d1", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f2"];

const NO_SLOTS: SlotState[] = [];

/** A squad player who has PLAYED (a score_player_match row exists), in his current persisted role. */
function played(playerId: string, isStarter: boolean, voided = false): SlotState {
  return { playerId, isStarter, hasPlayed: true, voided };
}

function ok(result: ReturnType<typeof validateLineup>): void {
  if (!result.ok)
    throw new Error(`expected ok, got error ${result.error.code}: ${result.error.message}`);
}
function code(result: ReturnType<typeof validateLineup>): string {
  if (result.ok) throw new Error("expected an error, got ok");
  return result.error.code;
}

describe("validateLineup — legal lineups", () => {
  it("accepts a legal 4-4-2 starting XI", () => {
    ok(validateLineup(SQUAD, XI_442, NO_SLOTS, OPEN, NOW));
  });

  it("accepts an alternate legal shape (3-5-2) — bounds are not hardcoded to one formation", () => {
    const xi352 = ["gk1", "d1", "d2", "d3", "m1", "m2", "m3", "m4", "m5", "f1", "f2"];
    ok(validateLineup(SQUAD, xi352, NO_SLOTS, OPEN, NOW));
  });

  it("accepts the boundary shape 5-3-2 (max DEF, min-ish MID)", () => {
    const xi532 = ["gk1", "d1", "d2", "d3", "d4", "d5", "m1", "m2", "m3", "f1", "f2"];
    ok(validateLineup(SQUAD, xi532, NO_SLOTS, OPEN, NOW));
  });

  it("accepts the boundary shape 3-4-3 (min DEF, max FWD)", () => {
    const xi343 = ["gk1", "d1", "d2", "d3", "m1", "m2", "m3", "m4", "f1", "f2", "f3"];
    ok(validateLineup(SQUAD, xi343, NO_SLOTS, OPEN, NOW));
  });
});

describe("validateLineup — formation bounds (illegal-formation)", () => {
  it("rejects too few DEF (2 DEF < min 3)", () => {
    // 1 GK + 2 DEF + 5 MID + 3 FWD = 11
    const xi = ["gk1", "d1", "d2", "m1", "m2", "m3", "m4", "m5", "f1", "f2", "f3"];
    expect(code(validateLineup(SQUAD, xi, NO_SLOTS, OPEN, NOW))).toBe("illegal-formation");
  });

  it("rejects 0 FWD (< min 1)", () => {
    // 1 GK + 5 DEF + 5 MID + 0 FWD = 11
    const xi = ["gk1", "d1", "d2", "d3", "d4", "d5", "m1", "m2", "m3", "m4", "m5"];
    expect(code(validateLineup(SQUAD, xi, NO_SLOTS, OPEN, NOW))).toBe("illegal-formation");
  });

  it("rejects 0 GK (< exactly 1)", () => {
    // 0 GK + 5 DEF + 5 MID + 1 FWD = 11
    const xi = ["d1", "d2", "d3", "d4", "d5", "m1", "m2", "m3", "m4", "m5", "f1"];
    expect(code(validateLineup(SQUAD, xi, NO_SLOTS, OPEN, NOW))).toBe("illegal-formation");
  });

  it("rejects 2 GK (> exactly 1)", () => {
    // 2 GK + 4 DEF + 3 MID + 2 FWD = 11
    const xi = ["gk1", "gk2", "d1", "d2", "d3", "d4", "m1", "m2", "m3", "f1", "f2"];
    expect(code(validateLineup(SQUAD, xi, NO_SLOTS, OPEN, NOW))).toBe("illegal-formation");
  });

  it("rejects too many MID (6 MID > max 5) — the MID over-bound branch, on a MID-heavy synthetic squad", () => {
    // A 2/5/5/3 squad can never reach MID<2 or MID>5 with exactly 11 (non-MID max = 1 GK + 5 DEF + 3 FWD
    // = 9, so MID is forced into [2,5]). Exercise the MID over-bound branch with a synthetic squad instead.
    const midHeavy: SquadPlayer[] = [
      { playerId: "gk1", position: "GK" },
      { playerId: "d1", position: "DEF" },
      { playerId: "d2", position: "DEF" },
      { playerId: "d3", position: "DEF" },
      { playerId: "m1", position: "MID" },
      { playerId: "m2", position: "MID" },
      { playerId: "m3", position: "MID" },
      { playerId: "m4", position: "MID" },
      { playerId: "m5", position: "MID" },
      { playerId: "m6", position: "MID" },
      { playerId: "f1", position: "FWD" },
    ];
    const xi = midHeavy.map((p) => p.playerId); // 1 GK + 3 DEF + 6 MID + 1 FWD = 11, MID 6 > max 5
    const r = validateLineup(midHeavy, xi, NO_SLOTS, OPEN, NOW);
    expect(code(r)).toBe("illegal-formation");
    if (!r.ok) expect(r.error).toMatchObject({ code: "illegal-formation", position: "MID" });
  });

  it("rejects 4 FWD even though FAAB now lets a squad hold >3 forwards (cap-lift regression)", () => {
    // The FAAB per-position cap is retired (Prompt 44 → @app/faab), so a squad CAN now roster >3 forwards
    // (impossible under the old 3-FWD cap). Lineup legality is a SEPARATE rule — FORMATION_BOUNDS, never
    // SQUAD_COMPOSITION — so a 4-FWD starting XI must STILL be rejected. This pins that the cap-lift did
    // not leak into matchday legality.
    const fiveFwdSquad: SquadPlayer[] = [
      { playerId: "gk1", position: "GK" },
      { playerId: "d1", position: "DEF" },
      { playerId: "d2", position: "DEF" },
      { playerId: "d3", position: "DEF" },
      { playerId: "m1", position: "MID" },
      { playerId: "m2", position: "MID" },
      { playerId: "m3", position: "MID" },
      { playerId: "f1", position: "FWD" },
      { playerId: "f2", position: "FWD" },
      { playerId: "f3", position: "FWD" },
      { playerId: "f4", position: "FWD" },
      { playerId: "f5", position: "FWD" }, // 5 forwards rostered — impossible under the old 3-FWD cap
    ];
    const xi = ["gk1", "d1", "d2", "d3", "m1", "m2", "m3", "f1", "f2", "f3", "f4"]; // 1-3-3-4 = 11, FWD 4 > max 3
    const r = validateLineup(fiveFwdSquad, xi, NO_SLOTS, OPEN, NOW);
    expect(code(r)).toBe("illegal-formation");
    if (!r.ok) expect(r.error).toMatchObject({ code: "illegal-formation", position: "FWD" });
  });
});

describe("validateLineup — XI size (incomplete-xi)", () => {
  it("rejects 10 selected (too few)", () => {
    expect(code(validateLineup(SQUAD, XI_442.slice(0, 10), NO_SLOTS, OPEN, NOW))).toBe(
      "incomplete-xi",
    );
  });

  it("rejects 12 selected (too many)", () => {
    expect(code(validateLineup(SQUAD, [...XI_442, "f3"], NO_SLOTS, OPEN, NOW))).toBe(
      "incomplete-xi",
    );
  });

  it("rejects a duplicate starter id (distinct < 11)", () => {
    const dup = ["gk1", "d1", "d1", "d2", "d3", "m1", "m2", "m3", "m4", "f1", "f2"];
    expect(code(validateLineup(SQUAD, dup, NO_SLOTS, OPEN, NOW))).toBe("incomplete-xi");
  });
});

describe("validateLineup — ownership (not-your-player)", () => {
  it("rejects a starter not in the squad", () => {
    const xi = [...XI_442.slice(0, 10), "ringer"];
    const r = validateLineup(SQUAD, xi, NO_SLOTS, OPEN, NOW);
    expect(code(r)).toBe("not-your-player");
  });
});

describe("validateLineup — play state (the forfeit model)", () => {
  it("rejects promoting a PLAYED bench player INTO the XI (hindsight block, played-player-started)", () => {
    // f3 played from the bench (a sub who entered); promoting him over f2 is hindsight upside — forbidden.
    const slots = [played("f3", /*isStarter*/ false)];
    const xi = ["gk1", "d1", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f3"]; // f3 started over f2
    expect(code(validateLineup(SQUAD, xi, slots, OPEN, NOW))).toBe("played-player-started");
  });

  it("rejects benching a PLAYED starter WITHOUT a forfeit confirmation (forfeit-requires-confirm)", () => {
    // d1 played as a starter; the proposal benches him (starts d5). No confirm → refuse one-way forfeit.
    const slots = [played("d1", /*isStarter*/ true)];
    const xi = ["gk1", "d5", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f2"]; // legal 4-4-2, d1 dropped
    expect(code(validateLineup(SQUAD, xi, slots, OPEN, NOW))).toBe("forfeit-requires-confirm");
  });

  it("ACCEPTS benching a played starter when the forfeit is explicitly confirmed", () => {
    const slots = [played("d1", /*isStarter*/ true)];
    const xi = ["gk1", "d5", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f2"];
    ok(validateLineup(SQUAD, xi, slots, OPEN, NOW, new Set(["d1"])));
  });

  it("rejects returning a VOIDED (forfeited) player to the XI, even WITH a confirm (one-way door)", () => {
    // d1 was forfeited earlier (voided, benched). He can never start again this period.
    const slots = [played("d1", /*isStarter*/ false, /*voided*/ true)];
    const xi = ["gk1", "d1", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f2"]; // d1 back in
    expect(code(validateLineup(SQUAD, xi, slots, OPEN, NOW, new Set(["d1"])))).toBe(
      "voided-player-started",
    );
  });

  it("accepts a played starter who STAYS a starter (no transition → no constraint)", () => {
    const slots = [played("gk1", /*isStarter*/ true)];
    ok(validateLineup(SQUAD, XI_442, slots, OPEN, NOW));
  });

  it("accepts a voided player who STAYS benched (the forfeit persists, no new constraint)", () => {
    const slots = [played("d5", /*isStarter*/ false, /*voided*/ true)]; // d5 already benched in XI_442
    ok(validateLineup(SQUAD, XI_442, slots, OPEN, NOW));
  });

  it("allows swapping two UNPLAYED players freely (has-played no longer blocks movement)", () => {
    // No played slots: swap m4 (starter) for m5 (bench) — still a legal 4-4-2.
    const xi = ["gk1", "d1", "d2", "d3", "d4", "m1", "m2", "m3", "m5", "f1", "f2"];
    ok(validateLineup(SQUAD, xi, NO_SLOTS, OPEN, NOW));
  });
});

describe("validateLineup — editing window (wrong-period)", () => {
  it("rejects editing a closed period", () => {
    const closed: PeriodWindow = { id: "md0", status: "closed", closesAt: null };
    expect(code(validateLineup(SQUAD, XI_442, NO_SLOTS, closed, NOW))).toBe("wrong-period");
  });

  it("rejects editing once now is past closesAt (window closed even if status lags)", () => {
    const past: PeriodWindow = {
      id: "md1",
      status: "open",
      closesAt: new Date("2026-06-12T09:00:00.000Z"), // before NOW
    };
    expect(code(validateLineup(SQUAD, XI_442, NO_SLOTS, past, NOW))).toBe("wrong-period");
  });

  it("accepts pre-setting a future (pending) window", () => {
    const future: PeriodWindow = {
      id: "md3",
      status: "pending",
      closesAt: new Date("2026-06-20T18:00:00.000Z"),
    };
    ok(validateLineup(SQUAD, XI_442, NO_SLOTS, future, NOW));
  });
});

describe("validateLineup — precedence", () => {
  it("checks the window first: a closed period beats a formation error", () => {
    const closed: PeriodWindow = { id: "md0", status: "closed", closesAt: null };
    const illegalShape = ["gk1", "d1", "d2", "m1", "m2", "m3", "m4", "m5", "f1", "f2", "f3"]; // 2 DEF
    expect(code(validateLineup(SQUAD, illegalShape, NO_SLOTS, closed, NOW))).toBe("wrong-period");
  });
});

describe("validateLineup — purity", () => {
  it("is a pure function of its inputs (same args → same result, no throw on the clock)", () => {
    const a = validateLineup(SQUAD, XI_442, NO_SLOTS, OPEN, NOW);
    const b = validateLineup(SQUAD, XI_442, NO_SLOTS, OPEN, NOW);
    expect(a).toEqual(b);
  });

  it("covers all four positions in the enum", () => {
    const positions = new Set<Position>(SQUAD.map((p) => p.position));
    expect(positions).toEqual(new Set<Position>(["GK", "DEF", "MID", "FWD"]));
  });
});
