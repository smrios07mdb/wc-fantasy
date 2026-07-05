# NAV-LINK thread notes — bottom-nav `<a>` → `next/link` `<Link>` conversion

Branch: `feat/nav-link-conversion` (off `origin/main` @ `ac9e038`). Merge: **HOLD** — routing behaviour on
the live app mid-knockout; Sergio's on-device gate is the closing evidence (the T15-2 / NAV-LAT
precedent). Contract: `audit/NAV_LATENCY_NOTES.md §5` (the conversion analysis, all pre-decided).

This is the payoff step for NAV-LAT: NAV-LAT shipped `loading.tsx` skeletons that paint *sooner* on a
hard MPA nav; converting the tab `<a>`s to `<Link>` makes those skeletons paint *instantly on tap*
(client-side transition), collapsing the post-tap dead-zone that `:active` (T15-2) + skeletons only
shortened.

## 1. What changed (2 source files, additive-in-spirit)

- `app/shell/AppShell.tsx` — the 5 bottom-tab `<a href={item.href}>` in the `.sh-btmnav` map → `<Link
  href={item.href} prefetch={false}>`. Added `import Link from "next/link"`. **AppShell stays a pure
  server component** — `<Link>` does not require `"use client"` (§5 point 5), and none was added. The
  desktop top strip (`.sh-topnav` / `.sh-nav-item`) and the brand link are **untouched, still plain
  `<a>`** — out of scope per SCOPE point 1 (mobile bottom bar is where F-P0-A1 lived).
- `app/shell/MoreSheet.tsx` — the More-sheet item `<a … onClick={close}>` (the mapped items, the
  standalone "Browse players" entry, and the gated Commissioner entry) → `<Link … onClick={close}>`.
  `onClick={close}` is preserved, so the sheet still closes on tap. `import Link from "next/link"`
  added; MoreSheet was already a `"use client"` island.

No change to loaders, APIs, schema, RLS, Realtime, migrations, `crossNav.ts` arrays, `shell.css`, any
`ds.css` copy, or the T15-CUT / Theater surfaces. All byte-untouched.

## 2. Prefetch posture — `prefetch={false}`, deliberate

Every converted `<Link>` carries `prefetch={false}`, with a one-line comment citing NAV_LATENCY_NOTES
§5 at both sites so the choice reads as intentional, not a default.

Rationale (§5 point 2): the fixed bottom bar keeps all 5 tab Links **in-viewport on every authed
screen**, so App Router's default (eager) prefetch would warm all 5 `loading.tsx` boundaries on every
render, re-warmed as the user moves around. Because every authed route is `ƒ` force-dynamic (confirmed
in the build output), prefetch would fetch only the static shell-up-to-Suspense boundary, not page
data — modest, but real on a metered connection and pure amplification given the always-in-viewport
bar. `prefetch={false}` fetches on hover/touchstart instead. This is the conscious starting posture;
it is trivially tunable later if measurement wants eager prefetch back.

## 3. Transition behaviour observed (on the real-Next fixture)

`verify-nav-link.mjs` section A boots a **real Next 15 App Router fixture** (the production authed
routes are `ƒ` force-dynamic + DB-gated, so they can't boot headless — the fixture mirrors the shell's
transition architecture: persistent root layout + per-route server-component nav of the real
`next/link`, a `/slow` route awaiting a delay behind a real `loading.tsx`). Observations:

- **Client-side transition confirmed.** A `window` sentinel stamped *after* hydration **survives** a
  tab tap — no full document reload. The App Router intercepts the click and swaps the route
  client-side.
- **`loading.tsx` fires instantly.** On tapping into `/slow`, the `[data-skeleton]` skeleton paints
  *immediately*, before the delayed content, and clears once content streams in. This is exactly the
  "skeletons become instant, not merely sooner" upgrade §5 predicted.
- **Graceful MPA degradation is a property of the real primitive.** The fixture's SSR HTML carries a
  real `<a href>` for every `<Link>` — so pre-hydration taps navigate as plain anchors (the 5 slots
  are never dead before hydration; only the More `<button>` is JS-gated, unchanged).
