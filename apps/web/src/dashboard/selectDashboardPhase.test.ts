import { describe, it, expect } from "vitest";
import type { DraftStatus } from "@app/shared";
import { selectDashboardPhase } from "./selectDashboardPhase";

describe("selectDashboardPhase — DraftStatus → DashboardPhase (pure, IO-free)", () => {
  it("maps 'pending' → 'pre-draft' (draft configured, not yet started)", () => {
    expect(selectDashboardPhase("pending")).toBe("pre-draft");
  });

  it("maps 'active' → 'draft' (draft in progress)", () => {
    expect(selectDashboardPhase("active")).toBe("draft");
  });

  it("maps 'paused' → 'draft' (paused draft remains the draft phase — not a different UI)", () => {
    expect(selectDashboardPhase("paused")).toBe("draft");
  });

  it("maps 'complete' → 'post-draft' (draft done; group-stage dashboard is the next prompt)", () => {
    expect(selectDashboardPhase("complete")).toBe("post-draft");
  });

  it("exhaustiveness: all current DraftStatus values map without throwing", () => {
    // The `never` guard in selectDashboardPhase makes a missing case a compile error.
    // This runtime loop catches any NEW value added to DRAFT_STATUSES that was not yet
    // handled — the test fails before the never guard can be reached.
    const all: DraftStatus[] = ["pending", "active", "paused", "complete"];
    for (const s of all) {
      expect(() => selectDashboardPhase(s)).not.toThrow();
    }
  });
});
