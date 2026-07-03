import { describe, it, expect } from "vitest";
import { mapAdvanceRefusal } from "./advanceRefusalCopy";

describe("mapAdvanceRefusal", () => {
  it("rewrites the not-frozen refusal to the web-surface instruction (no --allow-incomplete pointer)", () => {
    const raw = "round R16 is not frozen — wait for the result freeze, or pass --allow-incomplete";
    expect(mapAdvanceRefusal(raw)).toBe(
      "round R16 is not frozen — freeze the round in Game operations first.",
    );
  });

  it("carries the round label through unchanged, whatever it is", () => {
    const raw =
      "round Quarterfinal is not frozen — wait for the result freeze, or pass --allow-incomplete";
    expect(mapAdvanceRefusal(raw)).toBe(
      "round Quarterfinal is not frozen — freeze the round in Game operations first.",
    );
  });

  it("passes through any other refusal reason verbatim", () => {
    const raw = "round R16 has already been cut";
    expect(mapAdvanceRefusal(raw)).toBe(raw);
  });
});
