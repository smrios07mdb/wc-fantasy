# T15-2 thread notes — shell stacking, z-scale, safe-areas + bottom-nav tap reliability

Branch: `feat/shell-stacking` (off `origin/main` @ f4beefb). Scope per SEQUENCE_T15_LAUNCH →
T15-2. This file records the **F-P0-A1 diagnosis (written before any fix)**, the measured
z-map, and the fix plan. Merge: **MERGED `--ff-only` 2026-07-04 after clearance** (was HOLD);
F-P0-A1 remains *mitigated, on-device verdict pending* (§6).

---

## 1. F-P0-A1 diagnosis — bottom-nav taps frequently not registering (Safari + PWA, hardware-confirmed)

Evidence base: `apps/web/app/shell/AppShell.tsx` (server component; tabs are plain `<a>`),
`apps/web/app/shell/MoreSheet.tsx` (the only client island in the bar),
`apps/web/app/shell/shell.css`, `apps/web/app/layout.tsx`, full z/pointer-events/fixed-position
inventory of `apps/web` (greps recorded below), walkthrough N1 + step 7 + step 27.

### Ruled out

- **R1 · Scrim/z-index tap-swallowing in the resting state.** Every overlay in the app is
  conditionally rendered, never mounted-but-transparent: MoreSheet backdrop+sheet render inside
  `{open && …}` (MoreSheet.tsx:69-71 area), `.wv-scrim` mounts only while the composer is open
  (BidComposer.tsx:113-121), `.pc-scrim` only with a selected card (FaPlayerCardSheet.tsx:55),
  `.pl-modal-overlay` only with `openManagerId` (PoolClient.tsx), `.sl-forfeit-overlay` only for
  an open score sheet/forfeit confirm, KO drill-in/ceremony only in their states. A repo-wide
  `pointer-events` grep shows nothing that could deaden the nav. In the no-modal state the nav
  (z-100) is the top of the stack. **Not the cause of N1** (N1 reproduces with no modal open).
  The *inverse* defect is real and separate: with a modal OPEN, the inverted z-scale (scrims
  z-40…95 < nav z-100) leaves the nav tappable above the scrim — mid-flow taps silently
  navigate away (F-P1-I1; fixed this thread).
- **R2 · Blocked/passive tap handlers.** There are no JS handlers on the 5 route tabs at all —
  AppShell is a pure server component and the tabs are plain `<a href>` MPA links; nothing
  preventDefaults, nothing attaches listeners (passive or otherwise). Nothing to block.
  (Bounded exception → C4.)
- **R3 · 300 ms tap delay / viewport misconfig.** Next App Router emits
  `width=device-width, initial-scale=1` by default; `layout.tsx:37-42` only adds
  `themeColor` + `viewportFit: cover`. No legacy double-tap-zoom delay conditions.

### Confirmed / plausible contributors

- **C1 · PRIMARY (code-verified): zero tap feedback + full-document navigation latency reads as
  "tap did not register".** Every tab is an MPA `<a>`; `-webkit-tap-highlight-color: transparent`
  (shell.css:208) strips iOS's only default press feedback; there is **no `:active` style** for
  `.sh-btnav-item`; the active-tab highlight is **server-rendered**, so it moves only when the
  *next document* paints; there are **zero `loading.tsx` files** in `apps/web/app` (and
  loading.tsx would not fire for MPA loads anyway); no prefetch (`next/link` unused in the
  shell). On live Render mid-tournament (SSR + auth + multi-table loaders per route) TTFB of
  0.5–3 s is realistic: tap → *nothing changes on screen for seconds* → operator re-taps
  (restarting the navigation) → "highly unresponsive most of the time". Matches N1's exact
  observations ("navigation didn't fire, active-tab highlight didn't move") and step 7
  ("old screen frozen, no loading.tsx"). **In-scope fix:** instant pressed-state feedback
  (`:active` + restored subtle tap-highlight + `touch-action: manipulation`).
