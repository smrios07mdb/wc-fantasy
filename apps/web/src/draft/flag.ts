/**
 * Country → flag-emoji resolution for the draft pool (Prompt 33). PURE, no React, no IO — the single
 * place flags are derived. `<Flag>` (apps/web/app/draft/Flag.tsx) is the thin sole RENDER surface over
 * {@link flagEmoji}; swapping the flag source later means editing this file + that component only.
 *
 * Emoji flags are built from a pair of Unicode regional-indicator symbols, which require an ISO 3166-1
 * **alpha-2** code. The pool's `player.country` value is unverified in shape (the column is not written by
 * any ingestion path today; the design vocabulary uses FIFA three-letter codes, the spec describes country
 * NAMES), so {@link toIso2} resolves any of the realistic shapes — alpha-2 passthrough, ISO/FIFA alpha-3,
 * or a full English name (generated via `Intl.DisplayNames`) — and falls back to `null` (render nothing)
 * for anything unmappable. The ISO-3166 table below is the standard list; the per-flag glyph is computed
 * algorithmically, never hand-authored.
 */

// ISO 3166-1 alpha-3 → alpha-2, compact "<a3><a2>" tokens (the standard list; the only non-derivable data).
const ISO3166_PAIRS =
  "AFGAF ALBAL DZADZ ANDAD AGOAO ATGAG ARGAR ARMAM AUSAU AUTAT AZEAZ BHSBS BHRBH BGDBD BRBBB " +
  "BLRBY BELBE BLZBZ BENBJ BTNBT BOLBO BIHBA BWABW BRABR BRNBN BGRBG BFABF BDIBI CPVCV KHMKH " +
  "CMRCM CANCA CAFCF TCDTD CHLCL CHNCN COLCO COMKM COGCG CODCD CRICR CIVCI HRVHR CUBCU CYPCY " +
  "CZECZ DNKDK DJIDJ DMADM DOMDO ECUEC EGYEG SLVSV GNQGQ ERIER ESTEE SWZSZ ETHET FJIFJ FINFI " +
  "FRAFR GABGA GMBGM GEOGE DEUDE GHAGH GRCGR GRDGD GTMGT GINGN GNBGW GUYGY HTIHT HNDHN HUNHU " +
  "ISLIS INDIN IDNID IRNIR IRQIQ IRLIE ISRIL ITAIT JAMJM JPNJP JORJO KAZKZ KENKE KIRKI PRKKP " +
  "KORKR KWTKW KGZKG LAOLA LVALV LBNLB LSOLS LBRLR LBYLY LIELI LTULT LUXLU MDGMG MWIMW MYSMY " +
  "MDVMV MLIML MLTMT MHLMH MRTMR MUSMU MEXMX FSMFM MDAMD MCOMC MNGMN MNEME MARMA MOZMZ MMRMM " +
  "NAMNA NRUNR NPLNP NLDNL NZLNZ NICNI NERNE NGANG MKDMK NORNO OMNOM PAKPK PLWPW PANPA PNGPG " +
  "PRYPY PERPE PHLPH POLPL PRTPT QATQA ROURO RUSRU RWARW KNAKN LCALC VCTVC WSMWS SMRSM STPST " +
  "SAUSA SENSN SRBRS SYCSC SLESL SGPSG SVKSK SVNSI SLBSB SOMSO ZAFZA SSDSS ESPES LKALK SDNSD " +
  "SURSR SWESE CHECH SYRSY TWNTW TJKTJ TZATZ THATH TLSTL TGOTG TONTO TTOTT TUNTN TURTR TKMTM " +
  "TUVTV UGAUG UKRUA AREAE GBRGB USAUS URUUY UZBUZ VUTVU VENVE VNMVN YEMYE ZMBZM ZWEZW HKGHK " +
  "MACMO PRIPR PSEPS GRLGL FROFO GIBGI";

/** ISO 3166-1 alpha-3 → alpha-2 (derived from the standard list above). */
export const ISO3_TO_ISO2: Record<string, string> = Object.fromEntries(
  ISO3166_PAIRS.split(" ").map((t) => [t.slice(0, 3), t.slice(3, 5)]),
);

/** The set of real alpha-2 codes — guards passthrough so we never emit a stray (flag-less) indicator pair. */
const KNOWN_ISO2 = new Set(Object.values(ISO3_TO_ISO2));

/**
 * FIFA / IOC three-letter codes that differ from ISO 3166-1 alpha-3 — the design vocabulary
 * (design/design_reference/draft/data.jsx) uses these. Code aliases only; the flag glyph stays algorithmic.
 */
