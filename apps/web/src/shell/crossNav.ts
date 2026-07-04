/**
 * Shared cross-nav config + active-state selectors for the authenticated App Shell.
 * Presentational only — no auth, no IO. The screens are already gated by `getSessionManager()`;
 * this lets signed-in members navigate between screens. Kept pure and unit-tested, mirroring
 * `selectLandingView`.
 *
 * Labels are reused VERBATIM from the Prompt-16 hub (`app/page.tsx` FEATURES) so the top strip
 * and the hub name the same screens identically. "Home" links back to the hub.
 *
 * Mobile nav (Prompt 40): the bottom tab bar shows the primary destinations + More. The primary
 * ids are in BOTTOM_TAB_ITEMS; the More-sheet ids are in MORE_SHEET_ITEMS. (PLAYERS-TAB promoted
 * Players to a 5th primary bottom tab — the 4→5 spacing + tap-reliability are T15-2's, see BACKLOG.)
 */
export type NavId =
  | "home"
  | "draft"
  | "lineup"
  | "vsfield"
  | "standings"
  | "waivers"
  | "players"
  | "pool"
  | "playoffs"
  | "scoring"
  | "settings"
  | "commish";

export interface NavItem {
  readonly id: NavId;
  readonly href: string;
  readonly label: string;
}

/**
 * The commissioner console entry (Commissioner console Thread 1). Kept DELIBERATELY OUT of the always-rendered
 * NAV_ITEMS / BOTTOM_TAB_ITEMS / MORE_SHEET_ITEMS lists — it is `is_commissioner`-gated, so AppShell / MoreSheet
 * render it ONLY when the viewer is a commissioner (`isCommissioner` prop). Design IA §3 places Commissioner in
 * the More overflow / avatar menu (the "elevated privileges" slate entry), never a primary bottom tab.
 */
export const COMMISH_NAV_ITEM: NavItem = {
  id: "commish",
  href: "/commish",
  label: "Commissioner",
};

// Full list for the top strip (desktop ≥640px). Home first, then feature screens.
export const NAV_ITEMS: readonly NavItem[] = [
  { id: "home", href: "/", label: "Home" },
  { id: "draft", href: "/draft", label: "Draft room" },
  { id: "lineup", href: "/lineup", label: "Set lineup" },
  { id: "vsfield", href: "/vsfield", label: "Vs the field" },
  // Dedicated all-play-all standings page (T10) — Matchday + Cumulative tabs. Grouped next to Vs field
  // (its live companion), ahead of the reference pages; mirrors the design IA (The Field → Standings).
  { id: "standings", href: "/standings", label: "Standings" },
  { id: "waivers", href: "/waivers", label: "Waivers" },
  // Full-tournament player browser (PLAYERS-TAB) — the read-only /players directory promoted to a
  // first-class tab, placed adjacent to Waivers (its acquisition companion: an FA row hands a bid
  // off to /waivers via ?bid=). UNGATED / always-render, unlike the is_commissioner COMMISH entry.
  { id: "players", href: "/players", label: "Players" },
  // Match pick'em pool (Prompt 42) — grouped with the gameplay screens, ahead of the reference pages.
  // User-facing label is "Quiniela" (Prompt 45 copy rename); the NavId/route/id key stay "pool".
  { id: "pool", href: "/pool", label: "Quiniela" },
  // Guillotine playoffs theater (Phase 4) — the live knockout screen, with the gameplay group.
  { id: "playoffs", href: "/playoffs", label: "Playoffs" },
  // Scoring rules reference (Prompt 28) — a static, always-available in-app reference page.
  { id: "scoring", href: "/scoring", label: "Scoring" },
  // Settings profile page (Prompt 39) — profile-name rename + deferred sections.
  { id: "settings", href: "/settings", label: "Settings" },
];

// Primary destinations for the mobile bottom bar (<640px). "Home" is relabeled "Dashboard" here
// to signal it is the league overview hub, not just a back-button. Same route, different label.
export const BOTTOM_TAB_ITEMS: readonly NavItem[] = [
  { id: "home", href: "/", label: "Dashboard" },
  { id: "lineup", href: "/lineup", label: "Set lineup" },
  { id: "vsfield", href: "/vsfield", label: "Vs the field" },
  { id: "pool", href: "/pool", label: "Quiniela" },
  // PLAYERS-TAB: Players is a first-class MOBILE bottom tab too (not More-sheet-only). It is kept
  // OUT of MORE_SHEET_ITEMS, so `selectMobileNavPartition` routes it to the bottom bar (bottomActive),
  // never the More overflow. This takes the bottom bar to 5 tabs + More (6 slots) — the tighter
  // spacing + the F-P0-A1 bottom-bar tap-reliability fix belong to T15-2 (see BACKLOG).
  { id: "players", href: "/players", label: "Players" },
];

