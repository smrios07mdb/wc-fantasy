/**
 * Nation flag chips as CSS gradients (no external image assets) — ported from
 * design/design_reference/draft/data.jsx (`NATIONS` + `flagStyle`). Players carry an ISO-3 `country`
 * code; an unknown/absent code falls back to a neutral surface. Display-only.
 */
export interface Nation {
  name: string;
  gradient: string;
}

export const NATIONS: Record<string, Nation> = {
  ARG: {
    name: "Argentina",
    gradient: "linear-gradient(180deg,#75AADB 0 33%,#fff 33% 66%,#75AADB 66%)",
  },
  FRA: {
    name: "France",
    gradient: "linear-gradient(90deg,#0055A4 0 33%,#fff 33% 66%,#EF4135 66%)",
  },
  ENG: { name: "England", gradient: "linear-gradient(180deg,#fff 0 45%,#CF142B 45% 55%,#fff 55%)" },
  BRA: { name: "Brazil", gradient: "linear-gradient(135deg,#009C3B 0 50%,#FFDF00 50%)" },
  ESP: {
    name: "Spain",
    gradient: "linear-gradient(180deg,#AA151B 0 25%,#F1BF00 25% 75%,#AA151B 75%)",
  },
  GER: {
    name: "Germany",
    gradient: "linear-gradient(180deg,#000 0 33%,#DD0000 33% 66%,#FFCE00 66%)",
  },
  POR: { name: "Portugal", gradient: "linear-gradient(90deg,#006600 0 40%,#FF0000 40%)" },
  NED: {
    name: "Netherlands",
    gradient: "linear-gradient(180deg,#AE1C28 0 33%,#fff 33% 66%,#21468B 66%)",
  },
  BEL: {
    name: "Belgium",
    gradient: "linear-gradient(90deg,#000 0 33%,#FAE042 33% 66%,#ED2939 66%)",
  },
  CRO: {
    name: "Croatia",
    gradient: "linear-gradient(180deg,#FF0000 0 33%,#fff 33% 66%,#171796 66%)",
  },
  USA: { name: "USA", gradient: "linear-gradient(180deg,#B22234 0 50%,#fff 50%),#3C3B6E" },
  MEX: {
    name: "Mexico",
    gradient: "linear-gradient(90deg,#006847 0 33%,#fff 33% 66%,#CE1126 66%)",
  },
  ITA: { name: "Italy", gradient: "linear-gradient(90deg,#009246 0 33%,#fff 33% 66%,#CE2B37 66%)" },
  URU: { name: "Uruguay", gradient: "linear-gradient(180deg,#fff 0 50%,#7AB2DD 50%)" },
  COL: {
    name: "Colombia",
    gradient: "linear-gradient(180deg,#FCD116 0 50%,#003893 50% 75%,#CE1126 75%)",
  },
  JPN: { name: "Japan", gradient: "radial-gradient(circle at 50% 50%,#BC002D 22%,#fff 23%)" },
  KOR: {
    name: "South Korea",
    gradient: "radial-gradient(circle at 50% 50%,#CD2E3A 18%,#0047A0 19% 24%,#fff 25%)",
  },
  SEN: {
    name: "Senegal",
    gradient: "linear-gradient(90deg,#00853F 0 33%,#FDEF42 33% 66%,#E31B23 66%)",
  },
  MAR: { name: "Morocco", gradient: "linear-gradient(135deg,#C1272D 0 55%,#006233 55%)" },
  NGA: {
    name: "Nigeria",
    gradient: "linear-gradient(90deg,#008751 0 33%,#fff 33% 66%,#008751 66%)",
  },
};

/** Inline style for a flag chip from an ISO-3 code (neutral fallback for unknown/absent codes). */
export function flagStyle(code: string | null): { background: string; backgroundSize: string } {
  const nation = code ? NATIONS[code] : undefined;
  return { background: nation?.gradient ?? "var(--surface-3)", backgroundSize: "cover" };
}

/** Friendly nation name for a code, or the code itself (or "" if absent). */
export function nationName(code: string | null): string {
  if (!code) return "";
  return NATIONS[code]?.name ?? code;
}