const FIFA_TO_ISO2: Record<string, string> = {
  GER: "DE", // Germany (ISO DEU)
  NED: "NL", // Netherlands (ISO NLD)
  POR: "PT", // Portugal (ISO PRT)
  SUI: "CH", // Switzerland (ISO CHE)
  URU: "UY", // Uruguay (ISO URY)
  CRO: "HR", // Croatia (ISO HRV)
  DEN: "DK", // Denmark (ISO DNK)
  RSA: "ZA", // South Africa (ISO ZAF)
  PAR: "PY", // Paraguay (ISO PRY)
  URS: "RU", // legacy
  BUL: "BG", // Bulgaria (ISO BGR)
  CHI: "CL", // Chile (ISO CHL)
  PHI: "PH", // Philippines (ISO PHL)
  ZAM: "ZM", // Zambia (ISO ZMB)
  // Home nations — not independent ISO 3166-1 states; rendered as 🇬🇧 (regional-indicator, no tag sequences)
  ENG: "GB",
  SCO: "GB",
  WAL: "GB",
  NIR: "GB",
  // Curaçao: ISO 3166-1 alpha-3 CUW → alpha-2 CW; omitted from the compact ISO string above
  CUW: "CW",
};

/** Normalized full English name → alpha-2, generated from the ISO list via Intl.DisplayNames (no hand-list). */
const NAME_TO_ISO2: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const norm = (s: string) => s.trim().toLowerCase();
  let names: Intl.DisplayNames | undefined;
  try {
    names = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    names = undefined; // very old runtime — name resolution simply unavailable; codes still work
  }
  if (names) {
    for (const a2 of new Set(Object.values(ISO3_TO_ISO2))) {
      const name = names.of(a2);
      if (name && name.toUpperCase() !== a2) map[norm(name)] = a2;
    }
  }
  // common short aliases the feed/design may use that Intl spells differently
  Object.assign(map, {
    usa: "US",
    "united states of america": "US",
    "south korea": "KR",
    "north korea": "KP",
    "ivory coast": "CI",
    russia: "RU",
    iran: "IR",
    "czech republic": "CZ",
    // Home nations — not independent ISO 3166-1 states; rendered as 🇬🇧 (no tag-sequence emojis)
    england: "GB",
    scotland: "GB",
    wales: "GB",
    "northern ireland": "GB",
    // Curaçao — ISO 3166-1 alpha-3 CUW → CW; accent and plain variants
    "curaçao": "CW",
    curacao: "CW",
    // DR Congo — Intl gives "Congo - Kinshasa"; feed/FIFA uses multiple spellings
    "dr congo": "CD",
    "congo dr": "CD",
    "democratic republic of the congo": "CD",
    "democratic republic of congo": "CD",
    "congo, the democratic republic of the": "CD",
    // Côte d'Ivoire — Intl is Node-version dependent; add both French and variant spellings
    "côte d'ivoire": "CI",
    "cote d'ivoire": "CI",
    // Bosnia — Intl uses "&" but FIFA/UEFA feeds often use "and" or "-"
    "bosnia and herzegovina": "BA",
    "bosnia-herzegovina": "BA",
    "bosnia & herzegovina": "BA",
    // FIFA formal names that differ from Intl.DisplayNames output
    "ir iran": "IR",
    "türkiye": "TR",      // FIFA official since 2022 (was "Turkey")
    turkey: "TR",          // still common in many feeds
    "korea republic": "KR",
    "korea, republic of": "KR",
    "dpr korea": "KP",     // FIFA formal name for North Korea
    "korea dpr": "KP",
    "republic of ireland": "IE", // FIFA/UEFA name (Intl gives "Ireland")
    // Cabo Verde — Intl now returns "Cabo Verde" but FIFA/older feeds say "Cape Verde"
    "cape verde": "CV",
    // Chinese Taipei — FIFA name for Taiwan (ISO TW)
    "chinese taipei": "TW",
    // Trinidad and Tobago — Intl uses "&" but FIFA feeds vary
    "trinidad and tobago": "TT",
    "trinidad & tobago": "TT",
    // Czechia — modern official English name; "Czech Republic" already handled above
    czechia: "CZ",
  });
  return map;
})();

/** Resolve a pool `country` value (alpha-2, ISO/FIFA alpha-3, or English name) to an alpha-2 code, or null. */
export function toIso2(country: string | null | undefined): string | null {
  if (!country) return null;
  const raw = country.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return KNOWN_ISO2.has(upper) ? upper : null; // already alpha-2
  if (/^[A-Z]{3}$/.test(upper)) return ISO3_TO_ISO2[upper] ?? FIFA_TO_ISO2[upper] ?? null;
  return NAME_TO_ISO2[raw.toLowerCase()] ?? null;
}

const REGIONAL_INDICATOR_A = 0x1f1e6; // 🇦
const LETTER_A = "A".charCodeAt(0);

/** Emoji flag for an ISO 3166-1 alpha-2 code, or null for empty/invalid input (never a broken glyph). */
export function flagEmoji(iso2: string | null | undefined): string | null {
  if (!iso2) return null;
  const cc = iso2.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  return String.fromCodePoint(
    REGIONAL_INDICATOR_A + (cc.charCodeAt(0) - LETTER_A),
    REGIONAL_INDICATOR_A + (cc.charCodeAt(1) - LETTER_A),
  );
}

/** Convenience for call sites: a pool `country` value straight to its emoji flag (or null). */
export function countryFlag(country: string | null | undefined): string | null {
  return flagEmoji(toIso2(country));
}
