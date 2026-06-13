/**
 * kitOf — flag-kit jersey backgrounds for the vsfield XI tokens (Direction-A reskin). PURE, no React,
 * no IO. The original 8 were ported from design/design_handoff_vs_the_field/vsfield2/directionA.jsx
 * (`JERSEY_BG_V2`) and REKEYED from FIFA alpha-3 to ISO 3166-1 alpha-2 via the EXISTING flag mapper
 * ({@link toIso2} — src/draft/flag.ts), so the kit library and the flag system share one
 * nation-resolution path (no second alpha-3 table). The remaining 22 WC2026 nations come from the
 * approved Claude Design handoff (design/design_handoff_jersey_gradients) and are dropped in VERBATIM —
 * the gradient values are locked/approved, so they are NOT re-tuned or re-expressed via the helper
 * builders below (those still build the original 8). 30 nations total.
 *
 * England and Scotland have no ISO alpha-2 code, so — exactly like `<Flag>` (app/draft/Flag.tsx) —
 * home nations are resolved by NAME via {@link isHomeNation} before the iso2 path. Anything unmapped
 * falls back to a neutral surface token (never a broken kit, never a crash).
 *
 * The gradient strings are intentionally LITERAL national-flag colors (content imagery, like the flag
 * emoji — exempt from the no-hex/no-gold UI rule per the handoff README; the kit is the flag).
 * GOTCHA (README §render-contract): these are multi-layer backgrounds — callers must never set
 * `background-size: cover` on the jersey, or the layers collapse to a solid block.
 */
import { isHomeNation, toIso2 } from "@/src/draft/flag";

// Gradient builders for the ORIGINAL 8 (ported 1:1 from directionA.jsx). The 22 handoff nations below
// are dropped in as verbatim literals — do not retro-fit them onto these helpers (the values are locked).
const vt = (a: string, b: string, c: string) =>
  `linear-gradient(90deg,${a} 0 33.33%,${b} 33.33% 66.66%,${c} 66.66%)`;
const ht = (a: string, b: string, c: string) =>
  `linear-gradient(180deg,${a} 0 33.33%,${b} 33.33% 66.66%,${c} 66.66%)`;
const vb = (a: string, b: string) => `linear-gradient(90deg,${a} 0 50%,${b} 50%)`;
const dot = (c: string, x: number, y: number, r: number) =>
  `radial-gradient(circle at ${x}% ${y}%,${c} 0 ${r}%,transparent ${r + 0.6}%)`;
const cross = (field: string, bar: string, t = 20) =>
  `linear-gradient(${bar},${bar}) 50% 0/${t}% 100% no-repeat,` +
  `linear-gradient(${bar},${bar}) 0 50%/100% ${t}% no-repeat,${field}`;