- **Active highlight tracks the route.** After a client transition the destination tab becomes
  `.is-active` + `aria-current="page"` (the real app sets this per-route via explicit props — the
  fixture mirrors that; the replica section proves it against the production `shell.css`).

Accepted, NOT fixed here (§5 point 4 / SCOPE out-of-scope): there is no shared authed route-group
layout, so each client transition **re-mounts the route's own `<AppShell>` and re-runs
`loadNavPhase()`** per nav. The highlight still moves correctly and instantly; the nav is simply not
*persistent* across transitions. A truly persistent, non-re-rendering nav is a separate structural
refactor (relocating 11 layouts' shell mount) held as its own future thread.

## 4. Verification (merge evidence)

- **`verify-nav-link.mjs` — 14/14 GREEN** (Playwright + chromium). Two layers:
  - **Section A (real Next fixture):** client-transition sentinel survives, `[data-skeleton]` paints
    before content, `<Link>` SSRs a real `<a href>`, active highlight moves. SKIPs (exit 0) if the
    fixture can't boot, so it never falsely blocks the gate.
  - **Section B (house replica pattern, against real `ds.css` + `shell.css`):** all 5 tabs navigate
    (pre-hydration MPA — the replica ships zero JS, so a click *is* the pre-hydration case), the
    active highlight tracks the landed route, a MoreSheet item navigates, no h-overflow, the bottom
    bar stays flush/full-width at 360/390/430. Plus a source pin: bottom-tab + MoreSheet are `<Link
    prefetch={false}>`, no plain-`<a>` survives in `.sh-btmnav`, AppShell has no `"use client"`.
  - Screenshots: `apps/web/screenshots/nav-link-*.png` (+ `/tmp`).
- **Fence verifiers all pass UNMODIFIED:** verify-the-cut (43), verify-playoffs-hero, verify-players
  (14 — its MoreSheet "Browse players" → /players + Players-tab tap-through cases already exercise the
  converted Links), verify-shell-stacking (33/33 — its tap-through-all-5-tabs + More-item cases
  exercise them too), verify-nav-latency (48/48), verify-mobile-nav.
- **One in-suite test updated, intentionally:** `playersRenderProof.test.ts` pinned the literal
  `<a href="/players" className="sh-more-item"` markup; its **contract** ("MoreSheet carries a Browse
  players entry linking to /players") is unchanged, so the assertion was retargeted to the new `<Link
  href="/players" prefetch={false} …>` markup the conversion produces. The `routeSkeleton.dom.test.tsx`
  SHELL_VOCAB source-drift pin (class-based) stays green **unmodified** — `<Link>` renders an `<a>`
  with the same classes.
- **Full DoD gate green:** `-w typecheck`, `lint`, `format:check`, full test suite **3307 passed / 104
  skipped** (baseline, no regressions), `@app/web build` with every authed route still `ƒ` dynamic
  (`/lineup /vsfield /pool /players /standings /waivers /scoring /settings /playoffs /draft /commish
  /games/[matchId]`).

## 5. A note on the pre-existing jsdom "navigation not implemented" console line

Running the suite emits a `Not implemented: navigation (except hash changes)` line from
`moreSheetChrome.dom.test.tsx:88` (it `fireEvent.click`s a nav link and jsdom schedules a real
navigation on the timer). This is **pre-existing on `origin/main`** — verified by running that test
against the un-converted MoreSheet, where the plain `<a href onClick={close}>` produced the identical
line. It is non-fatal console noise (the test still passes 6/6), not introduced by this conversion.

## 6. Fences honored

`packages/*` untouched; loaders / API / schema / RLS / Realtime / migrations untouched; `crossNav.ts`
arrays byte-untouched; `shell.css` + `ds.css` (all copies) + T15-2 surfaces byte-untouched; T15-CUT +
Theater untouched (verify-the-cut + hero pass unmodified). Only `AppShell.tsx` + `MoreSheet.tsx`
(the conversion), one retargeted test assertion, and the new `verify-nav-link.mjs` + this notes file.
