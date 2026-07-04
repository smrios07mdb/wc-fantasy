# Handoff: The Cut — unified knockout surface (Vs the Field × Playoffs)

## Overview
This session unified two live surfaces of the **XI** World Cup fantasy app for the guillotine
knockout phase. The old `/playoffs` ladder was a dead-end read-out (no row was tappable); the old
`/vsfield` had the H2H drill-in but no guillotine framing. **Decision (Shape B hybrid): `/vsfield`
becomes the ONE knockout surface, relabeled "The Cut" during knockout rounds.** It keeps everything
it had (live all-play-all field, period strip, Season power record, manager H2H drill-in, player
score sheets) and gains the guillotine framing: theater marquee, YOU band with margin-to-the-blade,
cut line + ON THE BLOCK zone, "the fallen" section, and a full-screen **cutting ceremony** takeover
when round results go official. `/playoffs` demotes to a purely ceremonial theater (no logic).

## About the Design Files
Everything in this bundle is a **design reference built in HTML/React (Babel-in-browser prototypes)**
— it shows intended look and behavior, it is NOT production code to copy. The task is to **recreate
these designs in the real Next.js (App Router) + React + TS + Tailwind codebase** using its
established patterns. The presenter chrome (sim bar with clock scrubber, ⚔/🪓 buttons, browser/iPhone
frames, fit-scaling stage, Tweaks panel) is design-review scaffolding — **discard it**; production
state comes from the live scoring feed.

## Fidelity
**High-fidelity.** Colors, type, spacing, copy, and interactions are final and token-exact
(`ds/ds.css` is the single source of truth; it maps 1:1 to the Tailwind theme handoff already in the
repo docs). Recreate pixel-perfectly.

## The two deliverables in this bundle

### 1. `The Cut (Unified Knockout).html` — static direction mockups + ticket spec
Six 390×852 phone frames on a pan/zoom canvas plus an implementation-spec panel:
- **a** — live round, viewer surviving (canonical screen)
- **b** — viewer ON THE BLOCK (Damocles machete over the YOU band)
- **c** — viewer eliminated, spectating a later round (fallen auto-expanded)
- **d** — drill-in bottom sheet (3 ranked facts + opponent XI pitch)
- **e** — champion endgame (theater owns the hero; tab live-dot dark)
- **f** — round locked, awaiting official results (pending/ytp treatment)
Read the on-canvas spec panel — it is the authoritative interaction spec (summarized below).

### 2. `Vs the Field.html` + `vsfield2/` — the LIVE prototype with knockout folded in
The working surface, desktop (1180×812) + mobile (402×860 iPhone) driven by one shared sim.
`vsfield2/knockout.jsx` + `vsfield2/knockout.css` contain ALL new knockout code; the diffs to
`app.jsx` / `directionA.jsx` / `mobile.jsx` are small and greppable (`ko`, `KO*`).

## Screens / components (knockout mode)

### KOMarquee — compact theater strip
Full-width strip under the app header (desktop: above the match strip; mobile: top of scroll).
44px min-height; border `rgba(229,72,77,.28)`; bg `linear-gradient(90deg, var(--elim-soft), var(--surface-1) 55%)`;
radius 12px. Contents: **trophy mark** (`logo/trophy.png`, 44×52 desktop / 38×46 mobile,
rotate(-7°), bursts out of the strip via negative margins, idle bob 4.5s) with a **machete looming
overhead** (82px svg, rotate −24°→−12° sway 3.8s, transform-origin 12% 88%); title
`LOWEST {cut} GET THE CHOP` (Schibsted 800, 12.5px, ls .05em); sub `{n} standing · {n−cut} advance ·
cut at full time` (Hanken 600 10.5px, `--text-secondary`); right: `Theater ›` pill link → the
ceremonial theater route. **Pending variant** (round locked, results not official): title
`THE BLADE DROPS SOON`, sub `Full time · official after stat corrections`.

### KOYouBand — the #1 glanceable fact
44px min-height band; icon + words + big margin number (Schibsted 800 18px, tabular). Variants
(always color + icon + word, never color alone):
- **safe** — `✓ Surviving · 4th of 10` / `Tap a row to compare` / `+16` `clear of the blade`;
  bg `--accent-soft`, border `--accent-ring`, number cobalt (accent marks YOU).
- **block** — `⚠ ON THE BLOCK · 9th of 10` / `Need {x} pts — {ytp} to play` / `−4` `behind the
  blade`; bg `--danger-soft`, number `--danger`; a **machete of Damocles** hangs over the band
  (70px, rotate 110°↔127° pendulum 2.6s, origin 50% 0%).
- **pend** — `⏳ Provisionally safe` / `Order can move on corrections` / `+16` `clear at full time`;
  bg `--ytp-soft`, number `--ytp`.
