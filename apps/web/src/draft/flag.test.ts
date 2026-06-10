import { describe, it, expect } from "vitest";
import { flagEmoji, toIso2, countryFlag, ISO3_TO_ISO2, HOME_NATIONS, isHomeNation } from "./flag";

// Pure-logic unit tests for the draft-pool flag util (Prompt 33). The mapping country → ISO-3166-1
// alpha-2 → emoji is the only place flags are derived; `<Flag>` (apps/web/app/draft/Flag.tsx) is the thin
// sole RENDER surface over `flagEmoji`. We test resolution + the regional-indicator codepoint math here so
// the React layer stays a trivial, source-contract-smoked wrapper.

describe("flagEmoji — regional-indicator emoji from an ISO 3166-1 alpha-2 code", () => {
  it("maps a known alpha-2 code to its emoji flag", () => {
    expect(flagEmoji("US")).toBe("\u{1F1FA}\u{1F1F8}"); // 🇺🇸
    expect(flagEmoji("AR")).toBe("\u{1F1E6}\u{1F1F7}"); // 🇦🇷
    expect(flagEmoji("BR")).toBe("\u{1F1E7}\u{1F1F7}"); // 🇧🇷
  });

  it("is case-insensitive on the alpha-2 input", () => {
    expect(flagEmoji("us")).toBe(flagEmoji("US"));
    expect(flagEmoji(" Fr ")).toBe(flagEmoji("FR"));
  });

  it("degrades gracefully (returns null) for empty / null / non-alpha-2 input — never a broken glyph", () => {
    expect(flagEmoji(null)).toBeNull();
    expect(flagEmoji("")).toBeNull();
    expect(flagEmoji("USA")).toBeNull(); // 3 letters is not an alpha-2 code
    expect(flagEmoji("U")).toBeNull();
    expect(flagEmoji("1!")).toBeNull();
    expect(flagEmoji("12")).toBeNull();
  });
});

describe("toIso2 — resolve the pool's country value (code OR name) to an alpha-2 code", () => {
  it("passes a valid alpha-2 code straight through (uppercased)", () => {
    expect(toIso2("US")).toBe("US");
    expect(toIso2("ar")).toBe("AR");
  });

  it("maps an ISO-3166-1 alpha-3 code to alpha-2", () => {
    expect(toIso2("ARG")).toBe("AR");
    expect(toIso2("USA")).toBe("US");
    expect(toIso2("BRA")).toBe("BR");
    expect(toIso2("FRA")).toBe("FR");
    expect(toIso2("ESP")).toBe("ES");
  });

  it("maps FIFA/IOC three-letter codes that differ from ISO alpha-3 (e.g. design vocabulary)", () => {
    expect(toIso2("GER")).toBe("DE"); // ISO alpha-3 is DEU
    expect(toIso2("NED")).toBe("NL"); // ISO alpha-3 is NLD
    expect(toIso2("POR")).toBe("PT"); // ISO alpha-3 is PRT
    expect(toIso2("SUI")).toBe("CH"); // ISO alpha-3 is CHE
    expect(toIso2("URU")).toBe("UY"); // ISO alpha-3 is URY
    expect(toIso2("CRO")).toBe("HR"); // ISO alpha-3 is HRV
  });

  it("resolves a full English country NAME to alpha-2 (generated via Intl.DisplayNames)", () => {
    expect(toIso2("Argentina")).toBe("AR");
    expect(toIso2("Brazil")).toBe("BR");
    expect(toIso2("South Korea")).toBe("KR");
    expect(toIso2("germany")).toBe("DE"); // case/space-insensitive
  });

  it("degrades gracefully (null) for empty / null / unmappable values", () => {
    expect(toIso2(null)).toBeNull();
    expect(toIso2("")).toBeNull();
    expect(toIso2("ZZ")).toBeNull();
    expect(toIso2("ZZZ")).toBeNull();
    expect(toIso2("Atlantis")).toBeNull();
  });

  it("England and Scotland resolve to null — they use inline SVG via isHomeNation, not emoji", () => {
    expect(toIso2("England")).toBeNull(); // GB alias removed; Flag.tsx intercepts via isHomeNation
    expect(toIso2("Scotland")).toBeNull();
    // FIFA codes for England/Scotland also removed — no contradictory mapping
    expect(toIso2("ENG")).toBeNull();
    expect(toIso2("SCO")).toBeNull();
  });

  it("Wales and Northern Ireland still resolve to GB (not in 48-team set; kept for completeness)", () => {
    expect(toIso2("Wales")).toBe("GB");
    expect(toIso2("Northern Ireland")).toBe("GB");
    expect(toIso2("WAL")).toBe("GB");
    expect(toIso2("NIR")).toBe("GB");
  });

  it("resolves DR Congo variants to CD", () => {
    expect(toIso2("DR Congo")).toBe("CD");
    expect(toIso2("Congo DR")).toBe("CD");
    expect(toIso2("Democratic Republic of the Congo")).toBe("CD");
    expect(toIso2("Democratic Republic of Congo")).toBe("CD");
    // ISO alpha-3 path
    expect(toIso2("COD")).toBe("CD");
  });

  it("resolves Côte d'Ivoire variants to CI", () => {
    expect(toIso2("Côte d'Ivoire")).toBe("CI");
    expect(toIso2("Cote d'Ivoire")).toBe("CI");
    expect(toIso2("Ivory Coast")).toBe("CI"); // existing alias
    // ISO alpha-3 path
    expect(toIso2("CIV")).toBe("CI");
  });

  it("resolves Bosnia & Herzegovina variants to BA", () => {
    expect(toIso2("Bosnia and Herzegovina")).toBe("BA");
    expect(toIso2("Bosnia & Herzegovina")).toBe("BA");
    expect(toIso2("Bosnia-Herzegovina")).toBe("BA");
    expect(toIso2("BIH")).toBe("BA");
  });

  it("resolves Curaçao (ISO CUW→CW) with and without accent", () => {
    expect(toIso2("Curaçao")).toBe("CW");
    expect(toIso2("Curacao")).toBe("CW");
    expect(toIso2("CUW")).toBe("CW");
  });

  it("resolves Cabo Verde to CV (feed sends modern name; Intl returns 'Cape Verde' on this runtime)", () => {
    expect(toIso2("Cabo Verde")).toBe("CV");
    expect(toIso2("Cape Verde")).toBe("CV"); // Intl path / older feed spelling
  });

  it("resolves FIFA formal names that differ from Intl.DisplayNames output", () => {
    expect(toIso2("IR Iran")).toBe("IR");
    expect(toIso2("Türkiye")).toBe("TR");
    expect(toIso2("Turkey")).toBe("TR");
    expect(toIso2("Korea Republic")).toBe("KR");
    expect(toIso2("DPR Korea")).toBe("KP");
    expect(toIso2("Republic of Ireland")).toBe("IE");
    expect(toIso2("Cape Verde")).toBe("CV");
    expect(toIso2("Chinese Taipei")).toBe("TW");
    expect(toIso2("Trinidad and Tobago")).toBe("TT");
    expect(toIso2("Trinidad & Tobago")).toBe("TT");
    expect(toIso2("Czechia")).toBe("CZ");
  });
});