- **C2 · Hit-area squeeze at/below 360px and under iOS text zoom (code-verified geometry).**
  `.sh-btnav-item` is `flex: 1` with `white-space: nowrap` and flexbox's default
  `min-width: auto` — a slot can never shrink below its label's min-content. Label min-content
  sums (11px/600): group set ("Dashboard·Set lineup·Vs the field·Quiniela·Players·More")
  ≈ 340px, knockout set ("The Cut" + live dot) ≈ 330px. At 360–430px the bar fits but slots go
  *uneven* — the narrow "More"/"Players" slots compress toward ~40px, **under the 44px target**,
  while at ≤340px effective width (320-class devices, iOS Larger-Text) the bar **overflows the
  viewport**, pushing "More" off-screen and shifting every hit area away from its visual
  position. **In-scope fix:** equal slots (`flex: 1 1 0; min-width: 0`) + label ellipsis guard →
  every slot = width/6 ≥ 60px at 360, no overflow at any width. (Accepted cosmetic trade-off:
  the long group-phase label "Vs the field" ellipsizes on phones; the live phase is knockout
  ("The Cut" — fits), and the label set itself is fenced product config.)
- **C3 · iOS Safari bottom-toolbar-restore dead zone (browser mode) — runtime-only, cannot be
  ruled in/out from code.** With Safari's bottom toolbar minimized, the bottommost band of the
  visual viewport is Safari's own tap-to-restore zone, and `env(safe-area-inset-bottom)` is
  0/small in browser (non-standalone) mode, so the first tap in that band re-expands the
  toolbar instead of reaching the page. The nav is flush `bottom: 0`. Standard mitigations are
  exactly C1's feedback (so the swallowed tap is *visibly* swallowed) — no code defect to point
  at. PWA standalone is already handled (`padding-bottom: env(safe-area-inset-bottom)`,
  shell.css:181).
- **C4 · More button dead until hydration (bounded, that one button only).** The More `<button>`
  is React `onClick` inside the MoreSheet client island — taps before hydration completes do
  nothing. Small island, bounded window; recorded, no structural fix this thread (the 5 route
  tabs are no-JS and unaffected).
- **C5 · Cross-thread (T15-3 owns the fix): post-input-zoom viewport offset.** Every text input
  renders <16px (F-P1-I2), so iOS zooms on focus and the zoom persists; fixed elements then
  position against the layout viewport while the user sees the visual viewport — the nav can
  render offset/partly off-screen and taps at its apparent position miss. Any session touching
  the waivers search (as the walkthrough did) enters this state. T15-2's feedback makes the
  miss visible; the root fix (16px form controls) is T15-3's.

**Root-cause verdict:** F-P0-A1 is *not* one defect. It is C1 (feedback/latency — dominant,
matches all recorded evidence) compounded by C2 at narrow widths, C3 in browser mode, and C5
after any input focus. All in-scope pieces are visual-only and fixed this thread; the *residual*
— MPA navigation latency itself (no prefetch, no loading affordance for full-page loads) — is
an architecture concern **outside T15-2's visual-only fence, reported for clearance** (a future
thread could adopt `next/link` prefetch or a navigation progress affordance; both touch
routing/behavior, not chrome CSS).

### Step-27 mechanics (folded into F-P1-I1 by the audit, but a distinct mechanism)

The instant-pickup composer is **not a modal** — `FreeAgentPanel` renders an in-flow
`<section class="wv-fa">` (FreeAgentPanel.tsx:99) inside the natural-scroll claims page. Its
bottom (drop-picker + "Add free agent" confirm) lands under the fixed nav, and *page* scrolling
can't be initiated because the section's touch surface is dominated by two nested internal
scrollers — `.wv-comp-list` (min 240 / max 420px, waivers.css:641-647) and `.wv-drop-pick`
(max 220px, waivers.css:818-824) — which consume vertical gestures (a 40-row FA pool never
exhausts, so scroll-chaining to the page never happens under the finger). Z-lifting does
nothing for an in-flow section; the fix is **layout order**: at the 1-column breakpoint the
confirm column (`.wv-comp-config`: Adding · drop-picker · confirm) moves **above** the pool
list (`order: -1`, scoped `.wv-fa`-only), so the action row sits directly under the panel
header — always reachable without threading page-scroll between inner scrollers — plus a
tighter dvh-aware cap on the mobile pool list. The *sealed-bid* composer (`.wv-scrim` modal)
is the true z-inversion instance and is fixed by the z-scale + dvh + containment work.

---

## 2. Measured z-map at <640px (before)

Nav `.sh-btmnav` **z-100** (shell.css:177); More backdrop 101 / sheet 102.

