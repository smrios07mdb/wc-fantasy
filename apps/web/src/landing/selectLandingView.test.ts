import { describe, it, expect } from "vitest";
import type { ManagerRecord } from "@app/auth";
import { selectLandingView } from "./selectLandingView";

const manager: ManagerRecord = {
  id: "mgr-alice",
  userId: "uid-alice",
  email: "alice@example.com",
  isCommissioner: false,
  displayName: "Alice",
};

describe("selectLandingView — session→manager outcome → landing view (pure, IO-free)", () => {
  it("maps no-session → 'signin' (the front door for a logged-out visitor)", () => {
    expect(selectLandingView({ kind: "no-session" })).toBe("signin");
  });

  it("maps ok → 'hub' (a resolved league manager gets the nav hub)", () => {
    expect(selectLandingView({ kind: "ok", manager, isCommissioner: false })).toBe("hub");
  });

  it("maps ok → 'hub' for a commissioner too (the flag does not change the landing view)", () => {
    expect(selectLandingView({ kind: "ok", manager, isCommissioner: true })).toBe("hub");
  });

  // The load-bearing distinction: an allowlisted member whose manager.user_id is not yet linked is
  // mid-provisioning, NOT rejected — they must NOT be routed to the denial view.
  it("maps no-manager → 'unlinked' (allowlisted session, manager not yet linked) — NOT 'denied'", () => {
    const view = selectLandingView({ kind: "no-manager", userId: "uid-alice" });
    expect(view).toBe("unlinked");
    expect(view).not.toBe("denied");
  });

  it("maps not-allowlisted → 'denied'", () => {
    expect(selectLandingView({ kind: "not-allowlisted", email: "x@example.com" })).toBe("denied");
  });
});
