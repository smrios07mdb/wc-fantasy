/**
 * `<Flag>` — the SOLE flag-rendering surface for the draft pool (Prompt 33). Renders the emoji flag for an
 * ISO 3166-1 alpha-2 `code` via {@link flagEmoji}'s regional-indicator codepoints. An unknown/empty code
 * degrades to a neutral, glyph-less placeholder (keeps row/chip alignment) — never a broken glyph, never a
 * crash. Flags are CONTENT imagery (a flag containing yellow is not a UI gold accent), so this is exempt
 * from the body's no-gold rule; surrounding chip/control chrome stays cobalt. Swap the flag source later
 * by editing this file + `src/draft/flag.ts` only.
 */
import { flagEmoji } from "../../src/draft/flag";

export function Flag({ code, label, lg }: { code: string | null; label?: string; lg?: boolean }) {
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
