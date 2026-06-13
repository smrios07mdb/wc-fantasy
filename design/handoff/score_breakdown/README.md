# Handoff: Player Score Breakdown (drill-down)

## Overview
This package documents a single feature added to the **XI** World Cup fantasy app: the ability to
**drill from a manager's lineup into an individual player and see exactly how that player earned his
points** — a categorized stat-by-stat breakdown in a floating sheet.

It applies to two surfaces:

1. **Vs the Field** (`Vs the Field.html`) — the live all-play-all scoreboard. You click a manager
   row → their head-to-head lineup opens → you click any player (in either lineup) → the breakdown
   sheet appears.
2. **Set Lineup** (`Set Lineup.html`) — the lock-on-play lineup editor. You tap any **locked**
   player (one who is playing or has played, on the pitch / bench / XI list) → the same breakdown
   sheet appears. Movable (not-yet-locked) players still trigger the swap flow instead.

Both surfaces render the breakdown with **one shared component**, `ScoreBreakdown`, so the stat
vocabulary is identical everywhere.

## About the Design Files
The files in this bundle are **design references built in HTML/React-via-Babel** — runnable
prototypes that show the intended look and behavior. They are **not** production code to copy
verbatim. The task is to **recreate this interaction in the target codebase** (the project's stated
target is **Next.js App Router + React + TypeScript + Tailwind**) using its existing components,
tokens, and patterns. Where this prototype hand-rolls CSS classes (`.vf-br-*`, `.vf-psheet-*`,
`.sl-*`), map them onto the real design-system equivalents.

To run the prototypes locally: serve the `design_handoff_score_breakdown/` folder over any static
server (e.g. `npx serve`) and open `Vs the Field.html` or `Set Lineup.html`. They use a presenter
"sim bar" at the top — scrub the clock or hit **Play** to move match time forward and watch player
states change (to-play → playing → played); that's a demo affordance, not part of the product.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interaction behavior. Recreate
pixel-accurately using the codebase's existing primitives. Exact values are in **Design Tokens**.

---

## The interaction

### Vs the Field — drill path
1. **Field table** lists every manager ranked by points. Clicking a row selects that manager and
   opens the **Head-to-head** panel (`H2HDetail`, desktop right rail / `MobH2H`, mobile full view).
2. The H2H panel shows **two lineup columns** side by side: *You* and *the selected manager*, each
   player as a row with position badge, flag, surname, live status pill, and current points.
3. **Every player row is a button.** Clicking it calls `openScore(player, managerId)` which opens
   the floating **`PlayerScoreSheet`**.
4. A caption under the columns reads: *"Tap any player to see the categories & stats behind their
   points."*

### Set Lineup — drill path
1. The 15-man squad is shown on a formation pitch (`Pitch` / `PitchToken`) plus a bench rail
   (`BenchRow`) and optional XI list (`XIList`).
2. Each player has a **lock status**: `movable` (his match hasn't kicked off — freely swappable),
   `live` (playing now — locked), or `played` (match finished — locked).
3. **Tapping a `live` or `played` player** opens the `PlayerScoreSheet`. **Tapping a `movable`
   player** keeps the existing swap-selection behavior (movable players have 0 points, so there is
   nothing to break down). This branch is in `PitchToken`:
   ```js
   const locked = !empty && status !== 'movable';
   const tap = locked ? () => onScore(cell.id) : () => onTap(cell);
   ```
   The same `locked ? openScore : onCellTap` branch is applied in `BenchRow` and `XIList`.

---

## Component: `PlayerScoreSheet` (the floating sheet)
A modal overlay. **Header** (position badge · flag · "F. Surname" · whose XI it is · big total
points), a **match context line** (lock-status pill · "HOME h–a AWAY · minute/FT"), then the
**`ScoreBreakdown`** body, then an illustrative-scoring footnote.

Empty/edge states:
- Player's match not started → *"Hasn't kicked off yet — no points on the board. Still swappable
  until his match starts."*
- Playing but no scoring actions yet → *"On the pitch — no scoring actions logged yet."*

**Overlay positioning** (important for the two-frame prototype, adapt to your app):
- Desktop: scrim is `position:absolute; inset:0` over the app shell (`.vf-app`, which is
  `position:relative`), centered.
- Mobile: scrim anchors to the iOS device root (the nearest positioned ancestor), so it stays
  centered in the visible phone viewport regardless of scroll.
- In a real app, this is just a standard centered modal / dialog. Use your dialog primitive.

There are **two `PlayerScoreSheet` implementations** because the two surfaces use different data
eval functions, but they render the **same `ScoreBreakdown` body**:
- `vsfield/components.jsx` → `PlayerScoreSheet({ p, managerId, t, onClose })`, uses `evalPlayer(p,t)`.
- `setlineup/components.jsx` → `PlayerScoreSheet({ id, t, onClose })`, uses `evalSquadPlayer(id,t)`.

## Component: `ScoreBreakdown` (the shared body) — the core of this feature
Defined ONCE in `vsfield/components.jsx` and reused by both surfaces (Set Lineup loads
`vsfield/components.jsx`). Signature:

```jsx
<ScoreBreakdown done={doneEvents} p={player} />
```

- `done` — array of scoring events the player has accrued **so far** at the current time, each
  `{ min:Number, type:String, pts:Number }`.
- `p` — the player object (needs `p.pos` for the goal-position label).

It groups events by `type`, sums points per category, and renders one row per category in a fixed
order, plus a **Total** row that equals the player's displayed score (this equality is a deliberate
honesty contract — the breakdown always sums to the headline number).

