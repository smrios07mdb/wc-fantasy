"use client";

/**
 * Shared cross-nav strip for the three authenticated screens (/draft, /lineup, /vsfield). Renders ONCE
 * here and is mounted by each screen's route layout — no triplicated markup. Purely presentational: the
 * screens stay gated by `getSessionManager()`; this adds no auth, no routes, no env. It just lets a
 * signed-in member jump straight between the feature screens (and home) instead of bouncing through `/`.
 *
 * Active state is "computed from the current path" via the pure {@link selectActiveNav} helper (the
 * unit-tested seam), fed by `usePathname()` — the canonical App Router active-nav pattern, which is why
 * this is a client component. Styling reuses the existing `ds.css` primitives (`.tabs`/`.tab`/`.is-active`
 * segmented control, `.btn`) inside the screens' dark+cobalt surface — no new CSS.
 *
 * Sign-out is a STATE-CHANGING action → a plain POST form to the existing `/auth/sign-out` route handler
 * (reusing the Prompt-16 hub pattern), not a link. It needs no JS, so it works regardless of this being a
 * client component.
 */
import { usePathname } from "next/navigation";
import { NAV_ITEMS, selectActiveNav } from "@/src/shell/crossNav";

export function CrossNav() {
  const active = selectActiveNav(usePathname());

  return (
    <nav
      aria-label="Primary"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "var(--sp-3)",
        padding: "var(--sp-2) var(--sp-4)",
        background: "var(--surface-1)",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <div className="tabs">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === active;
          return (
            <a
              key={item.id}
              href={item.href}
              className={isActive ? "tab is-active" : "tab"}
              aria-current={isActive ? "page" : undefined}
            >
              {item.label}
            </a>
          );
        })}
      </div>
      <form action="/auth/sign-out" method="post">
        <button type="submit" className="btn btn-ghost btn-sm">
          Sign out
        </button>
      </form>
    </nav>
  );
}
