import { describe, it, expect } from "vitest";
import type { SessionManagerOutcome } from "@app/auth";
import { deriveIsCommissioner } from "./deriveIsCommissioner";

// Thread 6: deriveIsCommissioner is the pure predicate every feature layout calls (via
// getViewerIsCommissioner) to gate the shared shell's Commissioner nav entry — it must delegate to the
// SAME resolveCommissioner() the /commish page gate uses, not fork its own check.
const okOutcome = (isCommissioner: boolean, email: string | null): SessionManagerOutcome => ({
  kind: "ok",
  isCommissioner,
  manager: { id: "m1", userId: "u1", email, isCommissioner, displayName: "Test Manager" },
});

describe("deriveIsCommissioner", () => {
  it("is true for the flagged commissioner", () => {
    expect(deriveIsCommissioner(okOutcome(true, "someone@example.com"))).toBe(true);
  });

  it("is true for the known commissioner email even without the flag (case/whitespace-insensitive)", () => {
    expect(deriveIsCommissioner(okOutcome(false, "  SMRIOS07@GMAIL.com  "))).toBe(true);
  });

  it("is false for a non-commissioner manager", () => {
    expect(deriveIsCommissioner(okOutcome(false, "someone@example.com"))).toBe(false);
  });

  it("is false for any non-ok outcome (no-session / not-allowlisted / no-manager)", () => {
    expect(deriveIsCommissioner({ kind: "no-session" })).toBe(false);
    expect(deriveIsCommissioner({ kind: "not-allowlisted", email: "x@example.com" })).toBe(false);
    expect(deriveIsCommissioner({ kind: "no-manager", userId: "u1" })).toBe(false);
  });
});
