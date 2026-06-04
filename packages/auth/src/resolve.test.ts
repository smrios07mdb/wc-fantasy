import { describe, it, expect } from "vitest";
import { resolveSessionManager, assertSessionManager } from "./resolve";
import { NoManagerLinkedError, NoSessionError, NotAllowlistedError } from "./errors";
import type { AllowlistEntry, ManagerRecord, SessionIdentity } from "./types";

const allowlist: AllowlistEntry[] = [{ email: "alice@example.com" }, { email: "bob@example.com" }];

const alice: ManagerRecord = {
  id: "mgr-alice",
  userId: "uid-alice",
  email: "alice@example.com",
  isCommissioner: true,
  displayName: "Alice",
};
const bob: ManagerRecord = {
  id: "mgr-bob",
  userId: "uid-bob",
  email: "bob@example.com",
  isCommissioner: false,
  displayName: "Bob",
};
const managers = [alice, bob];

const session = (over: Partial<SessionIdentity>): SessionIdentity => ({
  userId: "uid-alice",
  email: "alice@example.com",
  ...over,
});

describe("resolveSessionManager — the pure session→manager core", () => {
  it("returns no-session when there is no session", () => {
    expect(resolveSessionManager({ session: null, allowlist, managers })).toEqual({
      kind: "no-session",
    });
  });

  it("returns not-allowlisted for an authenticated-but-not-allowlisted email", () => {
    const result = resolveSessionManager({
      session: session({ userId: "uid-mallory", email: "mallory@example.com" }),
      allowlist,
      managers,
    });
    expect(result).toEqual({ kind: "not-allowlisted", email: "mallory@example.com" });
  });

  it("returns no-manager for an allowlisted user with no linked manager", () => {
    const result = resolveSessionManager({
      session: session({ userId: "uid-carol", email: "bob@example.com" }),
      allowlist,
      // a session whose email is allowlisted (bob) but whose uid/email link no manager
      managers: [{ ...bob, userId: "someone-else", email: null }],
    });
    expect(result).toEqual({ kind: "no-manager", userId: "uid-carol" });
  });

  it("resolves the linked manager by Supabase uid and surfaces isCommissioner", () => {
    const result = resolveSessionManager({ session: session({}), allowlist, managers });
    expect(result).toEqual({ kind: "ok", manager: alice, isCommissioner: true });
  });

  it("honors the single-league assumption: among many managers, returns the one matching the uid", () => {
    const result = resolveSessionManager({
      session: session({ userId: "uid-bob", email: "bob@example.com" }),
      allowlist,
      managers,
    });
    expect(result).toEqual({ kind: "ok", manager: bob, isCommissioner: false });
  });

  // The unpinned-link robustness seam: app_user.id may NOT equal the Supabase uid. The email key
  // (the linked app_user.email) still resolves the manager.
  it("falls back to the email link when the uid does not match (robust to the unpinned ceremony)", () => {
    const linkedByEmailOnly: ManagerRecord = { ...alice, userId: "stale-or-null-uid" };
    const result = resolveSessionManager({
      session: session({ userId: "uid-alice-fresh", email: "alice@example.com" }),
      allowlist,
      managers: [linkedByEmailOnly],
    });
    expect(result).toEqual({ kind: "ok", manager: linkedByEmailOnly, isCommissioner: true });
  });

  it("checks the allowlist BEFORE the manager link (not-allowlisted wins even if a manager matches)", () => {
    const result = resolveSessionManager({
      session: session({ userId: "uid-alice", email: "alice@example.com" }),
      allowlist: [], // empty allowlist → nobody is allowed
      managers,
    });
    expect(result).toEqual({ kind: "not-allowlisted", email: "alice@example.com" });
  });
});

describe("assertSessionManager — the throw-style wrapper", () => {
  it("returns the resolved manager on ok", () => {
    expect(assertSessionManager({ kind: "ok", manager: alice, isCommissioner: true })).toEqual({
      manager: alice,
      isCommissioner: true,
    });
  });

  it("throws NoSessionError on no-session", () => {
    expect(() => assertSessionManager({ kind: "no-session" })).toThrow(NoSessionError);
  });

  it("throws NotAllowlistedError carrying the email", () => {
    expect(() => assertSessionManager({ kind: "not-allowlisted", email: "x@y.com" })).toThrow(
      NotAllowlistedError,
    );
  });

  it("throws NoManagerLinkedError carrying the userId", () => {
    expect(() => assertSessionManager({ kind: "no-manager", userId: "uid-x" })).toThrow(
      NoManagerLinkedError,
    );
  });
});
