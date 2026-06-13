# Handoff: WC2026 National Jersey Gradients (22 new nations)

## Overview
The **Vs the Field** screen renders each player in a manager's XI as a small "jersey" token
(~**32px**) on the dark pitch (`background: #11151C`). The jersey is a pure-CSS gradient that
evokes the player's **national colors** — treated like a flag does: abstract color identity only,
**no crests, no badges, no manufacturer/sponsor logos, no replication of any licensed national-team
kit.**

8 nations already shipped. This handoff adds gradients for the **22 remaining nations**, plus an
optional **stronger Croatia** to resolve a red/white/blue collision. Everything is designed to read
clearly and **distinguishably** at 32px on the dark background — nations sharing a palette are
separated by stripe **orientation**, band **proportion**, or a secondary **motif** (a centered
disc / cross / star).

## About the design files
The files in this bundle are a **design reference**, not production code to copy wholesale. The two
deliverables that matter are data, not UI:
1. **`jersey-gradients.css`** — one CSS custom property per nation (`--kit-<code>`), copy-paste ready.
2. **`jersey-gradients.js`** — the same values as a JS object that slots into the existing
   `JERSEY_BG` library, matching the project's established pattern.

`Jersey Contact Sheet.html` is the visual proof — all 30 jerseys at token size, grouped by cluster,
for approval. It is a judging surface, **not** a screen to ship.

Recreate these in the target codebase (Next.js + React + TS + Tailwind per the project) by extending
the **existing** kit library — do **not** introduce a parallel system.

## Fidelity
**High-fidelity.** These are final, exact gradient values with locked hex codes. Drop them in as-is.

---

## Where they go in the codebase

The project already has the kit library in two places (per `CLAUDE.md` / `COMPONENT_MAP.md`):

| Location | Symbol | Role |
|---|---|---|
| `setlineup/data.jsx` | `JERSEY_BG` | the canonical 54-nation kit library used app-wide |
| `vsfield2/directionA.jsx` | `JERSEY_BG_V2` | the local 8-nation subset for the Vs-the-Field pitches |

**Add the 22 new entries to whichever object the surface reads.** For Vs the Field specifically,
extend `JERSEY_BG_V2` (or, better, point `kitOf()` at the shared `JERSEY_BG` so there's ONE source
of truth — the long-term intent in `COMPONENT_MAP.md` is a single kit vocabulary).

### The render contract — read this, it bites
The kits are **multi-layer `background` shorthands**: each gradient's layers carry their **own
sizes** (cantons, crosses, stripes, dots). The rendering rules, already established project-wide:

- **NEVER set `background-size: cover`** (or any global `background-size`) on a kit element — it
  collapses every layer to full-cover and the kit reads as a single muddy block (e.g. USA → solid
  navy → reads black). Set the base surface, then apply the gradient inline as the full `background`
  shorthand, with **no size override**:
  ```jsx
  <span className="vf-jersey" style={{ background: kitOf(player.nat) }} />
  ```
  ```css
  .vf-jersey { width:32px; height:32px; border-radius:6px; background:var(--surface-4); }
  ```
- **The 1px light inset outline is applied separately by the app** (`box-shadow: inset 0 0 0 1px
  var(--kit-outline)`, theme-aware ~2px white in dark / dark in light). It is **NOT** baked into any
  gradient here — keep applying it in CSS as you do today.
- `background-repeat: no-repeat` is already encoded per-layer where needed; don't add a blanket
  `repeat`.

---

## The 22 new nations + Croatia proposal

See `jersey-gradients.css` (CSS vars) and `jersey-gradients.js` (JS object) for the exact strings.
ISO codes used: AUT, BEL, CAN, COL, CIV, CZE, ECU, EGY, GER, GHA, JPN, MAR, NED, NOR, SCO, SEN,
KOR, ESP, SWE, SUI, TUR, URU.

### Design approach, per color cluster (why no two collide)

**01 · Sky-blue & sun** — `URU` vs existing `ARG`. Both celeste. Split by **stripe count + sun
placement**: Argentina = 3 wide bands, sun centered; **Uruguay = many fine stripes (a deeper celeste
`#4F86C6`) with the sun in a white top-left canton.**

