/**
 * Shared cross-nav config + active-state selector for the three authenticated screens
 * (/draft, /lineup, /vsfield). Presentational only — no auth, no IO. The screens are already gated
 * by `getSessionManager()`; this just lets a signed-in member move directly between them instead of
 * bouncing through the `/` hub (Prompt 16). Kept pure and unit-tested, mirroring `selectLandingView`.
 *
 * Labels are reused VERBATIM from the Prompt-16 hub (`app/page.tsx` FEATURES) so the strip and the hub
 * name the same screens identically. "Home" links back to that hub.
 */
export type NavId = "home" | "draft" | "lineup" | "vsfield";

export interface NavItem {
  readonly id: NavId;
  readonly href: string;
  readonly label: string;
}

// Home first (the back-to-hub anchor), then the three peer feature screens.
export const NAV_ITEMS: readonly NavItem[] = [
  { id: "home", href: "/", label: "Home" },
  { id: "draft", href: "/draft", label: "Draft room" },
  { id: "lineup", href: "/lineup", label: "Set lineup" },
  { id: "vsfield", href: "/vsfield", label: "Vs the field" },
];

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