/** ISO 3166-1 alpha-2 → CSS background for that nation's flag-kit jersey. */
export const JERSEY_BG_V2: Readonly<Record<string, string>> = {
  // ---- ORIGINAL 8 (shipped; do not redesign) -------------------------------
  AR: `${dot("#F4B32E", 50, 50, 7)}, ${ht("#75AADB", "#fff", "#75AADB")}`, // Argentina
  MX: vt("#006847", "#fff", "#CE1126"), // Mexico
  FR: vt("#0055A4", "#fff", "#EF4135"), // France
  HR: ht("#FF0000", "#fff", "#171796"), // Croatia (plain tricolor — checker replacement HELD, see note)
  US:
    "linear-gradient(#3C3B6E,#3C3B6E) top left/44% 54% no-repeat, " +
    "repeating-linear-gradient(180deg,#B22234 0 7.7%, #fff 7.7% 15.4%)", // USA
  BR: `${dot("#002776", 50, 50, 12)}, ${dot("#FFDF00", 50, 50, 32)}, #009C3B`, // Brazil
  PT: `${dot("#FFE400", 50, 50, 7)}, ${vb("#006600", "#FF0000")}`, // Portugal

  // ---- 22 NEW NATIONS — verbatim from design/design_handoff_jersey_gradients (approved) -----
  // 01 · Sky-blue & sun (deeper celeste + canton sun => not Argentina)
  UY: "radial-gradient(circle at 22% 23%,#F4B32E 0 9%,transparent 9.6%), linear-gradient(#fff,#fff) top left/42% 46% no-repeat, repeating-linear-gradient(180deg,#4F86C6 0 12.5%,#fff 12.5% 25%)", // Uruguay

  // 02 · Vertical tricolors (separated by color set; Senegal star vs Mexico)
  BE: "linear-gradient(90deg,#1A1A1A 0 33.33%,#FAE042 33.33% 66.66%,#ED2939 66.66%)", // Belgium
  CI: "linear-gradient(90deg,#F77F00 0 33.33%,#fff 33.33% 66.66%,#009E60 66.66%)", // Côte d'Ivoire
  SN: "radial-gradient(circle at 50% 50%,#00853F 0 7%,transparent 7.6%), linear-gradient(90deg,#00853F 0 33.33%,#FDEF42 33.33% 66.66%,#E31B23 66.66%)", // Senegal

  // 03 · Horizontal tricolors (NED clean; Ghana star; Spain 1:2:1)
  DE: "linear-gradient(180deg,#1A1A1A 0 33.33%,#DD0000 33.33% 66.66%,#FFCE00 66.66%)", // Germany
  EG: "linear-gradient(180deg,#CE1126 0 33.33%,#fff 33.33% 66.66%,#1A1A1A 66.66%)", // Egypt
  NL: "linear-gradient(180deg,#AE1C28 0 33.33%,#fff 33.33% 66.66%,#21468B 66.66%)", // Netherlands
  GH: "radial-gradient(circle at 50% 50%,#1A1A1A 0 8%,transparent 8.6%), linear-gradient(180deg,#CE1126 0 33.33%,#FCD116 33.33% 66.66%,#006B3F 66.66%)", // Ghana
  ES: "linear-gradient(180deg,#AA151B 0 25%,#F1BF00 25% 75%,#AA151B 75%)", // Spain

  // 04 · Andean yellow/blue/red 2:1:1 (Ecuador emblem dot + cooler blue)
  CO: "linear-gradient(180deg,#FCD116 0 50%,#003893 50% 75%,#CE1126 75%)", // Colombia
  EC: "radial-gradient(circle at 50% 42%,#7A5C2E 0 9%,transparent 9.6%), linear-gradient(180deg,#FFD100 0 50%,#034EA2 50% 75%,#ED1C24 75%)", // Ecuador

  // 05 · Red & white (orientation + motif: bands H / bands V+dot / cross / disc)
  AT: "linear-gradient(180deg,#C8102E 0 33.33%,#fff 33.33% 66.66%,#C8102E 66.66%)", // Austria
  CA: "radial-gradient(circle at 50% 50%,#D52B1E 0 11%,transparent 11.6%), linear-gradient(90deg,#D52B1E 0 28%,#fff 28% 72%,#D52B1E 72%)", // Canada
  CH: "linear-gradient(#fff,#fff) 50% 50%/64% 30% no-repeat, linear-gradient(#fff,#fff) 50% 50%/30% 64% no-repeat, #DA291C", // Switzerland
  JP: "radial-gradient(circle at 50% 50%,#BC002D 0 23%,transparent 23.6%), #fff", // Japan

  // 06 · Red field + centered emblem
  TR: "radial-gradient(circle at 40% 50%,#fff 0 17%,transparent 17.6%), #E30A17", // Türkiye
  MA: "radial-gradient(circle at 50% 50%,#006233 0 19%,transparent 19.6%), #C1272D", // Morocco
  KR: "radial-gradient(circle at 50% 50%,#CD2E3A 0 12%,#0047A0 12% 23%,transparent 23.6%), #fff", // South Korea

  // 07 · Crosses (nordic & saltire) — Scotland is a home nation, see HOME_NATION_KITS
  SE: "linear-gradient(#FECC00,#FECC00) 34% 0/16% 100% no-repeat, linear-gradient(#FECC00,#FECC00) 0 50%/100% 30% no-repeat, #006AA7", // Sweden
  NO: "linear-gradient(#00205B,#00205B) 34% 0/8% 100% no-repeat, linear-gradient(#00205B,#00205B) 0 50%/100% 15% no-repeat, linear-gradient(#fff,#fff) 34% 0/18% 100% no-repeat, linear-gradient(#fff,#fff) 0 50%/100% 34% no-repeat, #BA0C2F", // Norway

  // 08 · Distinct / composite
  CZ: "linear-gradient(135deg,#11457E 0 38%,transparent 38%), linear-gradient(180deg,#fff 0 50%,#D7141A 50%)", // Czechia
};

/**
 * Home nations have no ISO alpha-2 code — keyed by the exact feed name, like `<Flag>`'s SVG path.
 * Scotland's saltire kit is verbatim from the approved jersey-gradients handoff (cluster 07).
 */
const HOME_NATION_KITS: Readonly<Record<string, string>> = {
  England: cross("#fff", "#CF142B", 22), // St George's Cross
  Scotland:
    "linear-gradient(45deg,transparent 43%,#fff 43% 57%,transparent 57%), linear-gradient(135deg,transparent 43%,#fff 43% 57%,transparent 57%), #0065BF", // Saltire
};

/** Neutral fallback for nations without a kit in the library (and null/unknown input). */
export const KIT_FALLBACK = "var(--surface-4)";

/**
 * CSS background for a starter's nation (`StarterView.nation` = the fifa_team.name join — NEVER
 * player.country). Home-nation name first, then the shared name/alpha-3/alpha-2 → iso2 resolution.
 */
export function kitOf(nation: string | null | undefined): string {
  if (!nation) return KIT_FALLBACK;
  if (isHomeNation(nation)) return HOME_NATION_KITS[nation] ?? KIT_FALLBACK;
  const iso2 = toIso2(nation);
  return (iso2 && JERSEY_BG_V2[iso2]) || KIT_FALLBACK;
}