| Surface | z | vs nav |
|---|---|---|
| commish `.adm-viewas-menu` (dropdown, absolute) | 40 (commish.css:359) | under |
| pool drill-in `.pl-modal-overlay` | 50 (pool.css:361) | **under — broken** |
| shared player card `.pc-scrim` (lineup/vsfield/games + base) | 80 (ds.css:430 ×5 copies) | **under — broken** |
| draft toasts `.dr-toasts` (fixed, bottom:16px) | 80 (draft.css:449) | **under — broken** |
| waivers bid composer `.wv-scrim` | 90 (waivers.css:558) | **under — broken** |
| waivers FA card `.wv-app .pc-scrim` | 95 (waivers.css:770) | **under — broken** |
| More backdrop / sheet | 101 / 102 (shell.css:225,235) | above ✓ |
| The Cut drill-in `.ko-sheetwrap` | 110 (knockout.css:566) | above ✓ |
| KO ceremony `.koc` / players card `.pl-app .pc-scrim` | 120 (knockout.css:681, players.css:607) | above ✓ |
| forfeit overlay / score sheet `.sl-forfeit-overlay` | 200 (PlayerScoreSheet.css:20, lineup.css:638) | above ✓ |

`/players` already carries a route-scoped lift to 120 whose comment names "the T15 rule" —
this thread promotes that rule to the documented global scale.

**Cascade trap:** the four per-route ds.css copies (draft/lineup/vsfield/_landing) are
byte-identical to `app/styles/ds.css` and later in import order — fixing only the canonical
copy would be silently re-overridden. All five change identically (appShell.test.ts pins the
byte-identity).

## 3. The z-token scale (after)

Declared once in ds.css `:root` (all five copies):

```
--z-nav: 100            fixed shell chrome (bottom tab bar)
  (101/102 reserved: the shell's own More backdrop/sheet — nav+1/nav+2)
--z-overlay: 120        every route modal/sheet scrim — paints ABOVE the nav
--z-overlay-stack: 130  a second overlay stacked on an open overlay (FA card over bid composer)
--z-takeover: 200       full-screen takeovers (score sheet, forfeit confirm)
```

KO surfaces (110/120) already satisfy the scale and are left byte-untouched (T15-CUT fence;
verify-the-cut.mjs / verify-playoffs-hero.mjs must pass unmodified). Nav additionally goes
pointer-inert while any scrim is open (`body:has(...)` guard — belt-and-braces on top of the
scrim covering it at higher z).

## 4. Fix plan by finding (see PROJECT.md session log for the executed diff)

1. **F-P0-A1** — `:active` pressed state + subtle tap-highlight + `touch-action: manipulation`;
   equal-slot bar (C2); z-correction removes the open-scrim silent-navigate mode. Residual C1
   latency reported (out of scope), C5 → T15-3.
2. **F-P1-I1** — token scale above; pool 50→overlay, pc-scrim 80→overlay, wv-scrim 90→overlay,
   wv-app pc-scrim 95→overlay-stack, dr-toasts 80→overlay (+ mobile bottom offset clear of the
   nav band), adm-viewas-menu 40→overlay; nav inert under scrim; `.pl-app` override retired
   (base now 120).
