/**
 * Shared cross-nav config + active-state selectors for the authenticated App Shell.
 * Presentational only — no auth, no IO. The screens are already gated by `getSessionManager()`;
 * this lets signed-in members navigate between screens. Kept pure and unit-tested, mirroring
 * `selectLandingView`.
 *
 * Labels are reused VERBATIM from the Prompt-16 hub (`app/page.tsx` FEATURES) so the top strip
 * and the hub name the same screens identically. "Home" links back to the hub.
 *
 * Mobile nav (Prompt 40): the bottom tab bar shows 4 primary destinations + More. The 4 primary
 * ids are in BOTTOM_TAB_ITEMS; the More-sheet ids are in MORE_SHEET_ITEMS.
 */
export type NavId =
  | "home"
  | "draft"
  | "lineup"
  | "vsfield"
  | "standings"
  | "waivers"
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
