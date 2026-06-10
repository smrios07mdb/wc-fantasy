import { describe, it, expect } from "vitest";
import { playerInitials } from "./playerInitials";

describe("playerInitials — two-name path", () => {
  it("uses first + last initial when both present", () => {
    expect(playerInitials("Vinicius Junior", "Vinicius", "Junior")).toBe("VJ");
  });
  it("first + last always wins over display name split", () => {
    expect(playerInitials("V. Junior", "Vinicius", "Junior")).toBe("VJ");
  });
  it("uppercases result", () => {
    expect(playerInitials("roberto carlos", "roberto", "carlos")).toBe("RC");
  });
});

describe("playerInitials — display name fallback", () => {
  it("splits on whitespace when no firstName/lastName", () => {
    expect(playerInitials("Vini Jr")).toBe("VJ");
  });
  it("handles three-word display name — takes first two words", () => {
    expect(playerInitials("Mohammed Al Rashid")).toBe("MA");
  });
  it("null firstName/lastName treated as absent (falls through to display name)", () => {
    expect(playerInitials("Vini Jr", null, null)).toBe("VJ");
  });
  it("undefined firstName/lastName treated as absent", () => {
    expect(playerInitials("Vini Jr", undefined, undefined)).toBe("VJ");
  });
});

describe("playerInitials — single-word names", () => {
  it("takes first 2 chars for single-word name (e.g. Rodri)", () => {
    expect(playerInitials("Rodri")).toBe("RO");
  });
  it("takes first 2 chars for 'Vinicius' when no split possible", () => {
    expect(playerInitials("Pelé")).toBe("PE");
  });
  it("1-char name returns that char", () => {
    expect(playerInitials("X")).toBe("X");
  });
});

describe("playerInitials — edge cases", () => {
  it("hyphenated surname treated as single word from display name → still works", () => {
    expect(playerInitials("Emiliano Martínez", "Emiliano", "Martínez")).toBe("EM");
  });
  it("extra whitespace in display name is normalised", () => {
    expect(playerInitials("  Kylian  Mbappé  ")).toBe("KM");
  });
  it("empty firstName falls through to display name", () => {
    expect(playerInitials("Kylian Mbappé", "", "Mbappé")).toBe("KM");
  });
});