3. **F-P1-C1** — `.sl-savebar` sticky bottom offset = `calc(58px + env(safe-area-inset-bottom) + 10px)`
   at <640px (matches the shell's own clearance constant), desktop unchanged.
4. **F-P2-I6/I7** — `overscroll-behavior: contain` on every *modal* internal scroller (modal-scoped
   for the shared `.wv-comp-*` classes — the in-flow FA panel must keep chaining to the page);
   shared `useSheetChrome` body-scroll lock on every sheet/modal; 85/88/90vh→dvh; scrim padding
   gets `env(safe-area-inset-*)`; 60vh empty states → 60dvh; lineup root 100vh→100dvh.
5. **F-P2-PSC1** — both card sheets restructured to non-scrolling chrome (✕ + header + tab strip)
   over an internal scrolling body; close targets ≥44px.
6. **F-P2-A4 + F-P3-A1** — MoreSheet grabber + title + close ✕ + `aria-modal` + focus trap +
   Escape + body lock.
7. **F-P3-A2** — `env(safe-area-inset-left/right)` on bar, More sheet, topbar, content.
8. **F-P3-G3** — `.adm-console` bottom padding clears nav band + home indicator at <640px.
9. **6-slot spacing** — equal slots, ≥44px, no overflow at 360/390/430 (C2 above);
   `crossNav.ts` arrays byte-untouched.

Verification: `verify-shell-stacking.mjs` (pw.local replica harness, house style) — see script
header for the assertion list; plus the unmodified T15-CUT/Theater harnesses.

---

## 5. Outcome (post-implementation)

All of §4 executed as planned, plus one discovery: **the bid composer rendered 780px wide at
phone widths** (`.wv-composer { width:780px; max-width:100% }` — the percentage max-width
resolves against the auto grid track the fixed width itself sized, inside the grid-centered
`.wv-scrim`), pushing the ✕ AND the Place-bid row off-screen right. Caught by the new harness,
fixed with the sibling `.pl-modal` pattern (`width: min(780px, 100%)`). The modal composer also
gained `.wv-comp-body` internal scroll at ≤768px (the dvh-capped `overflow:hidden` composer had
no scroll surface for the stacked 1-col panels — the actions row was stranded).

Proof: `verify-shell-stacking.mjs` **33/33** (360/390/430 + desktop; screenshots
`apps/web/screenshots/shellstack-*.png`); `verify-the-cut.mjs` **43/43** + `verify-playoffs-hero.mjs`
green **UNMODIFIED**; `verify-players.mjs` 14/14; `verify-mobile-nav.mjs` + `verify-page-fit.mjs`
green. Vitest: **3277 passed / 104 skipped** (+`shellStacking.contract` 17 · `moreSheetChrome.dom` 6
· `useSheetChrome.dom` 3). Full DoD gate green. Merge **HELD** for Sergio.

Residuals handed forward: MPA navigation latency (C1's root — prefetch/progress affordance =
routing behavior, own clearance); C5 input-zoom → T15-3; More-button pre-hydration deadness
(bounded, recorded); group-phase "Vs the field" label may ellipsize on phones (accepted — the
live phase is knockout and the label set is fenced config).

## 6. F-P0-A1 status — MITIGATED, on-device verdict PENDING (not fixed/closed)

Recorded explicitly (2026-07-04, post-gate): this thread's fix set addresses every in-scope
contributor (C1 feedback, C2 geometry) and the z-inversion failure mode, but the finding is
**not closed**. The latency theory (C1) does not fully explain N1's "navigation didn't fire
across multiple attempts" unless those attempts under-waited the TTFB — a plausible but
unproven reading. What the fix set DOES guarantee is that the two outcomes are now
**distinguishable on hardware**: the `:active` pressed state fires on touch-down, so
- pressed-state flashes + navigation eventually lands ⇒ C1 confirmed (feedback/latency);
- pressed-state flashes + nav still dies ⇒ a residual cause survives this fix set (C3/C5 or
  something unmodeled) — reopen with that new evidence;
- no pressed-state at all on a tap ⇒ the touch never reached the bar (hit-testing/viewport
  offset lane).

**Sergio's live pass is the closing evidence either way.** Until then the BACKLOG carries
F-P0-A1 as *mitigated, verdict pending*.

**Residual as its own thread:** the MPA navigation latency itself (no prefetch, zero
`loading.tsx` — cross-ref walkthrough step 7's tab-switch freeze, an F-P2) is **proposed as a
separate clearance-gated micro-thread** (options: `next/link` prefetch on the nav surfaces, or
a navigation progress affordance). Routing behavior, deliberately NOT on this branch.

## 7. Measured label-truncation facts (probe, real browser, both phase label sets)

The §1-C2 "accepted trade-off" is narrower than first estimated — measured with the production
ds.css+shell.css at the three target widths (`.sh-btnav-item > span` scrollWidth vs clientWidth):

| Width | knockout set (Dashboard·Set lineup·The Cut(+dot)·Quiniela·Players·More) | group set (… Vs the field …) |
|---|---|---|
| 390px | **all labels fit** | **all labels fit** |
| 430px | **all labels fit** | **all labels fit** |
| 360px | Dashboard +7px · Set lineup +3px · The Cut +1px ellipsized | Dashboard +2px · Vs the field +3px ellipsized |

So on Sergio's ~390px hardware nothing truncates in either phase. At 360px only, the widest
labels lose their last 1–2 glyphs to an ellipsis; on the knockout set the live dot sits inside
the label span, so during a live round at 360px the dot can be clipped with the overflow
(1px over — borderline; the `is-active` accent color still marks the tab). Accepted: equal
≥44px slots at every width beat 1–7px of label at the narrowest class of device, and the label
set itself is fenced product config (T15-4's).