Mobile adds a right pts cell (`{total}` JetBrains 700 13px + "pts") behind a hairline divider.
Margin math: safe → `me.total − alive[cutIndex].total`; block → `me.total − alive[cutIndex−1].total`
(negative). Margin `0` → label `level — tiebreak applies`. The margin updates live, never throttled.
**Blade discipline (locked rule): exactly ONE machete per screen — the marquee loom is hidden
whenever the Damocles blade shows (`!ko.onBlock`).**

### Ladder (the standings list)
The existing leaderboard rows, with: alive managers re-ranked 1..N (eliminated excluded), every row
one ≥44px tap target → H2H drill-in. In knockout the sub-line of a below-the-line row swaps to
**machete icon + "on the block"** (`--elim`, 700) and the row gets `--elim-soft` bg + 3px inset
`--elim` left stripe (if the row is YOU, the stripe stays cobalt). W/L margin chip vs you
(`W +16` / `L −12`) unchanged. The desktop "You vs the field" aggregate button is **hidden in
knockout** (its record-vs-everyone includes the dead; the YOU band replaces its job).

### KOCutLine
Between last-safe and first-on-the-block rows: two gradient beams fading outward
(`linear-gradient(90deg, transparent, rgba(229,72,77,.8))`) flanking a glowing pill chip
`🔪 CUT LINE · LOWEST {cut}` — Schibsted 800 9px ls .08em, color `#FF6B70`, bg `rgba(229,72,77,.14)`,
border `rgba(229,72,77,.55)`, glow `0 0 12px rgba(229,72,77,.3)`.

### KOFallen — "the fallen"
Resolves the old hides-vs-shows conflict: **one ladder, two sections.** Collapsed header row by
default: `▸ THE FALLEN (n)` + hairline; expanded: struck-through rows (opacity .62, name
line-through `--text-secondary`, right tag `cut in R32` in JetBrains 600 10px `--elim`, chevron).
Fallen rows stay tappable → the same H2H drill-in. **Auto-expand when the viewer is among the
fallen** (mock state c). Older rounds compress to one summary line per round.

### Drill-in (existing, unchanged — the reason for the merge)
Row tap → in-place H2H: 3-ranked-fact compare band (1 margin, 2 upside-still-to-play, 3 biggest
player edge), You/Opponent XI as flag-kit formation pitches, player tap → score-breakdown sheet.
Production spec: mobile opens it as a **bottom sheet pushing `?m=<managerId>`** so the hardware
back-gesture closes it; sheet pins to the MANAGER (its rank/pts update live in the header); the
ladder re-sorts freely underneath — FLIP moves ~300ms, throttled to one re-sort per 10s window; a
row crossing the cut line flashes its new state with icon + word.

### KOCeremony — the cutting ceremony (takeover)
Full-frame overlay (z 80) on a near-opaque backdrop: maroon radial
`radial-gradient(90% 70% at 50% 30%, rgba(176,85,99,.22), transparent 72%)` over `rgba(5,7,10,.95)`.
**Phase machine** on mount: `armed` → 700ms → `wind` → 1900ms → `drop` → 2450ms → `aftermath`.
- armed: eyebrow `{R16} · RESULTS OFFICIAL` (Schibsted 900 10px ls .24em `#FF6B70`), headline
  `LOWEST {cut} GET THE CHOP` (Schibsted 900 30px desktop / 23px mobile), sub "The Chocoyo doesn't
  miss."; trophy (140×160 / 116×134) gripping the machete (132px / 108px, rotate −20°, origin 14% 86%);
  victims (= `alive.slice(cutIndex)` at lock) below: avatar + name + pts.
- wind: machete rotates to −76° over 1.05s (ease-out).
- drop: machete slams to +36° in .16s (ease-in); white-hot slash bar sweeps (opacity class-driven);
  screen shake keyframe .45s (transform only, gated on `prefers-reduced-motion`).
