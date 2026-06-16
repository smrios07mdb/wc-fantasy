import { describe, it, expect } from "vitest";
import { resolveKnockoutPhase } from "./resolveKnockoutPhase";

describe("resolveKnockoutPhase — PlayoffsView.complete is the authoritative render discriminator", () => {
  it("(playoff, false) → playoff", () => {
    expect(resolveKnockoutPhase("playoff", false)).toBe("playoff");
  });

  it("(playoff, true) → complete — champion already written, show it even if the Final row lags", () => {
    expect(resolveKnockoutPhase("playoff", true)).toBe("complete");
  });

  it("(complete, false) → playoff — Final FT'd but champion not yet written, never show an empty arm", () => {
    expect(resolveKnockoutPhase("complete", false)).toBe("playoff");
  });

  it("(complete, true) → complete", () => {
    expect(resolveKnockoutPhase("complete", true)).toBe("complete");
  });

  it("null playoffsComplete (no playoff read surface yet) → playoff", () => {
    expect(resolveKnockoutPhase("playoff", null)).toBe("playoff");
    expect(resolveKnockoutPhase("complete", null)).toBe("playoff");
  });

  it("non-knockout phases pass through untouched regardless of the complete flag", () => {
    expect(resolveKnockoutPhase("pre-kickoff", null)).toBe("pre-kickoff");
    expect(resolveKnockoutPhase("pre-kickoff", true)).toBe("pre-kickoff");
    expect(resolveKnockoutPhase("group", false)).toBe("group");
    expect(resolveKnockoutPhase("group", true)).toBe("group");
  });
});
