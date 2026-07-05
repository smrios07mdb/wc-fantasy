# NAV-LAT thread notes — navigation-latency feedback (route loading skeletons)

Branch: `feat/nav-latency-feedback` (off `origin/main` @ 1a8c36d, T15-2 merged). Scope per
SEQUENCE_T15_LAUNCH + T15-2_SHELL_STACKING_NOTES §5/§6 (the F-P0-A1 **residual**: MPA navigation
latency itself — no prefetch, zero `loading.tsx` — cross-ref walkthrough step 7's tab-switch freeze).
Merge: **HOLD** (deliver + await Sergio's decision on the merge AND the Link-conversion clearance).

This thread owns the **latency-feedback content layer**. It does NOT close F-P0-A1 (still *mitigated,
on-device verdict pending* — §6 below). T15-2 shipped the touch-down `:active` press state; this thread
adds the content-level companion: the destination starts painting structure the instant the response
streams, instead of the frozen previous screen sitting there through TTFB.

---

## 1. What shipped (all ADDITIVE — zero edits to any existing file)

15 new files, no modifications to page/loader logic, `shell.css`, `ds.css`, `crossNav.ts`, or any
fenced surface (`git status` = 15 `??`, 0 `M`).

- `apps/web/app/shell/RouteSkeleton.tsx` — shared, cheap, **pure server component** skeleton. Inline
  styles + the ONE existing global `.skeleton` shimmer class from `ds.css` (dark-correct:
  `--surface-2`/`--surface-3`). No new stylesheet, no JS shipped. Six variants map to the destination
  archetypes: `list` (players/standings/pool/waivers/scoring/commish), `pitch` (lineup), `cockpit`
  (vsfield/draft), `board` (playoffs), `form` (settings), `dashboard` (home). Every variant leads with
  a header band (each screen opens with one) over the body archetype, so the real page paints INTO the
  same frame with no layout-shift jump. `role=status` + `aria-busy` + visually-hidden "Loading …".
- 11 route `loading.tsx` (lineup, vsfield, pool, players, standings, waivers, scoring, settings,
  playoffs, draft, commish) — each a one-liner `return <RouteSkeleton variant=… label=… />`. These
  routes mount AppShell in their **layout**, so the skeleton renders inside the layout's `.sh-content`
  and the shell (top strip + bottom nav + active-tab highlight) stays painted around it for free.
- `apps/web/app/loading.tsx` — the `/` (Dashboard tab) loader. Home mounts AppShell inside
  `page.tsx` (not a layout), so this fallback replaces the whole page. It renders its OWN static,
  synchronous shell chrome (top strip + bottom bar, Dashboard active) around the dashboard skeleton —
  deliberately NOT the async `<AppShell>` (an async fallback would suspend and defeat the point). Inert
  (`<span>`s, no JS), reusing the real `shell.css` classes + `crossNav` labels so it can't drift.
- `apps/web/app/shell/routeSkeleton.dom.test.tsx` — Vitest jsdom contract test mounting the **REAL**
  components (10 tests), the anti-drift pin for the harness.
- `apps/web/scripts/verify-nav-latency.mjs` — real-browser proof (below).

## 2. Architecture findings (grounding the design)

- **AppShell is a pure server component** (`app/shell/AppShell.tsx`, no `"use client"`). Active state is
  passed EXPLICITLY per route (`active="lineup"` …), server-rendered — it moves only when the next
  document paints. `MoreSheet` is the ONLY client island in the bar.
- **Shell mount site differs by route.** 11 routes mount `<AppShell>` in `layout.tsx`; `/` and
  `/games/[matchId]` mount it in `page.tsx`. `loading.tsx` is the Suspense fallback for a segment's
  `page.tsx`, rendered INSIDE that segment's layout — so for the 11 layout-mounted routes the shell is
  outside the boundary and survives the loading state automatically. Only `/` needed its own chrome.
- **`/games/[matchId]` is out of scope** — it is a detail route (reached from screens), not a
  bottom-bar / More destination, so it gets no loader this thread.
- **There is NO shared authenticated nav layout.** Every authed route is a direct child of the root
  layout and mounts its OWN `<AppShell>` with a hardcoded `active`. (Relevant to §5's Link analysis.)
- **`/` has four outcomes** (hub / signin / unlinked / denied); only `hub` (authenticated) renders the
  shell+dashboard. The bottom-bar Dashboard tap is always the `hub` case, so the dashboard-in-shell
  skeleton is the correct match. A logged-out cold `/` load flashes the skeleton for the brief
  `getSessionManager()` window before the marketing page — accepted + noted in the file header.

## 3. Verification

`pnpm test` → `routeSkeleton.dom.test.tsx` (10/10): mounts the REAL `RouteSkeleton` (all variants) +
the REAL home `<Loading>`; pins `[data-skeleton]` hooks, `role=status`/`aria-busy`, per-variant bodies,
the `bare` header-band rule, and the home loader's static shell chrome keeping the bottom nav + active
"Dashboard" slot present.

`node apps/web/scripts/verify-nav-latency.mjs` (48/48, Playwright + chromium): renders the **actual**
`RouteSkeleton` (transpile → `renderToStaticMarkup`, no replica — the component has zero non-type
imports) and drives active-state through the **actual** `crossNav` selectors, so what it proves is the
real component output. At 390 + 1180, against real `ds.css` + `shell.css`:
- **(a) streaming** — a server that flushes shell+skeleton FIRST, holds 800 ms, then streams content
  (Next's streaming-SSR sequence): navigating mid-delay paints the `[data-skeleton]` DOM (presence, not
  merely absence of the old page) BEFORE the content marker arrives, for all 12 destinations;
- **(b)** the shell + bottom nav stay visible and the tapped destination stays active-highlighted while
  the skeleton shows (bottom bar at 390; top strip at desktop);
- **(c)** no layout shift — the shell frame (nav rect + content top/left/width) is identical between the
  skeleton phase and the real-content phase (content growing taller downward is legit growth, not a
  shift), and stable when content streams in;
- **(d)** no horizontal overflow at either width, every destination.
Screenshots: `apps/web/screenshots/nav-latency-*.png` (+ `/tmp`) for Sergio's eyeball.

Fence verifiers all pass **unmodified**: verify-the-cut (43), verify-playoffs-hero, verify-players (14),
verify-shell-stacking (33/33). Full DoD gate green (typecheck, lint, format:check, test 3287, web build).

---

## 4. Where this sits vs F-P0-A1 (does NOT close it)

`loading.tsx` on a **hard MPA navigation** (the current plain-`<a>` bar) helps only AFTER TTFB: once the
response starts streaming, the shell + skeleton flush first and content streams in behind them — so the
new screen starts painting structure sooner than waiting for every loader. But the **TTFB dead zone**
(tap → server still thinking → old page frozen) is untouched by `loading.tsx` alone; T15-2's `:active`
covers the touch-down feedback for that window. The piece that collapses the dead zone to ~0 is
**client-side navigation (Link) + prefetch**, where `loading.tsx` fires the instant the tab is tapped —
which is exactly the ANALYZE deliverable in §5, deliberately NOT built here.

So: F-P0-A1 remains **mitigated, on-device verdict pending**. This thread strengthens the mitigation
(content now paints, not just a press flash) but the residual routing behavior is still Sergio's call.

---

## 5. ANALYZE (NOT implemented) — Next `<Link>` + prefetch for the bottom-nav anchors

Current state: the 5 bottom-tab slots are plain server-rendered `<a href>` in AppShell (zero JS); the
More button is the lone client island (`MoreSheet`, `"use client"`); More-sheet items are
`<a href onClick={close}>`. `next/link` is already in the bundle (used once, in `CommishConsole`), so it
is a zero-new-dependency change. Active state is explicit props (no `usePathname`).

**What converting the `<a>`s to `<Link>` changes**

1. **Client-side transitions (the payoff).** Post-hydration, a tap is intercepted by the App Router
   client runtime → no full document reload → the target route renders client-side and its `loading.tsx`
   fires INSTANTLY on tap. This is the change that turns this thread's skeletons from "paint sooner
   after TTFB" into "paint immediately on tap" — collapsing the dead-tap window that `:active` + skeleton
   only shorten.

2. **Prefetch.** App Router auto-prefetches Links in/near the viewport. The bottom bar is fixed, so all
   5 nav Links are ALWAYS in-viewport → all 5 targets get prefetched on every authed screen. Because
   every authed route is `ƒ` force-dynamic (confirmed in the build output), prefetch does NOT fetch full
   page data — it warms only the `loading.tsx` boundary (the static shell up to the Suspense). So the
   skeleton shows with zero network on the transition; data still loads on navigation. Cost: 5 boundary
   RSC payloads per screen (deduped/cached ~seconds), re-warmed as you move around — modest, but real on
   a metered connection. Tunable with `prefetch={false}` (fetch on hover/touchstart instead of eagerly).

3. **Hydration dependency — correcting the brief's framing.** `<Link>` renders a real `<a href>` in the
   DOM, so PRE-hydration a tap still does a normal MPA navigation (graceful degradation — the 5 slots are
   NOT dead before hydration; they just don't get the client-transition/instant-skeleton UPGRADE yet).
   The genuinely dead-until-hydration element remains ONLY the More `<button>` (it has no href to
   follow). So the concern "More-dead-until-hydration would apply to all six slots pre-hydration" is not
   accurate for the 5 anchor slots — converting them to Link keeps their pre-hydration MPA behavior and
   only adds a post-hydration upgrade.

4. **Active-highlight interaction.** No change needed to the active logic (it's explicit props, not
   `usePathname`). BUT: because there is **no shared authenticated nav layout** (§2), a client-side Link
   transition between siblings (e.g. /lineup → /vsfield) re-renders the whole layout subtree from the
   root down — each route's own `<AppShell>` re-mounts and `loadNavPhase()` (a `cache()` memo scoped to
   ONE request) re-runs per navigation. The active highlight still moves correctly and, with
   `loading.tsx`, instantly — but the nav is NOT persistent across transitions (it re-renders each time).
   A truly persistent, non-re-rendering nav needs a shared authed route-group layout that mounts AppShell
   ONCE; that is a larger structural refactor (relocating 11 layouts' shell mount) and is its own thread.

5. **Bundle / perf.** AppShell can stay a **server component** — `<Link>` works in server components and
   does NOT force `"use client"`. Added JS is negligible (Link is already shipped). Net cost is the
   prefetch traffic in (2) plus the client router doing transition work; both small.

**Recommendation**

- **Convert the 5 bottom-tab `<a>`s (and, for consistency, the MoreSheet items) to `<Link>` — yes.** It
  is low-risk (AppShell stays server; Link degrades gracefully pre-hydration; active logic unchanged) and
  it is the specific change that makes this thread's skeletons *instant* rather than merely *sooner*.
- **On prefetch:** start with `prefetch={false}` on the fixed bottom-bar Links (hover/touch-triggered)
  to avoid the always-in-viewport amplification, then measure; default full prefetch is acceptable given
  force-dynamic only warms the boundary. Either way, keep it a conscious choice, not a default.
- **Separately, later (own thread):** a shared authenticated layout route-group that mounts AppShell
  ONCE, so the nav becomes truly persistent across client transitions and `loadNavPhase()` stops
  re-running per nav. It pairs naturally with the Link conversion but is a structural change — hold it
  out of the Link step.
- The `loading.tsx` skeletons in this thread are a prerequisite/complement either way: with Link they
  become the instant transition affordance; without Link they still shorten the post-TTFB paint gap.

**STOP — awaiting Sergio's clearance on the Link conversion. Nothing converted on this branch.**

---

## 6. Fences honored

`packages/*` untouched; every loader/API/schema/RLS/Realtime/migration untouched (skeletons are additive
UI only); `crossNav.ts` item arrays byte-untouched (imported read-only for labels/selectors);
`shell.css` + `ds.css` (all copies) + the T15-2 surfaces byte-untouched (z-scale/sheets/nav CSS
unchanged); T15-CUT + Theater behavior untouched (verify-the-cut + verify-playoffs-hero pass unmodified);
verify-players + verify-shell-stacking pass unmodified.