### Categories (fixed order, with display strings)
| order | `type`      | tag chip | label          | unit? | detail line                                   |
|-------|-------------|----------|----------------|-------|-----------------------------------------------|
| 1     | `appearance`| `APP`    | Appearance     | no    | "Played 1+ minute"                            |
| 2     | `hour`      | `MIN`    | 60+ minutes    | no    | "Completed the hour"                          |
| 3     | `goal`      | `GOAL`   | Goal           | yes   | "Scored as {keeper/defender/midfielder}" + minutes |
| 4     | `assist`    | `AST`    | Assist         | yes   | the minute(s), e.g. "49'"                     |
| 5     | `cs`        | `CS`     | Clean sheet    | no    | "Conceded none"                               |
| 6     | `yellow`    | `YEL`    | Yellow card    | yes   | the minute(s)                                 |

Row layout (CSS grid `1fr auto 38px`):
- **Left**: a small mono tag chip (`APP`/`GOAL`/…) + a two-line label/detail. Label appends `×N`
  when a category occurred more than once (e.g. "Goal ×2").
- **Middle** (`unit` categories only): the math, `"N × +V"` (e.g. `2 × +5`).
- **Right**: the category subtotal, green if ≥0 (`var(--win)`), red if negative (`var(--loss)`).
- **Total row**: bottom, heavier top border, "Total points" + the summed value in the display font.

### Reference: how points are produced in the mock
Point values are **illustrative pending the real SCORING.md** and are flagged as such in-UI. The
prototype's values (`PTS` in `vsfield/data.jsx`) are position-weighted:
- appearance `+2`, 60+ mins `+1`, assist `+3`, yellow `−1`
- goal: GK `+10`, DEF `+8`, MID `+6`, FWD `+5`
- clean sheet: GK `+5`, DEF `+4`, MID `+1`, FWD `0`

In production, **do not hardcode these** — drive the breakdown off the real scoring config. The
component only needs the per-event `pts` already computed; it does not compute scoring itself.

---

## Interactions & Behavior
- **Open**: click/tap a player row (Vs the Field) or a locked player token/bench/XI row (Set Lineup).
- **Close**: click the ✕ button, or click the scrim outside the sheet.
- **Entrance animation**: the sheet translates up ~10px over 160ms (`var(--ease-out)`). **Opacity is
  kept at 1 during the animation** (transform-only) — a project-wide rule so the element is never
  invisible in capture/preview contexts. Honor this if you animate entrance.
- **Live updates**: while a player is `live`, his `done` list grows as match minutes pass and the
  total ticks up. If the sheet is open during this, it should reflect new events (in the prototype
  it re-renders from shared sim state on each tick).
- **No points yet** and **not-kicked-off** render the empty-state copy above rather than an empty
  table.

## State Management
Minimal. The opening surface owns one piece of state — *which player's sheet is open*:
- **Vs the Field** (`vsfield/app.jsx`): `const [scored, setScored] = useState(null)` holding
  `{ p, managerId }`; `openScore(p, managerId)` / `closeScore()` passed down to desktop + mobile.
- **Set Lineup** (`setlineup/app.jsx`): `const [scoreId, setScoreId] = useState(null)` holding a
  player id; `ix.openScore = setScoreId`.

