/**
 * kitOf — flag-kit jersey backgrounds for the vsfield XI tokens (Direction-A reskin). PURE, no React,
 * no IO. Ported from design/design_handoff_vs_the_field/vsfield2/directionA.jsx (`JERSEY_BG_V2`) and
 * REKEYED from FIFA alpha-3 to ISO 3166-1 alpha-2 via the EXISTING flag mapper ({@link toIso2} —
 * src/draft/flag.ts), so the kit library and the flag system share one nation-resolution path (no
 * second alpha-3 table). England has no ISO alpha-2 code, so — exactly like `<Flag>`
 * (app/draft/Flag.tsx) — home nations are resolved by NAME via {@link isHomeNation} before the iso2
 * path. Anything unmapped falls back to a neutral surface token (never a broken kit, never a crash).
 *
 * The gradient strings are intentionally LITERAL national-flag colors (content imagery, like the flag
 * emoji — exempt from the no-hex/no-gold UI rule per the handoff README; the kit is the flag).
 * GOTCHA (README §flag-kits): these are multi-layer backgrounds — callers must never set
 * `background-size: cover` on the jersey, or the layers collapse to a solid block.
 */
import { isHomeNation, toIso2 } from "@/src/draft/flag";

// Gradient builders (ported 1:1 from directionA.jsx).
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
  AR: `${dot("#F4B32E", 50, 50, 7)}, ${ht("#75AADB", "#fff", "#75AADB")}`, // Argentina
  MX: vt("#006847", "#fff", "#CE1126"), // Mexico
  FR: vt("#0055A4", "#fff", "#EF4135"), // France
  HR: ht("#FF0000", "#fff", "#171796"), // Croatia
  US:
    "linear-gradient(#3C3B6E,#3C3B6E) top left/44% 54% no-repeat, " +
    "repeating-linear-gradient(180deg,#B22234 0 7.7%, #fff 7.7% 15.4%)", // USA
  BR: `${dot("#002776", 50, 50, 12)}, ${dot("#FFDF00", 50, 50, 32)}, #009C3B`, // Brazil
  PT: `${dot("#FFE400", 50, 50, 7)}, ${vb("#006600", "#FF0000")}`, // Portugal
};

/** Home nations have no ISO alpha-2 code — keyed by the exact feed name, like `<Flag>`'s SVG path. */
const HOME_NATION_KITS: Readonly<Record<string, string>> = {
  England: cross("#fff", "#CF142B", 22), // St George's Cross
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
