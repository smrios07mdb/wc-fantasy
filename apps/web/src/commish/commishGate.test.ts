import { describe, expect, it } from "vitest";
import type { SessionManagerOutcome } from "@app/auth";
import { resolveCommishAccess } from "./commishGate";

function ok(over: {
  id?: string;
  email?: string | null;
  isCommissioner: boolean;
  displayName?: string;
}): SessionManagerOutcome {
  return {
    kind: "ok",
    manager: {
      id: over.id ?? "mgr-1",
      userId: "user-1",
      email: over.email ?? "member@example.com",
      isCommissioner: over.isCommissioner,
      displayName: over.displayName ?? "Manager",
    },
    isCommissioner: over.isCommissioner,
  };
}

describe("resolveCommishAccess — the /commish page gate", () => {
  it("redirects a logged-out visitor to /sign-in", () => {
    expect(resolveCommishAccess({ kind: "no-session" })).toEqual({
      kind: "redirect",
      to: "/sign-in",
    });
  });

  it("redirects a not-allowlisted / no-manager session to /auth/denied", () => {
    expect(resolveCommishAccess({ kind: "not-allowlisted", email: "x@y.com" })).toEqual({
      kind: "redirect",
      to: "/auth/denied",
    });
    expect(resolveCommishAccess({ kind: "no-manager", userId: "u9" })).toEqual({
      kind: "redirect",
      to: "/auth/denied",
    });
  });

  it("redirects a logged-in NON-commissioner (flag false, ordinary email) to /auth/denied", () => {
    expect(
      resolveCommishAccess(ok({ isCommissioner: false, email: "member@example.com" })),
    ).toEqual({ kind: "redirect", to: "/auth/denied" });
  });

  it("admits a commissioner by the is_commissioner flag", () => {
    const res = resolveCommishAccess(
      ok({ id: "mgr-c", isCommissioner: true, displayName: "Commish", email: "any@x.com" }),
    );
    expect(res).toEqual({ kind: "ok", managerId: "mgr-c", displayName: "Commish" });
  });

  it("admits the commissioner email even when the flag is false (parity with the CLI gate)", () => {
    const res = resolveCommishAccess(
      ok({ id: "mgr-e", isCommissioner: false, email: "SMRIOS07@gmail.com", displayName: "S" }),
    );
    expect(res).toEqual({ kind: "ok", managerId: "mgr-e", displayName: "S" });
  });
});
