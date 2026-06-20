/**
 * Guard for the `/vsfield?manager=<id>` deep-link seed (T3 last mile). The crux is the validation
 * guard: a valid id seeds that manager's H2H; an absent / malformed / unknown id falls back to null
 * (the client's existing default) and NEVER seeds a non-existent manager → empty/broken H2H.
 */
import { describe, it, expect } from "vitest";
import { seedManagerSelection, type SeedFieldEntry } from "./seedSelection";

const field: SeedFieldEntry[] = [
  { managerId: "me-uuid", isMe: true },
  { managerId: "opp-uuid", isMe: false },
];

describe("seedManagerSelection", () => {
  it("(a) seeds effSel to a valid opponent's managerId", () => {
    expect(seedManagerSelection("opp-uuid", field)).toBe("opp-uuid");
  });

  it('collapses your OWN row to the aggregate cockpit ("field"), mirroring select()', () => {
    expect(seedManagerSelection("me-uuid", field)).toBe("field");
  });

  it("(b) falls back to null for an unknown managerId — never seeds a bad value", () => {
    expect(seedManagerSelection("ghost-uuid", field)).toBeNull();
  });

  it("(b) falls back to null when the param is absent", () => {
    expect(seedManagerSelection(undefined, field)).toBeNull();
  });

  it("falls back to null for an empty string", () => {
    expect(seedManagerSelection("", field)).toBeNull();
  });

  it("falls back to null for a duplicated param (string[])", () => {
    expect(seedManagerSelection(["me-uuid", "opp-uuid"], field)).toBeNull();
  });
});
