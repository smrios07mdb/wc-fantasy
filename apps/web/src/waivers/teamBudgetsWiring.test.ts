import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for the league-wide team-budgets rail. The loader (`loadWaivers`) has
// no DB unit test (it needs a live Postgres), so this guards the load-bearing thread from source: the
// remaining-budget column read is `manager.faabBudget` — the SAME stored column the FAAB resolver debits
// on a won claim (`prismaStore.ts` `faabBudget: { decrement: r.amount } }`) — never recomputed from bid
// history, and it is threaded onto the view budget-desc.
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

const loader = read("../../app/waivers/loadWaivers.ts");
const components = read("./components.tsx");
const types = read("./types.ts");

describe("loadWaivers.ts — threads each team's remaining FAAB onto the view", () => {
  it("selects the canonical faabBudget column on the league-wide manager read", () => {
    expect(loader).toMatch(
      /select: \{ id: true, displayName: true, waiverOrderPosition: true, faabBudget: true \}/,
    );
  });

  it("derives teamBudgets straight off manager.faabBudget, sorted budget-desc", () => {
    expect(loader).toContain("const teamBudgets: WvTeamBudget[] = [...managerRows]");
    expect(loader).toContain(".sort((a, b) => b.faabBudget - a.faabBudget)");
    expect(loader).toContain("budget: m.faabBudget,");
  });

  it("surfaces teamBudgets on the returned view", () => {
    expect(loader).toContain("teamBudgets,");
  });
});

describe("the rail renders each team's budget (display-only, current manager highlighted)", () => {
  it("components.tsx defines TeamBudgetsRail using the global .dtable/.row-me table styling", () => {
    expect(components).toContain("export function TeamBudgetsRail(");
    expect(components).toContain('<table className="dtable wv-budgets-table">');
    expect(components).toContain('team.isMe ? "row-me" : ""');
  });

  it("WaiversView carries the budget-desc teamBudgets list reusing WvTeamBudget", () => {
    expect(types).toContain("export interface WvTeamBudget");
    expect(types).toContain("readonly teamBudgets: readonly WvTeamBudget[]");
  });
});
