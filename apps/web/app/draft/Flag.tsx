/**
 * `<Flag>` — the SOLE flag-rendering surface for the draft pool (Prompt 33). Renders the emoji flag for an
 * ISO 3166-1 alpha-2 `code` via {@link flagEmoji}'s regional-indicator codepoints. Home nations (England,
 * Scotland) have no ISO alpha-2 code and render as inline SVG instead — checked via `label` before the
 * emoji path. An unknown/empty code degrades to a neutral, glyph-less placeholder (keeps row/chip
 * alignment) — never a broken glyph, never a crash. Flags are CONTENT imagery (a flag containing yellow is
 * not a UI gold accent), so this is exempt from the body's no-gold rule; surrounding chip/control chrome
 * stays cobalt. Swap the flag source later by editing this file + `src/draft/flag.ts` only.
 */
import { flagEmoji, isHomeNation } from "../../src/draft/flag";

function HomeNationSvg({ name, lg }: { name: string; lg?: boolean }) {
  const w = lg ? 26 : 20;
  const h = Math.round(w * 0.6);
  if (name === "England") {
    return (
      <svg
        viewBox="0 0 60 36"
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
        aria-hidden="true"
      >
        <rect width="60" height="36" fill="#fff" />
        <rect x="0" y="13" width="60" height="10" fill="#CE1124" />
        <rect x="25" y="0" width="10" height="36" fill="#CE1124" />
      </svg>
    );
  }
  if (name === "Scotland") {
    return (
      <svg
        viewBox="0 0 60 36"
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
        aria-hidden="true"
      >
        <rect width="60" height="36" fill="#005EB8" />
        <line x1="0" y1="0" x2="60" y2="36" stroke="#fff" strokeWidth="8" />
        <line x1="60" y1="0" x2="0" y2="36" stroke="#fff" strokeWidth="8" />
      </svg>
    );
  }
  return null;
}

export function Flag({ code, label, lg }: { code: string | null; label?: string; lg?: boolean }) {
  if (label && isHomeNation(label)) {
    return (
      <span
        className={"flag-emoji" + (lg ? " flag-lg" : "")}
        role="img"
        aria-label={label}
        title={label}
      >
        <HomeNationSvg name={label} lg={lg} />
      </span>
    );
  }
  const emoji = flagEmoji(code);
  return (
    <span
      className={"flag-emoji" + (lg ? " flag-lg" : "")}
      role={emoji ? "img" : undefined}
      aria-label={emoji && label ? label : undefined}
      aria-hidden={emoji ? undefined : true}
      title={label || undefined}
    >
      {emoji ?? ""}
    </span>
  );
}
