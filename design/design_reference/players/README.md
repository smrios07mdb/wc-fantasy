# Handoff: Players — full-tournament player browser

## Overview
A new **read-only** route, `/players`, for XI (World Cup 2026 fantasy, 12-manager league,
currently in the guillotine knockout / "The Cut"). It lets a manager browse **every** player in
the tournament — rostered and free-agent — with search + filters, see who owns whom, drill into
the **existing** two-tab player card, and (when a waiver window is open) launch a bid on a free
agent. Adapts Sleeper's Players tab to our brand and to the data we actually have.

## About the design files
`Players.html` is a **design reference** — one static HTML canvas holding all 8 artboards (states),
the mock data, and the full component vocabulary. It is **not** production code to ship. Recreate it
in the app's existing **Next.js (App Router) + React + TS + Tailwind** environment, reusing the
established component library and the `ds/ds.css` design tokens. Open `Players.html` in a browser to
pan/zoom the artboards.

## Fidelity
**Hi-fi.** Colors, typography, spacing, and layout are final and come from `ds/ds.css`. Recreate
pixel-accurately using existing components/tokens — do not restyle.

## Data model (design to this — nothing more)
Per player, we have **only**:
- `name`, `position` (`GK|DEF|MID|FWD`), `nation` (code + display name), `nationAlive` (bool)
- `seasonPoints` — tournament fantasy total
- `ownership` — a manager's team name, or `null` = Free agent

**Do NOT design/fetch:** projections, ADP, rankings, news, depth charts, % rostered, trending, player
photos. We have no source and do not fabricate.

The richer per-player data shown **inside the player card and the stat columns** — the statline
(`Pld/Min/G/A/Sh/KP/CS/Tkl/YC`), the per-match game log, and the Points breakdown — comes from the
**existing player-card / box-score stats layer**. Reuse that layer; do not invent numbers. In the
reference these are produced by a deterministic `statsFor(player)` stub purely so the mock renders —
replace with the real stats source. **All scoring values are illustrative pending `SCORING.md`** and
are flagged as such in-UI; keep that flag until scoring is locked.

## Screens / states
Route is read-only. The 8 artboards in `Players.html` (labelled `data-frame`):
1. **default** — the list, sorted by season points desc.
2. **open** — acquisition window open → free-agent rows show a bid trailer.
3. **closed** — window closed → no trailers, calm status line explains why.
4. **elim** — eliminated-nation treatment + the Active-teams toggle (OFF/ON pair).
5. **empty** — no players match the filters.
6. **card** — mobile: row tap opens the existing two-tab player-card bottom sheet.
7. **desktop** — wide list with the full statline + inline filters.
8. **deskcard** — desktop player card as a centered modal (Points + Stats shown together).

### Mobile layout (base = 360px)
Top→bottom: app header (trophy + "XI" / league name secondary + "The Cut · R16" status chip) → a
sticky toolbar block: **SearchField**, **PositionSegmented** (`ALL/GK/DEF/MID/FWD`),
**AvailabilityFilter** chips (`All | Free agents | Rostered | Mine`), **NationFilter** (collapsible
chip-grid — reuse existing pattern), **ActiveTeamsToggle** → list-meta row (`Showing 25 of 1,204` +
**SortControl**, default *Season pts ↓*) → status line → one-line swipe hint → the **StatTable** →
**Pager** (`Load 25 more`, paged reveal — ~1,204 players, never an infinite wall) → fixed **64px tab
bar**.

**StatTable (mobile):** a single horizontally-scrollable table. The **Player** cell (pos badge + kit
+ name + nation) is pinned left (`position:sticky; left:0`); the **Pts** cell is pinned right
(`position:sticky; right:0`, opaque bg + left shadow). Between them scroll: Owner chip, then
`Pld Min G A Sh KP CS Tkl YC`. Row min-height 58px. `Mine` rows get a 3px cobalt inset-left stripe +
faint accent tint on the pinned cell. Eliminated rows: `opacity .6`, name strikethrough (`--elim`),
kit greyscaled.

### Desktop layout
Single top bar (trophy/wordmark + primary nav, Players active + cut status). One toolbar row holds
Search + PositionSegmented + AvailabilityFilter + NationFilter + ActiveTeamsToggle + count. Table
columns: `Pos · Kit · Player · Owner · Pld · Min · G · A · Sh · KP · CS · Tkl · YC · Pts(sortable) ·
Action`. Player column stays ~370px; stat cells mono/right-aligned; irrelevant cells render a muted
"—". Free-agent rows show **Place bid**; rostered rows show muted "Rostered".

**Stat header tooltips (desktop):** every stat column header has a dotted-underline affordance; on
hover it shows a styled tooltip with the **full stat name + how it scores** (see Scoring below).

