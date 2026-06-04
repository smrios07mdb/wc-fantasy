import { describe, it, expect } from "vitest";
import { canActAsManager, assertCanActAsManager } from "./authz";
import { NotYourManagerError } from "./errors";

describe("canActAsManager — scope-gated act-as authz", () => {
  it("allows acting as yourself (default 'self' scope)", () => {
    expect(
      canActAsManager({ sessionManagerId: "m1", targetManagerId: "m1", isCommissioner: false }),
    ).toBe(true);
  });

  it("denies a 'self'-scope op against another manager", () => {
    expect(
      canActAsManager({ sessionManagerId: "m1", targetManagerId: "m2", isCommissioner: false }),
    ).toBe(false);
  });

  it("a commissioner CANNOT override a 'self'-scope op (e.g. picking for another manager)", () => {
    expect(
      canActAsManager({
        sessionManagerId: "m1",
        targetManagerId: "m2",
        isCommissioner: true,
        scope: "self",
      }),
    ).toBe(false);
  });

  it("a commissioner CAN act on another manager for an 'admin'-scope op", () => {
    expect(
      canActAsManager({
        sessionManagerId: "m1",
        targetManagerId: "m2",
        isCommissioner: true,
        scope: "admin",
      }),
    ).toBe(true);
  });

  it("a non-commissioner still cannot act on another manager for an 'admin'-scope op", () => {
    expect(
      canActAsManager({
        sessionManagerId: "m1",
        targetManagerId: "m2",
        isCommissioner: false,
        scope: "admin",
      }),
    ).toBe(false);
  });

  it("self-match is allowed regardless of scope", () => {
    expect(
      canActAsManager({
        sessionManagerId: "m1",
        targetManagerId: "m1",
        isCommissioner: false,
        scope: "admin",
      }),
    ).toBe(true);
  });
});

describe("assertCanActAsManager — the throw-style wrapper", () => {
  it("returns void when allowed", () => {
    expect(
      assertCanActAsManager({
        sessionManagerId: "m1",
        targetManagerId: "m1",
        isCommissioner: false,
      }),
    ).toBeUndefined();
  });

  it("throws NotYourManagerError when denied", () => {
    expect(() =>
      assertCanActAsManager({
        sessionManagerId: "m1",
        targetManagerId: "m2",
        isCommissioner: false,
      }),
    ).toThrow(NotYourManagerError);
  });
});