describe("countryFlag — convenience country → emoji used at the row/chip call sites", () => {
  it("renders the emoji for a code or a name", () => {
    expect(countryFlag("ARG")).toBe(flagEmoji("AR"));
    expect(countryFlag("Brazil")).toBe(flagEmoji("BR"));
    expect(countryFlag("GER")).toBe(flagEmoji("DE"));
  });

  it("returns null for unmappable / absent values (caller renders nothing)", () => {
    expect(countryFlag(null)).toBeNull();
    expect(countryFlag("")).toBeNull();
    expect(countryFlag("Narnia")).toBeNull();
  });
});

describe("HOME_NATIONS / isHomeNation — home-nation predicate for the inline SVG path", () => {
  it("HOME_NATIONS contains exactly England and Scotland", () => {
    expect(HOME_NATIONS.has("England")).toBe(true);
    expect(HOME_NATIONS.has("Scotland")).toBe(true);
    expect(HOME_NATIONS.size).toBe(2);
  });

  it("isHomeNation returns true only for England and Scotland (exact feed strings)", () => {
    expect(isHomeNation("England")).toBe(true);
    expect(isHomeNation("Scotland")).toBe(true);
    // control: other 46 nations and home-nation codes are NOT home nations for SVG purposes
    expect(isHomeNation("Brazil")).toBe(false);
    expect(isHomeNation("Wales")).toBe(false);
    expect(isHomeNation("Northern Ireland")).toBe(false);
    expect(isHomeNation("ENG")).toBe(false);
    expect(isHomeNation(null)).toBe(false);
    expect(isHomeNation(undefined)).toBe(false);
    expect(isHomeNation("")).toBe(false);
  });
});

describe("ISO3_TO_ISO2 table — sourced from the standard ISO 3166-1 list (not hand-authored per flag)", () => {
  it("covers the World Cup football nations and keeps codes well-formed", () => {
    // spot-check a spread of confederations
    for (const [a3, a2] of Object.entries({
      ARG: "AR",
      BRA: "BR",
      FRA: "FR",
      ESP: "ES",
      JPN: "JP",
      MAR: "MA",
      AUS: "AU",
      CAN: "CA",
      MEX: "MX",
    })) {
      expect(ISO3_TO_ISO2[a3]).toBe(a2);
    }
    // every entry is alpha-3 → alpha-2, upper-case ASCII
    for (const [a3, a2] of Object.entries(ISO3_TO_ISO2)) {
      expect(a3).toMatch(/^[A-Z]{3}$/);
      expect(a2).toMatch(/^[A-Z]{2}$/);
    }
  });
});
