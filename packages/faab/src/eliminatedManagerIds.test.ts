/**
 * Pure unit for the data-existence ELIMINATED set — the fix for the bug where "eliminated manager" was
 * keyed on `playoff_entry.status = 'eliminated'`, which SILENTLY MISSED group-phase non-advancers (they
 * hold NO playoff_entry row at all — status is NULL, never the string 'eliminated'). The correct predicate
 * is the set twin of {@link loadIsPlayoffParticipant}, negated: a manager is eliminated iff the playoff
 * phase is active AND they do NOT hold an `alive` entry. That catches BOTH:
 *   - group-phase NON-ADVANCERS (no row), and
 *   - managers guillotined mid-playoffs (status='eliminated'),
 * while playoff survivors (status='alive') are the only ones left out of the set.
 *
 * The set is PHASE-GATED to empty during the group phase: before the group→playoff transition there are
 * ZERO alive rows, so a naive "not alive" derivation would mark EVERYONE eliminated and blank the whole
 * live field / budgets rail. Gating on {@link loadPlayoffPhaseActive} (ANY playoff_entry row exists)
 * returns an empty set until the transition fires.
 *
 * Fake `Pick<Db,"playoffEntry"|"manager">` — no DB. The real Prisma edges ride the two loaders' `tsc` +
 * the source-contract smokes (teamBudgetsWiring / vsFieldSkin) that pin the shared-helper delegation.
 */
import { describe, it, expect } from "vitest";
import { loadEliminatedManagerIds } from "./prismaStore";

type Db = Parameters<typeof loadEliminatedManagerIds>[0];

/**
 * Fake whose surface is `playoffEntry.count` (phase signal), `playoffEntry.findMany` (SURVIVOR filter), and
 * `manager.findMany` (the league universe). `count` returns the TOTAL entry rows (any status) so the phase
 * flips exactly as `loadPlayoffPhaseActive` sees it; `findMany` honours the `status: { in: [...] }` survivor
 * filter (`alive` + the terminal `champion`).
 */
function fakeDb(entries: { managerId: string; status: string }[], managerIds: string[]): Db {
  return {
    playoffEntry: {
      count: async () => entries.length,
      findMany: async (args: { where: { status?: { in: string[] } } }) => {
        const wanted = args.where.status?.in;
        return entries
          .filter((e) => (wanted ? wanted.includes(e.status) : true))
          .map((e) => ({ managerId: e.managerId }));
      },
    },
    manager: {
      findMany: async () => managerIds.map((id) => ({ id })),
    },
  } as unknown as Db;
}

describe("loadEliminatedManagerIds — data-existence eliminated set (phase-gated)", () => {
  it("(d) group phase — NO playoff_entry rows — marks NOBODY eliminated (field-blanking guard)", async () => {
    // The critical guard: pre-transition the phase is inactive, so the set is EMPTY and the live field /
    // budgets rail hide nothing — even though nobody is 'alive' yet.
    const db = fakeDb([], ["m1", "m2", "m3"]);
    expect(await loadEliminatedManagerIds(db, "L")).toEqual(new Set());
  });

  it("(a) a manager with NO playoff_entry row IS eliminated once the phase is active (non-advancer)", async () => {
    // Phase active (m1,m2 advanced with alive rows). m3 never advanced → no row → status NULL → the case
    // the old `status='eliminated'` read missed. He must now be in the eliminated set.
    const db = fakeDb(
      [
        { managerId: "m1", status: "alive" },
        { managerId: "m2", status: "alive" },
      ],
      ["m1", "m2", "m3"],
    );
    expect((await loadEliminatedManagerIds(db, "L")).has("m3")).toBe(true);
  });

  it("(b) an `alive` manager is NOT eliminated", async () => {
    const db = fakeDb(
      [
        { managerId: "m1", status: "alive" },
        { managerId: "m2", status: "eliminated" },
      ],
      ["m1", "m2"],
    );
    expect((await loadEliminatedManagerIds(db, "L")).has("m1")).toBe(false);
  });

  it("(c) a manager with an `eliminated`-status row IS eliminated", async () => {
    const db = fakeDb(
      [
        { managerId: "m1", status: "alive" },
        { managerId: "m2", status: "eliminated" },
      ],
      ["m1", "m2"],
    );
    expect((await loadEliminatedManagerIds(db, "L")).has("m2")).toBe(true);
  });

  it("a `champion` is NOT in the set — champion is alive-equivalent for DISPLAY (terminal form of 'survived')", async () => {
    // `champion` counts as a survivor HERE (display strike/hide) — the winner must not be struck/hidden. This
    // is DISPLAY-ONLY and deliberately DIVERGES from loadIsPlayoffParticipant / the FAAB enforcement + cap
    // predicates, which stay strictly status==='alive' (a separate axis; enforcement is moot post-tournament).
    // At Final-complete only the guillotined 'loser' is eliminated; the champion stays in.
    const db = fakeDb(
      [
        { managerId: "champ", status: "champion" },
        { managerId: "loser", status: "eliminated" },
      ],
      ["champ", "loser"],
    );
    expect(await loadEliminatedManagerIds(db, "L")).toEqual(new Set(["loser"]));
  });

  it("returns EXACTLY the non-survivor managers — (non-advancer ∪ guillotined), survivors excluded", async () => {
    // m1 alive (survivor), m2 eliminated (guillotined mid-playoffs), m3 alive (survivor), m4 no row
    // (group non-advancer). Eliminated set = {m2, m4}; the survivors m1,m3 are the only ones kept.
    const db = fakeDb(
      [
        { managerId: "m1", status: "alive" },
        { managerId: "m2", status: "eliminated" },
        { managerId: "m3", status: "alive" },
      ],
      ["m1", "m2", "m3", "m4"],
    );
    expect(await loadEliminatedManagerIds(db, "L")).toEqual(new Set(["m2", "m4"]));
  });
});
