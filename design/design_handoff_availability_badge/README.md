# Handoff: Player Availability Badge (Set Lineup)

## Overview
A compact, per-player **availability badge** for XI's **Set Lineup** screen. It answers one
question at a glance: **is this player in his national team's *real* starting XI for his next
match?** Three states — **Starting**, **Not starting**, **TBA**. It sits on each rostered player,
who already renders as either a **pitch token** (the starting XI on the formation pitch) or a
**bench row** (the vertical bench list).

**Chosen direction: Variation B — "corner medallion + kit glow"** (see `Availability Badge.html`,
section "B · medallion"). Variations A (status pill) and C (availability bar) are included as
documented alternates but **B is the one to build.**

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype showing the
intended look and behaviour, **not production code to copy directly.** The task is to **recreate
this badge in the XI codebase's existing environment** (Next.js App Router + React + TS + Tailwind,
per the project conventions) using its established component patterns and design tokens.

The HTML prototype uses plain CSS custom properties that map 1:1 to the project's token layer
(`ds/ds.css` → Tailwind theme extension). Re-implement against the **existing tokens**, do not
hardcode the hex values unless a token doesn't exist.

The pan/zoom **design canvas** (`design-canvas.jsx`) and the demo squad data are **presentation
scaffold — discard them.** Only the badge treatment itself ports.

## Fidelity
**High-fidelity.** Final colours, icons, sizes, and states are specified below to the pixel.
Recreate pixel-faithfully using the codebase's existing primitives (the shared `PositionBadge`,
`KitChip`/`Flag`, token-driven colours, the `PitchToken` and bench-row components).

---

## The core concept: availability is ORTHOGONAL to lock-on-play
XI already has a **lock-on-play** signal on every player (a player locks the instant he plays ≥1
minute). In the current Set Lineup token that is encoded by **kit brightness** (lit = playing,
dimmed = played) plus the **score line** ("to play" / live pts). **Do not conflate the two.**

- **Lock-on-play** = *can I still move him right now?* (movable vs frozen). Already built.
- **Availability** = *will he actually start for his country?* (Starting / Not starting / TBA). NEW.

Availability is only meaningful **before** a player's match kicks off — i.e. while he is still
**movable**. The moment his match starts he is locked and the question is moot.

**Rule:** render the availability badge **only when the player is movable** (his match has not
kicked off). Once he is locked (playing/played), drop the availability badge and let the existing
lock state + score line take over. This keeps the token from carrying two competing status signals
at once.

---

## States

| State | Meaning | Tone | Token / colour | Icon |
|---|---|---|---|---|
| **Starting** | Confirmed in the real XI | Affirmative / positive | `--win` `#2FBF71` (light `#1FA05A`) | ✓ check |
| **Not starting** | Benched or left out of the matchday squad. **The actionable state** — manager may want to swap him before kickoff. | Warning (user-elevated to red) | `--loss` / `--danger` `#E5484D` | ✕ cross |
| **TBA** | Lineup not announced yet. **Default for most of the week** (real XIs drop ~1h before kickoff). | Calm / neutral — never a problem | `--locked` `#7E8DA8` (light `#60708C`) | ⏱ clock |

> **Colour-blind requirement (non-negotiable):** every state carries **colour + a distinct icon
> shape + a word**, never hue alone. The three icon silhouettes (check / cross / clock) are
> deliberately distinct so the states separate in full greyscale.

> **Note on "Not starting" colour:** the design-system default for a soft warning is `--ytp` orange
> (`#E2873C`), and the original exploration used it. The user explicitly elevated this state to
> **red `--loss` `#E5484D`** with an **✕** glyph. Build it red. (Gold is banned project-wide — do
> not introduce gold anywhere.)

---

## Variation B — build spec (corner medallion + kit glow)

The badge is **two coordinated parts on the token** plus a one-word label — no extra token height:

### 1. Corner medallion (on the pitch token)
A small filled circle pinned to the top-right of the jersey, holding the state icon.

