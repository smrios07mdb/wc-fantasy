/**
 * The ONE machete silhouette (T15-CUT nav/blade discipline): steel blade, `--elim` red cutting edge,
 * wooden grip — ported from design_reference/the_cut_knockout `vsfield2/knockout.jsx`. Every small
 * blade glyph on the knockout surface (marquee loom, Damocles, cut-line chip, on-the-block tag, the
 * ceremony's machete, the bottom-tab icon) renders THIS shape; never a second silhouette. Kept in its
 * own module so both `components.tsx` (ladder rows) and `KnockoutUI.tsx` import it without a cycle.
 * No gold anywhere (the grip is wood-brown; the edge is the elim red).
 */

/** The full-color machete (marquee loom · Damocles · ceremony). Position/size via `cls` in knockout.css. */
export function Machete({ cls }: { cls?: string }) {
  return (
    <svg className={"ko-mach " + (cls ?? "")} viewBox="0 0 120 44" aria-hidden="true">
      <rect x="1" y="25" width="26" height="12" rx="5" fill="#6B4A2E" />
      <rect x="9" y="25" width="3" height="12" fill="#57391F" />
      <rect x="16" y="25" width="3" height="12" fill="#57391F" />
      <path
        d="M26 26 C48 21 84 15 116 5 C119 11 117 23 100 32 C82 41 52 41 26 40 Z"
        fill="#C4525F"
      />
      <path
        d="M26 23 C48 18 84 12 116 2 C119 8 117 20 100 29 C82 38 52 38 26 37 Z"
        fill="#93A2BC"
      />
      <path
        d="M32 26 C52 22 82 17 106 9"
        stroke="rgba(255,255,255,.4)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The mini blade (cut-line chip + ON THE BLOCK row tag) — same silhouette, `--elim` edge. */
export function MacheteMini() {
  return (
    <svg className="ko-blade" viewBox="0 0 120 44" aria-hidden="true">
      <rect x="1" y="25" width="26" height="12" rx="5" fill="#6B4A2E" />
      <path
        d="M26 26 C48 21 84 15 116 5 C119 11 117 23 100 32 C82 41 52 41 26 40 Z"
        fill="var(--elim)"
      />
      <path
        d="M26 23 C48 18 84 12 116 2 C119 8 117 20 100 29 C82 38 52 38 26 37 Z"
        fill="#93A2BC"
      />
    </svg>
  );
}