// Secondary destinations surfaced in the More bottom sheet, in order (per Prompt 40 spec; Phase 4 adds
// Playoffs to the overflow — IA §3 keeps it out of the 4 primary bottom tabs).
export const MORE_SHEET_ITEMS: readonly NavItem[] = [
  { id: "scoring", href: "/scoring", label: "Scoring" },
  { id: "waivers", href: "/waivers", label: "Waivers" },
  // Standings + Playoffs are the two results/seeding screens — grouped together in the overflow.
  { id: "standings", href: "/standings", label: "Standings" },
  { id: "playoffs", href: "/playoffs", label: "Playoffs" },
  { id: "draft", href: "/draft", label: "Draft room" },
  { id: "settings", href: "/settings", label: "Settings" },
];

const MORE_IDS: ReadonlySet<NavId> = new Set(MORE_SHEET_ITEMS.map((i) => i.id));

/* ── T15-CUT: phase-aware nav (executes the T15-4 IA decision; spec §6 "no new tab") ───────────── */

/** The shell's tournament arc — group (incl. pre-kickoff) → knockout → complete. */
export type NavPhase = "group" | "knockout" | "complete";

export interface PhaseNav {
  navItems: readonly NavItem[];
  bottomTabItems: readonly NavItem[];
  moreSheetItems: readonly NavItem[];
  /** The vsfield slot's glyph: the goal-circle (group) or the machete (knockout onward). */
  vsfieldGlyph: "vsfield" | "cut";
  /** Light the vsfield tab's live dot (a knockout round is underway; dark on pend + post-final). */
  vsfieldLiveDot: boolean;
}

/**
 * Derive the phase-aware nav lists. GROUP returns the base arrays BY REFERENCE (byte-identical nav —
 * rider E); knockout/complete relabel exactly two slots on fresh copies: vsfield → "The Cut" (+ the
 * machete glyph; live dot while a knockout round runs) and playoffs → "Theater" (the demoted
 * ceremonial stage). Same ids, same hrefs, same slot count — one mental model: the tab where I see
 * how I stand against everyone.
 */
export function navItemsForPhase(phase: NavPhase, knockoutLive: boolean): PhaseNav {
  if (phase === "group") {
    return {
      navItems: NAV_ITEMS,
      bottomTabItems: BOTTOM_TAB_ITEMS,
      moreSheetItems: MORE_SHEET_ITEMS,
      vsfieldGlyph: "vsfield",
      vsfieldLiveDot: false,
    };
  }
  const relabel = (items: readonly NavItem[]): NavItem[] =>
    items.map((item) =>
      item.id === "vsfield"
        ? { ...item, label: "The Cut" }
        : item.id === "playoffs"
          ? { ...item, label: "Theater" }
          : item,
    );
  return {
    navItems: relabel(NAV_ITEMS),
    bottomTabItems: relabel(BOTTOM_TAB_ITEMS),
    moreSheetItems: relabel(MORE_SHEET_ITEMS),
    vsfieldGlyph: "cut",
    vsfieldLiveDot: phase === "knockout" && knockoutLive,
  };
}

/**
 * Map a pathname (from `usePathname()`) to the active nav id, or null when none applies.
 *
 * Home ("/") matches ONLY the exact root — a `startsWith` check would make it greedily match every
 * path. Feature routes match the exact path, a trailing slash, or any nested sub-path
 * (`/draft/...`) so a future child route still highlights its parent — but NOT a sibling that merely
 * shares the prefix (`/draftroom`), which the `"/" `-delimited boundary check rules out.
 */
export function selectActiveNav(pathname: string): NavId | null {
  for (const item of NAV_ITEMS) {
    if (item.href === "/") {
      if (pathname === "/") return item.id;
    } else if (pathname === item.href || pathname.startsWith(item.href + "/")) {
      return item.id;
    }
  }
  return null;
}

/**
 * Given the active NavId (already resolved by `selectActiveNav` or passed explicitly by a layout),
 * return which bucket it belongs to in the mobile bottom bar:
 *   - `bottomActive`  — the active id if it is a primary bottom-bar tab, else null
 *   - `moreActive`    — the active id if it is in the More sheet, else null
 *   - `moreHasActive` — true when the active screen lives in the More sheet (lights up the More
 *                        button so the user can tell where they are)
 */
export function selectMobileNavPartition(active: NavId | null): {
  bottomActive: NavId | null;
  moreActive: NavId | null;
  moreHasActive: boolean;
} {
  if (active === null) return { bottomActive: null, moreActive: null, moreHasActive: false };
  // `commish` is the gated More-area entry (COMMISH_NAV_ITEM) — it is not in MORE_SHEET_ITEMS, but it lives
  // in the More overflow (IA §3), so treat it like a More item: light the More button, claim no bottom tab.
  const moreHasActive = MORE_IDS.has(active) || active === "commish";
  return {
    bottomActive: moreHasActive ? null : active,
    moreActive: moreHasActive ? active : null,
    moreHasActive,
  };
}