Everything else the sheet needs (events, status, match, total) is **derived** from the current match
time via `evalPlayer` / `evalSquadPlayer` — no extra fetching. In production this maps to whatever
live-scoring source you already have; the sheet is a pure render of a player's scored events.

## Design Tokens
All from `ds/ds.css` (the project's single source of truth). Values used by this feature:

**Functional / text colors**
- Positive points `--win` = `#2FBF71`
- Negative points `--loss` = `#E5484D`
- Live/playing accent `--live` = `#FF4D4D`
- Locked/frozen `--locked` = `#7E8DA8`
- yet-to-play `--ytp` = `#E2873C` (dark) / `#C26A1A` (light) — **note: gold is removed project-wide**
- Text: `--text-primary` / `--text-secondary` / `--text-tertiary`

**Position badge colors** (fixed, independent of accent): GK `#F2B33D`, DEF `#4DA8FF`,
MID `#19E08A`, FWD `#FF6B8A`.

**Surfaces & lines**: `--surface-0..4`, `--hairline`, `--hairline-strong`.

**Radii / elevation**: `--r-sm`, `--r-md`, `--r-lg`, `--r-xl`, `--r-pill`; shadow `--e3` for the
floating sheet.

**Type**: display/scores = **Schibsted Grotesk**; UI/body = **Hanken Grotesk**; mono = **JetBrains
Mono** (tabular figures for all aligned numbers). Type-scale helpers: `--fs-micro`, `--fs-caption`,
`--fs-sm`, `--fs-body`, `--fs-body-lg`, `--fs-h3`.

**Sheet/breakdown specifics** (see `.vf-psheet-*` and `.vf-br-*` in `Vs the Field.html`, duplicated
into `Set Lineup.html`):
- Sheet: width `392px` (desktop), padding `18px`, `--r-xl`, border `--hairline-strong`, shadow `--e3`.
- Breakdown row: grid `1fr auto 38px`, `9px` vertical padding, `--hairline` divider.
- Tag chip: `9px/800` sans, surface-3 bg, `--hairline` border, `--r-sm`, min-width `34px`.
- Total row: `1.5px` `--hairline-strong` top border; number in display font.

## Accent rule (do not violate)
The cobalt **accent (`#4D8DFF`) only ever marks *you* + primary actions** — never a functional
state. In this feature the breakdown uses **functional colors only** (win/loss/live/locked); the
accent does not appear inside the sheet. Keep it that way.

## Assets
No new image assets. The surfaces reference brand favicons/icons under `logo/` (not included here —
they are non-essential to this feature and degrade gracefully). Flags/kits are pure CSS
gradients (`flagStyle` / `JERSEY_BG` in the data files), no image files.

## Files
Design reference files in this bundle:

**Vs the Field surface**
- `Vs the Field.html` — page shell + all CSS (incl. `.vf-br-*` breakdown + `.vf-psheet-*` modal).
- `vsfield/components.jsx` — **`ScoreBreakdown`, `buildBreakdown`, `PlayerScoreSheet`** (the shared
  core), plus shared atoms (`Pos`, `Flag`, `Avatar`, `StatusTag`, `PitchMini`, `RecordBadge`, …).
- `vsfield/desktop.jsx` — `H2HDetail` with clickable player rows + sheet mount.
- `vsfield/mobile.jsx` — `MobH2H` with clickable player rows + sheet mount.
- `vsfield/app.jsx` — `scored` state + `openScore`/`closeScore` wiring + match-time sim.
- `vsfield/data.jsx` — `evalPlayer`, `PTS`, match timeline, managers, nations.
- `vsfield/ios-frame.jsx` — iOS device bezel (prototype chrome only; discard in production).

**Set Lineup surface**
- `Set Lineup.html` — page shell + CSS (incl. `.sl-scoremodal` sheet + copied `.vf-br-*`).
- `setlineup/components.jsx` — `PitchToken` / `BenchRow` / `XIList` (the locked-tap → open-score
  branch) and `PlayerScoreSheet` (body swapped to shared `ScoreBreakdown`).
- `setlineup/app.jsx` — `scoreId` state + `ix.openScore` wiring.
- `setlineup/data.jsx` — `evalSquadPlayer`, `EVENTS`, lock-status model.

**Shared**
- `ds/ds.css` — design tokens + base component classes.
- `tweaks-panel.jsx` — in-prototype tweak controls (theme/accent demo; not a product feature).
