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
- **Source-drift pin (added, pre-merge addendum item 1):** a new `describe` block in
  `routeSkeleton.dom.test.tsx` (the SHELL_VOCAB precedent) reads the REAL `AppShell.tsx` /
  `MoreSheet.tsx` source and asserts (a) both import `next/link`; (b) the bottom-tab bar (sliced to the
  `.sh-btmnav` region, comment-stripped) and the MoreSheet items render as `<Link>` with no plain `<a>`
  surviving; (c) `prefetch={false}` is present on those Links; (d) AppShell has no `"use client"`. This
  pins the PRODUCTION shell source (closing the gap that `verify-nav-link.mjs` section A proves only
  against a generated fixture). **Non-vacuous, verified:** temporarily flipping a bottom-tab `<Link>`
  back to `<a>` fails assertions (b) and (c) (2 failed); restored via `git checkout`.
- **MoreSheet dismiss-on-tap (addendum item 2):** the sheet DISMISSES on item tap (not just navigates)
  is asserted by `moreSheetChrome.dom.test.tsx` — "selecting a More item closes the sheet (navigation
  close path)": it `fireEvent.click`s a real `<Link>` item and asserts `queryByRole("dialog")` is null
  + body overflow cleared. Passes 6/6 post-conversion (the `onClick={close}` state update runs on the
  click regardless of the Link's client nav). The replica in `verify-nav-link.mjs` deliberately does
  NOT fake this (it ships no React) — dismissal is React state, proven in the DOM suite.
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
- **Full DoD gate green:** `-w typecheck`, `lint`, `format:check`, full test suite **3312 passed / 104
  skipped** (baseline 3307 + 5 new NAV-LINK pin cases, no regressions), `@app/web build` with every
  authed route still `ƒ` dynamic (`/lineup /vsfield /pool /players /standings /waivers /scoring
  /settings /playoffs /draft /commish /games/[matchId]`).

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
(the conversion), one retargeted test assertion + the new NAV-LINK source-drift `describe` block (both
in existing test files), and the new `verify-nav-link.mjs` + this notes file.

---

## Close-out — on-device gate PASSED, merged + deployed (2026-07-05)

**On-device gate: PASSED, no findings** (Sergio's live pass — the F-P0-A1 closing-evidence precedent:
the clean live pass itself is the closing evidence for a nav-feel change). Cleared to merge.

**Merged + deployed:** `feat/nav-link-conversion` → `main@909cecf`, `--ff-only`, pushed. Render web
deploy fired and went healthy (public Next build hash changed from the pre-push baseline and settled
stable; `/api/health` 200). The staged brain-doc updates below were applied to `main` as a docs commit
`[skip render]` (BACKLOG NAV-LINK row, PROJECT.md session entry, DECISIONS.md entry, SEQUENCE
derived-status correction). Worktree + branch torn down.

## Staged brain-doc updates (APPLIED at merge, 2026-07-05)

These were DRAFTS pre-gate; APPLIED to the brain files verbatim (dates/SHA/verdict finalized) as a
`[skip render]` docs commit after the on-device gate passed. Retained here as the thread record.

### BACKLOG.md — new NAV-LINK row (insert directly under the NAV-LAT row)

> | **NAV-LINK** | NAV-LAT payoff — convert the 5 bottom-tab `<a>` + the MoreSheet item `<a>` to
> `next/link <Link>` so the `loading.tsx` skeletons fire INSTANTLY on tap (client-side transition), not
> merely sooner after TTFB | Med | S | additive UI (2 shell files) | `DONE` — **MERGED `--ff-only` +
> DEPLOYED** (2026-07-0X, Sergio-cleared after the on-device gate) | `feat/nav-link-conversion` — the
> routing companion to NAV-LAT's skeletons. **AppShell stays a pure server component** (`<Link>` ≠
> `"use client"`); the desktop top strip (`.sh-topnav` / `.sh-nav-item`) + brand link are untouched,
> still plain `<a>` (out of scope). MoreSheet keeps `onClick={close}` on every item so the sheet still
> dismisses on tap. **`prefetch={false}` on every converted Link** (deliberate, §5 point 2: the fixed
> bar keeps all 5 tabs in-viewport, so eager prefetch would warm every `loading.tsx` boundary on every
> authed screen; hover/touchstart fetching is the accepted posture), commented at both sites.
> **Verification:** new `verify-nav-link.mjs` **14/14** (a real Next 15 App Router fixture proves the
> client transition — a post-hydration window sentinel survives the tap, no document reload — + the
> `[data-skeleton]` `loading.tsx` paints instantly before content + `<Link>` SSRs a real `<a href>` so
> pre-hydration MPA degrades gracefully; a class-faithful replica proves MPA tap-through on all 5 tabs
> + active-highlight + MoreSheet nav + no h-overflow) + a new **source-drift `describe`** in
> `routeSkeleton.dom.test.tsx` (5 cases, non-vacuous: reverting a `<Link>` to `<a>` fails it) + the
> existing `moreSheetChrome.dom.test.tsx` proving sheet-dismiss-on-tap. All fence verifiers pass
> UNMODIFIED (the-cut 43, playoffs-hero, players 14, shell-stacking 33/33, nav-latency 48/48,
> mobile-nav). Full DoD gate green (typecheck · lint · format · **3312** · web build — every authed
> route still `ƒ` dynamic). `playersRenderProof.test.ts`'s `<a href="/players">` markup pin retargeted
> to the `<Link>` markup (its /players-linkage contract unchanged). Fences: `packages/*` / loaders /
> API / schema / RLS / Realtime / migrations / `crossNav.ts` arrays / `shell.css` / `ds.css` / T15-2
> surfaces / T15-CUT + Theater byte-untouched. See `audit/NAV_LINK_NOTES.md`. |