## Components (name them exactly; reuse existing where noted)
`PlayersScreen`, `FilterBar` → { `SearchField`, `PositionSegmented`, `AvailabilityFilter`,
`NationFilter` (collapsible chip-grid), `ActiveTeamsToggle`, `SortControl` }, `StatTable`,
`PlayerRow` (mobile pinned-column) / `PlayerTableRow` (desktop grid), `PositionBadge` (`.pos`),
`KitChip`, `OwnerChip`, `BidTrailer`, `Pager`, `StatHeaderTooltip`, and the **existing**
`PlayerCardSheet` (do not redesign — light header refinement only).

- **OwnerChip** — Free agent = accent (cobalt); a manager = muted (`--surface-3`/tertiary text);
  **you** = accent + "· you" and the row gets the cobalt stripe. Accent marks *you* + primary actions
  only, never a functional state.
- **KitChip** — a small rounded square filled with the nation's flag gradient. **GOTCHA:** these are
  multi-layer CSS `background` shorthands whose layers carry their own sizes — **never** set
  `background-size:cover` (it collapses every layer). Base `--surface-4`, gradient inline. There is a
  richer `JERSEY_BG` flag-kit library elsewhere in the app (`setlineup/data.jsx`); prefer reusing it.
- **BidTrailer** — trailing action on **free-agent rows only, only while the acquisition window is
  open AND the player's match hasn't kicked off** (acquisition cutoff). ≥44px. It is a **launcher**:
  tapping it hands off to the **existing waivers BidComposer** on the Waivers screen — it is *not* an
  inline bid form. Window closed → no trailers, show a status line (not an error).

## Interactions & behavior
- **Row tap → player card.** Mobile = bottom sheet (`height:auto` up to a max, anchored bottom, `dvh`
  not `vh`); **sticky header with an always-reachable ✕** that never scrolls away; inner scroll must
  not chain to the page; the sheet and any overlay layer **above** the 64px tab bar. Desktop = centered
  modal.
- **Player card = existing two-tab card** (Points = season overview/breakdown; Stats = position-aware
  tile grid + per-match game log). Reuse its chrome. Mobile breakdown rows carry the same scoring
  tooltips as the desktop headers. Desktop card drops the tab switcher and shows **both** tabs side by
  side in 3 columns (Points breakdown · Stats tiles · Match-log table).
- **Sort** default = season points desc; the affordance is visible/sortable.
- **Load more** = paged reveal (25 at a time over ~1,204), not infinite scroll.
- **Filters** are AND-combined; the empty state names the active filters and offers Clear filters.
- Eliminated players are **visible by default**; Active-teams toggle collapses them.

## Rules that drive the UI (league mechanics)
- **Unique ownership:** exactly one manager per player league-wide (or Free agent).
- **Acquisition cutoff:** a player can't be claimed once *his* match kicks off → the bid affordance
  disappears/disables per player as well as per global window.
- All times stored UTC; display league-local.

## Scoring (illustrative pending SCORING.md — the exact strings shown in tooltips)
`Pld` Appearances +2 per match · `Min` +0.02 per minute · `G` Goals +9 each · `A` Assists +6 each ·
`CS` Clean sheets +4 (GK & DEF, full match) · `YC` Yellow cards −1 each · `Sh` Shots, `KP` Key passes,
`Tkl` Tackles = **tracked, not directly scored**. Keep every scored value flagged *illustrative* until
`SCORING.md` lands.

## Design tokens (source of truth: `ds/ds.css`)
- Accent **cobalt `#4D8DFF`** (marks *you* + primary actions only). **No gold anywhere.**
- Position badges: GK `#5E6E8C`, DEF `#4DA8FF`, MID `#19E08A`, FWD `#FF6B8A`.
- Functional: eliminated `#B05563`, win `#2FBF71`, locked/frozen `#7E8DA8`, yet-to-play `#E2873C`,
  danger `#E5484D`. Always pair color + icon + word.
- Fonts: **Schibsted Grotesk** (display/scores), **Hanken Grotesk** (UI/body), **JetBrains Mono**
  (stats/timers). Tabular figures wherever numbers align.
- Surfaces / hairlines / radii / spacing / shadows: use the `--surface-*`, `--hairline*`, `--r-*`,
  `--sp-*`, `--e*` tokens. Dark-first; light is a first-class `[data-theme="light"]` toggle.

## Mobile hard rules (from the live audit — must hold)
Tap targets ≥44px · use `dvh` not `vh` for sheet heights · reserve the bottom ~64px for the fixed tab
bar (nothing interactive under it) · overlays layer **above** the tab bar · every bottom-sheet/modal
has a sticky header with an always-reachable ✕ · inner scroll containment (no scroll chaining).

## Files in this bundle
- `Players.html` — the design reference (all 8 states, mock data, component vocabulary in one file).
- `ds/ds.css` — the design-token + component-class source of truth.
- `logo/trophy.png`, `logo/favicon-32.png` — brand assets the reference loads.

Mock data lives in the `<script>` at the bottom of `Players.html`: `NATIONS`, `KIT` (flag gradients),
`TEAMS` (12 managers), `PLAYERS` (~40 samples across positions/nations, mix of owned/FA, several
eliminated), and the `statsFor()` stub (replace with the real stats layer).
