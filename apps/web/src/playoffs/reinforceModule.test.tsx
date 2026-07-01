// @vitest-environment jsdom
/**
 * FAAB-COPY-P1 — the /playoffs reinforcement copy must reflect the CORRECTED guillotine-FAAB rule:
 * a single one-time $100 for the ENTIRE tournament, NEVER reset or replenished at the knockouts;
 * group-stage spend carries forward (DECISIONS §guillotine-FAAB, 2026-06-28 correction). The old
 * copy claimed a playoff "reset to $100" / "clean $100" — the exact opposite of the live rule.
 *
 * Mounts the real {@link ReinforceModule} in jsdom (the rendered copy is what ships) and pins:
 *   (a) NO affirmative-reset claim renders (no "reset to $100" / "clean $100" / "fresh $100");
 *   (b) the carry-forward framing is present;
 *   (c) the meter denominator reads the whole-tournament budget.
 *
 * NB: the sanctioned copy REFUTES the old claim with the phrase "does not reset", so a blanket
 * /reset/i ban (as the ticket sketched) would be self-contradictory — we assert the AFFIRMATIVE
 * reset phrases are gone instead, which is the faithful intent.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { ReinforceModule } from "../../app/playoffs/components";
import type { WaiversView } from "../waivers/types";

afterEach(cleanup);

function reinforcement(over: Partial<WaiversView> = {}): WaiversView {
  return {
    managerId: "m1",
    faabBudget: 42,
    roster: [],
    lockedPlayerIds: [],
    freeAgents: [],
    watchedPlayerIds: [],
    claims: [],
    batches: [],
    waiverOrder: [],
    teamBudgets: [],
    batchWindow: null,
    timezone: "America/New_York",
    isPlayoffPhase: true,
    rosterCap: 9,
    isParticipant: true,
    playoffForfeitDeadlineIso: null,
    nowIso: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

describe("ReinforceModule — carry-forward FAAB copy (FAAB-COPY-P1)", () => {
  it("renders NO affirmative playoff-reset claim", () => {
    const { container } = render(<ReinforceModule reinforcement={reinforcement()} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/reset to \$?100/i);
    expect(text).not.toMatch(/clean \$?100/i);
    expect(text).not.toMatch(/fresh \$?100/i);
    expect(text).not.toMatch(/at the group→playoff transition/i);
  });

  it("states the carry-forward rule (one budget for the whole tournament, does not reset)", () => {
    render(<ReinforceModule reinforcement={reinforcement()} />);
    expect(screen.getByText(/whole tournament/i)).toBeTruthy();
    expect(screen.getByText(/carries into the playoffs — it does not reset/i)).toBeTruthy();
  });

  it("the playoff-phase pill announces carry-over, not a reset", () => {
    render(<ReinforceModule reinforcement={reinforcement({ isPlayoffPhase: true })} />);
    expect(screen.getByText(/carries over · no reset/i)).toBeTruthy();
  });

  it("the meter denominator reads the whole-tournament budget", () => {
    render(<ReinforceModule reinforcement={reinforcement({ faabBudget: 42 })} />);
    // remaining balance figure ($42) …
    expect(screen.getByText("$42")).toBeTruthy();
    // … denominated against the $100 whole-tournament budget (not a per-playoff allowance)
    expect(screen.getByText(/of your \$100 tournament budget/i)).toBeTruthy();
  });

  it("returns null with no reinforcement (graceful)", () => {
    const { container } = render(<ReinforceModule reinforcement={null} />);
    expect(container.textContent).toBe("");
  });
});

describe("PLAYOFF_EXPLAINER + FAAB meter local — carry-forward (source contract)", () => {
  const componentsSrc = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../app/playoffs/components.tsx"),
    "utf8",
  );
  it("the explainer drops the stale 'reset to $100' clause for a carry-over clause", () => {
    // The explainer is a module-private JSX fragment (not exported); assert on source (copy, not paint).
    expect(componentsSrc).not.toMatch(/reset to \$100/);
    expect(componentsSrc).toContain("a single $100 for the entire tournament (no playoff reset)");
  });
  it("renames the misnomer FAAB_RESET local to the tournament-budget denominator", () => {
    expect(componentsSrc).not.toContain("FAAB_RESET");
    expect(componentsSrc).toContain("FAAB_TOURNAMENT_BUDGET");
  });
});
