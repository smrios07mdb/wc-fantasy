import { describe, expect, it } from "vitest";
import {
  COMMISH_ACTION_TYPES,
  COMMISSIONER_EMAIL,
  resolveCommissioner,
  type CommishActionType,
} from "./commish";

describe("resolveCommissioner — the single commissioner gate predicate", () => {
  it("grants on the is_commissioner flag, regardless of email", () => {
    expect(resolveCommissioner({ isCommissioner: true, email: "anyone@x.com" })).toBe(true);
    expect(resolveCommissioner({ isCommissioner: true, email: null })).toBe(true);
  });

  it("grants on the known commissioner email even when the flag is false (case-insensitive, trimmed)", () => {
    expect(resolveCommissioner({ isCommissioner: false, email: COMMISSIONER_EMAIL })).toBe(true);
    expect(resolveCommissioner({ isCommissioner: false, email: "SMRIOS07@GMAIL.COM" })).toBe(true);
    expect(resolveCommissioner({ isCommissioner: false, email: "  smrios07@gmail.com  " })).toBe(
      true,
    );
  });

  it("denies a non-commissioner with an unrelated / missing email", () => {
    expect(resolveCommissioner({ isCommissioner: false, email: "rando@x.com" })).toBe(false);
    expect(resolveCommissioner({ isCommissioner: false, email: null })).toBe(false);
    expect(resolveCommissioner({ isCommissioner: false, email: undefined })).toBe(false);
  });
});

describe("COMMISH_ACTION_TYPES", () => {
  it("is a non-empty closed set with unique members", () => {
    expect(COMMISH_ACTION_TYPES.length).toBeGreaterThan(0);
    expect(new Set(COMMISH_ACTION_TYPES).size).toBe(COMMISH_ACTION_TYPES.length);
  });

  it("covers the console's write domains + reverse (type-checks assignability)", () => {
    const sample: CommishActionType[] = [
      "stat_correction",
      "period_freeze",
      "field_locked",
      "action_reversed",
    ];
    for (const t of sample) expect(COMMISH_ACTION_TYPES).toContain(t);
  });
});