### PROJECT.md — session entry (append to the 2026-07-0X log)

> **NAV-LINK — bottom-nav `<a>` → `next/link` `<Link>` (prefetch off).** The routing payoff for
> NAV-LAT: converts the 5 bottom-tab anchors (`AppShell.tsx`, `.sh-btmnav`) and the MoreSheet item
> anchors (`MoreSheet.tsx`) to `<Link prefetch={false}>`, so NAV-LAT's `loading.tsx` skeletons fire
> instantly on tap via a client-side transition instead of merely sooner after TTFB. AppShell stays a
> pure server component. Desktop top strip + brand link untouched (out of scope). `prefetch={false}` is
> the deliberate posture (fixed bar ⇒ all 5 Links always in-viewport ⇒ eager prefetch would amplify).
> Proven by a new `verify-nav-link.mjs` (real Next fixture for the client transition + instant skeleton;
> replica for MPA degradation) and a non-vacuous source-drift pin. Merge HELD for the on-device gate;
> merged/deployed 2026-07-0X. Cross-ref `[[mobile-bottom-nav-layer]]`, NAV-LAT, T15-2.

### DECISIONS.md — new entry (2026-07-0X)

> **NAV-LINK: bottom-nav Links carry `prefetch={false}` (conscious posture, not a default).** The 5
> bottom-tab Links + the MoreSheet item Links convert to `next/link` but with prefetch DISABLED.
> Rationale: the fixed bottom bar keeps all 5 tab Links in-viewport on every authed screen, so App
> Router's default eager prefetch would warm all 5 `loading.tsx` boundaries on every render, re-warmed
> as the user navigates — pure amplification. Because every authed route is `ƒ` force-dynamic, prefetch
> would fetch only the static shell-up-to-Suspense boundary (not page data), but the always-in-viewport
> multiplier makes even that wasteful on metered connections. `prefetch={false}` fetches on
> hover/touchstart instead. Tunable back to eager if measurement wants it; the point is the choice is
> recorded, not defaulted. **Corollary decision — `playersRenderProof.test.ts` retarget:** that test
> pinned the literal `<a href="/players" …>` MoreSheet markup; since the conversion is intentional and
> the test's *contract* (a MoreSheet entry linking to /players) is unchanged, the assertion was
> retargeted to the `<Link>` markup rather than deleted — a source pin tracking a deliberate markup
> change, the shellStacking.contract precedent. **Held for a separate future thread (§5 point 4):** a
> shared authenticated route-group layout so the nav is truly persistent (stops re-mounting AppShell +
> re-running `loadNavPhase()` per client transition). Cross-ref `[[no-reopening-spec-pinned-decisions]]`.

### SEQUENCE_T15_LAUNCH.md — derived-status correction (add under the 2026-07-04 corrections block)

> **Derived-status corrections (2026-07-05):**
> - **F-P0-A1 CLOSED** (Sergio's live on-device pass, verdict A) — the tap-reliability finding that
>   drove A1/T15-2 is resolved; no residual dead-tap case survives the T15-2 + NAV-LAT fix set.
> - **A1 (T15-2) DONE/MERGED** (2026-07-04, `1a8c36d`) — the `TODO`/`FIRST THREAD` label is stale.
> - **NAV-LAT DONE/MERGED+DEPLOYED** (2026-07-04) — the `loading.tsx` skeleton layer shipped.
> - **NAV-LINK delivered, HOLD** (2026-07-05, `feat/nav-link-conversion`) — the `<Link>`+`prefetch=false`
>   conversion; merges after Sergio's on-device gate. Not a Window-A blocker.
> - **Remaining Window A order UNCHANGED:** T15-3 → T15-1 → T15-5 → T15-7, with **T15-6 promoted** and
>   T15-13 still `PROPOSED` (gated on Sergio accepting the thread).