**02 · Vertical tricolors** — `BEL` (blk/yel/red), `CIV` (org/wht/grn), `SEN` (grn/yel/red) +
existing `MEX`, `FRA`. Separated by **color set**. The two greens — Mexico (grn/**white**/red) and
Senegal (grn/**yellow**/red) — also split via a small **green star** on Senegal's center stripe.

**03 · Horizontal tricolors** — `GER` (blk/red/gold), `EGY` (red/wht/blk), `NED` (red/wht/blu),
`GHA` (red/yel/grn + black star), `ESP` (red/yel/red **1:2:1** proportion). The red/white/blue clash
with **Croatia** is resolved by the adopted checker Croatia (below); `NED` keeps the clean tricolor.

**04 · Andean (yellow/blue/red)** — `COL` and `ECU` share the yellow-top **2:1:1** layout. Split by
a **center emblem**: Ecuador carries a small dark coat-of-arms dot (and a cooler blue `#034EA2`);
Colombia stays clean.

**05 · Red & white (orientation does the work)** — `AUT` (horizontal red/wht/red), `CAN` (vertical
red/wht/red + red leaf-dot), `SUI` (bold centered white cross — inverse of England), `JPN` (single
red disc) + existing `ENG` (red cross). Five reds, five unmistakable shapes.

**06 · Red field + centered emblem** — `TUR` (red field, off-center white disc = crescent), `MAR`
(red field, green star), `KOR` (white field, red-over-blue taegeuk dot) + existing `POR`.

**07 · Crosses (nordic & saltire)** — `SWE` (yellow cross on blue), `NOR` (blue-in-white cross on
red), `SCO` (white saltire — the only diagonal in the whole set). A silhouette no tricolor shares.

**08 · Distinct / composite** — `CZE` (white/red halves + blue hoist wedge). No palette collision
with existing `USA` / `BRA`.

### Croatia — replacement adopted (decided)
The old **Croatia** was a plain red/white/blue horizontal tricolor, **identical** to the new
Netherlands. **Decision: adopt the checker version.** Croatia is now the same tricolor with a small
red/white **checker dot** (the šahovnica motif, abstracted) centered on the top band — unmistakable
against Netherlands, which keeps the clean tricolor. In the data files the canonical `CRO` / `--kit-cro`
**is** this checker version; the old plain tricolor is retired (kept only as a commented reference).

---

## Design tokens (colors used)
Every hex is a national color (national yellows/golds are colors, not the app's gold — the
project-wide "no gold in UI" rule does not apply to flag identity). Full per-nation values live in
the two data files. Notable disambiguating choices:

- Uruguay celeste `#4F86C6` (deeper than Argentina `#75AADB`).
- Ecuador blue `#034EA2` (cooler than Colombia `#003893`); Ecuador emblem dot `#7A5C2E`.
- Blacks rendered as near-black `#1A1A1A` (Belgium/Germany/Egypt/Ghana star) so the kit separates
  from the `#11151C` pitch instead of disappearing into it.
- Position-badge colors, accent (cobalt), and all UI tokens are **untouched** — these are kit-only.

## Assets
**None.** No images, SVG, fonts, or binaries. Pure CSS gradients only. No licensed/brand assets.

## Files in this bundle
- `README.md` — this document.
- `jersey-gradients.css` — `:root` custom properties, one `--kit-<code>` per nation (22 new + adopted
  checker Croatia; the existing set included, commented, for reference).
- `jersey-gradients.js` — `NEW_KITS` JS object (drop into `JERSEY_BG` / `JERSEY_BG_V2`; includes the
  adopted `CRO`) + a usage note.
- `Jersey Contact Sheet.html` — visual contact sheet of all 30, grouped by cluster (approval surface).

## Open / to-confirm
- These 22 cover the nations named in the brief. If the final tournament field includes others, the
  existing `JERSEY_BG` library already carries ~54 simplified fills as a fallback (`kitOf()` falls
  through to `NATIONS[nat].f`), so unlisted nations still render.