- aftermath: headline `THE BLADE HAS FALLEN`; victims get `.is-out` → blood splatter behind avatar
  (layered radial-gradients, opacity 0→.95 via class), struck name, white-bordered **"Eliminated!"**
  stamp (900 12px, bg `--danger`, 2px #fff border, rotate −12°, pops scale .6→1) positioned at the
  avatar's lower edge (top 36px — never covering the face); verdict line — cobalt
  `✓ You survive — 4th of 10 · +16 clear` or elim `✗ Your run ends here — 9th of 10`; FAAB line
  `FAAB resets to $100 — reinforce via waivers` (links to the waivers route); CTA `Back to the ladder`.
Tap scrim = skip to aftermath; tap again or CTA = dismiss. **Trigger in production: server event when
round results are confirmed official** (NOT at full time — the `pend` state covers that window).
**Reveal opacity must be class-driven; only transform animates** (repo-wide gotcha).

## Navigation
No new tab. The existing Vs-the-field bottom-tab slot **relabels by phase**: "Vs the field" (group)
→ **"The Cut"** + machete glyph + live dot (knockout) → live dot dark post-final. "Playoffs" leaves
the More sheet; More keeps a "Theater" link to the ceremonial stage. All small blade glyphs (tab
icon, cut-line chip, block tag) share ONE machete silhouette: steel `#93A2BC` blade, `--elim` red
cutting edge, wood `#6B4A2E` grip (SVG in `vsfield2/knockout.jsx`).

## State Management
`knockoutContext(field, t, cut)` (see `vsfield2/knockout.jsx`) is the single derivation — port it:
- inputs: live ranked field, clock, commissioner cut count (2, tweakable to 3)
- `alive` = ranked minus eliminated ids, re-ranked 1..N (VARIABLE N — never hardcode 12)
- `cutIndex = max(1, N − cut)`; `onBlock = myIdx >= cutIndex`; margin per YOU-band rules above
- `pend = t >= periodEnd` (round locked, results provisional)
- `fallen` = eliminated managers + the round they were cut
Ceremony visibility is separate UI state (server-triggered event in production). Eliminated
managers keep their historical snaps so fallen-row drill-ins work.

## Design Tokens (subset used; full set in ds/ds.css)
- Surfaces: `--surface-0 #0A0D12`, `--surface-1 #11151C`, `--surface-2 #181D27`; hairline `rgba(255,255,255,.08)`
- Text: `#F1F4F9` / `#A6B0C0` / `#6C7689`
- Accent (YOU + primary actions ONLY): cobalt `#4D8DFF`, soft `rgba(77,141,255,.16)`
- Functional: live `#FF4D4D` · locked `#7E8DA8` · ytp `#E2873C` · win `#2FBF71` · loss/danger `#E5484D` · **eliminated `#B05563`** (+ 16% soft variants). GOLD IS BANNED (trophy PNG is the one sanctioned gold).
- Type: Schibsted Grotesk (display/scores) · Hanken Grotesk (UI) · JetBrains Mono (timers/raw stats, tabular)
- Radii: 6/8/12/16/999; motion: 120/180/260ms, ease `cubic-bezier(0.2,0,0,1)` / out `(0.16,1,0.3,1)`
- Min tap target 44px; safe-area aware above the fixed bottom tab bar; light theme first-class via tokens.

## Assets
- `logo/trophy.png` — the XI brand mark (gold trophy + Chocoyo parrot). Mascot/theater use only.
- `logo/icon-tile.png`, `logo/icons/*` — brand badge + favicons.
- Machete: inline SVG (in `vsfield2/knockout.jsx` and duplicated in the static mock) — no image asset.

## Screenshots
In `screenshots/` — captured from the design files for quick reference:
- `01-mockup.png` … `06-mockup.png` — static states **a–f** in order: a surviving · b on the block · c eliminated/spectating · d drill-in sheet · e champion · f round locked/awaiting results
- `01-live.png` — the live prototype in knockout mode (desktop + mobile, one sim)
- `live-02-ceremony.png` — the cutting ceremony aftermath in both frames

## Files
- `The Cut (Unified Knockout).html` + `unified/ku.css` — static direction mockups + on-canvas spec panel
- `Vs the Field.html` — the live prototype entry (loads the stack below)
- `vsfield2/knockout.jsx`, `vsfield2/knockout.css` — **all new knockout/ceremony code**
- `vsfield2/{v2.css, shared.jsx, directionA.jsx, mobile.jsx, app.jsx}` — the existing surface (small `ko` diffs)
- `vsfield/{data.jsx, components.jsx, ios-frame.jsx}`, `playercard/playercard.jsx`, `tweaks-panel.jsx` — foundations (data model, atoms, score sheets, device frame, presenter tweaks)
- `ds/ds.css` — design tokens + component classes (source of truth)
Related but not bundled: the standalone ceremonial theater (`Guillotine Theater.html` + `theater/`),
already covered by the earlier `design_handoff_guillotine_stage` bundle; this session only flipped
its default Surface tweak to mobile.

## Open gaps (flag, don't invent)
Scoring values are illustrative pending SCORING.md; exact per-round cut counts + playoff field size
are commissioner-set (the 2↔3 tweak mirrors that); FAAB tie-break = rolling waiver order (resolved).

## Implementation gotcha (learned the hard way)
Avoid broad descendant selectors like `.foo span { display:block }` around text content — design-tool
and i18n tooling may wrap literal text runs in inner `<span>`s, and blockifying them explodes each
text run onto its own line. Target explicit classes (`.koc-verdict-safe`, `.koc-faab`, …) instead.
