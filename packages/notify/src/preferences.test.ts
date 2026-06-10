import { describe, it, expect } from "vitest";
import { validatePreferenceInput } from "./preferences";

describe("validatePreferenceInput — the three-boolean preference body", () => {
  it("accepts a fully-specified body and echoes the three flags", () => {
    const r = validatePreferenceInput({
      draftTurn: true,
      playerNotStarting: false,
      matchStarting: true,
    });
    expect(r).toEqual({
      ok: true,
      value: { draftTurn: true, playerNotStarting: false, matchStarting: true },
    });
  });

  it("accepts all-false (every channel muted)", () => {
    const r = validatePreferenceInput({
      draftTurn: false,
      playerNotStarting: false,
      matchStarting: false,
    });
    expect(r).toEqual({
      ok: true,
      value: { draftTurn: false, playerNotStarting: false, matchStarting: false },
    });
  });

  it("rejects null / non-object input", () => {
    expect(validatePreferenceInput(null)).toEqual({ ok: false, reason: "invalid" });
    expect(validatePreferenceInput("nope")).toEqual({ ok: false, reason: "invalid" });
    expect(validatePreferenceInput(42)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a body missing a flag", () => {
    expect(validatePreferenceInput({ draftTurn: true, playerNotStarting: true })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects a non-boolean flag (no truthiness coercion)", () => {
    expect(
      validatePreferenceInput({ draftTurn: "true", playerNotStarting: false, matchStarting: true }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      validatePreferenceInput({ draftTurn: 1, playerNotStarting: 0, matchStarting: 1 }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("ignores extra keys, keeping only the three known flags", () => {
    const r = validatePreferenceInput({
      draftTurn: true,
      playerNotStarting: true,
      matchStarting: true,
      somethingElse: "ignored",
    });
    expect(r).toEqual({
      ok: true,
      value: { draftTurn: true, playerNotStarting: true, matchStarting: true },
    });
  });
});