- Size: **19 × 19 px**, `border-radius: 50%`
- Position: absolute, `top: -5px; right: 14px` relative to the jersey/kit wrapper, `z-index: 3`
- Ring + shadow: `box-shadow: 0 0 0 2px <surface-behind>, 0 1px 3px rgba(0,0,0,.5)`
  (the 2px ring matches the surface the token sits on — `--surface-0` off-pitch, the pitch green
  on-pitch — so the medallion reads as a separate chip)
- Icon: **12 × 12 px**, stroke `currentColor`
- Per state:
  - **Starting** — `background: var(--win)`, icon colour `#04140E` (dark glyph on green)
  - **Not starting** — `background: var(--loss)` `#E5484D`, icon colour `#fff`
  - **TBA** — `background: var(--locked)`, icon colour `#fff`

### 2. Kit glow (on the jersey)
A faint state-coloured outer glow on the shirt, applied as a `filter` on the **kit wrapper**
(parent of the clip-path jersey, so the glow follows the shirt silhouette):

- **Starting** — `drop-shadow(0 0 1px var(--win)) drop-shadow(0 0 5px color-mix(in srgb, var(--win) 80%, transparent))`
- **Not starting** — `drop-shadow(0 0 1px var(--loss)) drop-shadow(0 0 6px color-mix(in srgb, var(--loss) 85%, transparent))`
- **TBA** — `drop-shadow(0 0 1px var(--locked)) drop-shadow(0 0 4px color-mix(in srgb, var(--locked) 60%, transparent))`

This is the redundancy that makes it glanceable on a 4-3-3 of 11 tokens: even before you parse the
tiny medallion, the kit edge is tinted by state. (The dimming for lock-on-play is a separate
`brightness()/saturate()` filter on the jersey itself — they compose; glow on the wrapper, dim on
the shirt.)

### 3. Micro word (under the token, optional but recommended)
- Font: **9px / 800 weight**, `text-transform: uppercase`, `letter-spacing: .07em`
- Text: `Starting` / `Out` / `TBA`
- Colour **on the pitch** (over green, needs brightening): Starting `#5BE0A0`, Out `#FF8A8A`,
  TBA `#AEB9CC`
- Colour **off the pitch** (on a panel surface): use the solid tokens `--win` / `--loss` / `--locked`

### 4. Bench row treatment (vertical bench list)
The same state, restyled for a horizontal row:

- **Left accent stripe**: a `::before` bar, `position:absolute; left:0; top:0; bottom:0; width:3px`,
  `background:` the state colour (`--win` / `--loss` / `--locked`)
- **Leading icon chip**: **22 × 22 px**, `border-radius: 6px`, `background:` the state's `*-soft`
  token, icon colour the solid state token, icon **13 × 13 px**
- **Trailing micro word**: `Starting` / `Out` / `TBA` in the solid state colour (9px/800 uppercase)
- Row otherwise unchanged from the existing bench row (position badge, flag/kit chip, name, the
  existing "vs OPP · KO" meta).

---

## Icons (exact paths, 24×24 viewBox, `fill:none; stroke:currentColor; round caps/joins`)
- **check** (Starting): `M20 6 9 17l-5-5` — `stroke-width: 2.6`
- **cross** (Not starting): `M6.5 6.5l11 11M17.5 6.5l-11 11` — `stroke-width: 2.8`
- **clock** (TBA): `<circle cx=12 cy=12 r=8.4/>` + `M12 7.6V12l3 1.8` — `stroke-width: 2.2`

If the codebase already has a check / x / clock icon set (e.g. lucide), use those at matching
weights instead of hand-rolling SVG.

---

## Alternates (documented, not the chosen build)
- **A · Status pill** — a worded `.pill`-style chip (icon + "Starting/Out/TBA") below the token /
  right-aligned in the bench row. Most explicit and readable at distance, but adds the most ink per
  token; busiest across a full pitch.
- **C · Availability bar** — a short under-bar coding state by **colour + texture** (solid /
  diagonal-hatch / dashed) plus an uppercase micro-label. Strongest pure-greyscale story; middle
  density. Worth keeping in your back pocket for an accessibility/high-contrast mode.

All three are visible side-by-side and at full-XI density in `Availability Badge.html`.

---

## Interactions & Behavior
- **Static status indicator** — the badge itself is not interactive (the token/row keeps its
  existing tap behaviour: movable → start a swap; locked → open the points breakdown).
- **Visibility gate**: show availability only while the player is **movable** (pre-kickoff). On
  lock, hide it (lock-on-play state takes over).
- **State source / timing**: availability comes from a real-lineup feed and typically resolves
  **~1 hour before kickoff**. Before that, every player is **TBA** — so TBA is the dominant,
  intentionally-calm default for most of the week. Don't make TBA look like an error or a missing
  value.
- **No animation required.** If you add an entrance when a lineup drops (TBA → Starting/Out), animate
  transform/opacity-up only; **never start from `opacity: 0`** as a base state (project gotcha:
  pre-animation hidden states can stick in capture/SSR contexts).
- **Reduced motion**: respect `prefers-reduced-motion` (the kit glow is static, so this is mainly
  about any optional transition).

## State Management
Add one field per player, scoped to his **next match**:

```ts
type Availability = 'starting' | 'out' | 'tba';
// on the player/lineup view model:
availability: Availability; // default 'tba' until the real lineup is published
```

- Default `'tba'`.
- Resolve to `'starting' | 'out'` when the official lineup for that player's match is published.
- The badge is derived/presentational — given `availability` + the existing `movable` lock state,
  render (or suppress) the badge. No local component state needed.

## Design Tokens (all already in `ds/ds.css` → Tailwind theme)
```
--win        #2FBF71   (light #1FA05A)   --win-soft     rgba(47,191,113,.16)   // Starting
--loss/--danger #E5484D                  --loss-soft    rgba(229,72,77,.16)    // Not starting (red)
--locked     #7E8DA8   (light #60708C)   --locked-soft  rgba(126,141,168,.16)  // TBA
// on-green brightened text: Starting #5BE0A0 · Out #FF8A8A · TBA #AEB9CC
// medallion dark glyph on green: #04140E
radius: medallion 50% · bench chip 6px · stripe 3px wide
fonts: micro label 9px/800 uppercase, letter-spacing .07em (Hanken Grotesk / --font-sans)
```
**Do not use gold anywhere.** Accent (cobalt `#4D8DFF`) marks *you* + primary actions only — never a
functional state, so it is **not** used by this badge.

## Where it plugs into the existing code
In the live screen (`Set Lineup.html` + `setlineup/components.jsx`):
- **Pitch token** → `PitchToken` (the `jersey` token style). Add the medallion + kit-wrapper glow +
  micro word. The kit wrapper already exists (the element carrying the jersey + the score line).
- **Bench row** → `BenchRow`. Add the left stripe + leading icon chip + trailing word.
- Gate both on the existing `statusOf(id, t) === 'movable'`.

In production these correspond to the project's single shared **PlayerCard / PitchToken** and the
bench/standings row component — extend those, don't fork new ones (one vocabulary across screens).

## Assets
No image assets. Icons are 3 inline SVGs (check / cross / clock) — substitute the codebase's icon
library if it has equivalents. National-team kits/flags in the prototype are approximate CSS
gradients **for demo only**; the real app already renders kits via its `JERSEY_BG` / `KitChip`
system — reuse that untouched.

## Files in this bundle
- `Availability Badge.html` — the prototype (open in a browser). Sections: **At full strength**
  (full XI + bench density test for A/B/C), **A/B/C** detail (token + bench + legend each), and a
  **Light theme check**.
- `availability/badges.jsx` — the badge components + the `BADGE` state map + demo squad. This is the
  cleanest single reference for the markup/classes of all three treatments.
- `ds/ds.css` — the token + base-component layer the badge builds on (token source of truth).
- `design-canvas.jsx` — pan/zoom presentation harness only. **Discard for implementation.**
