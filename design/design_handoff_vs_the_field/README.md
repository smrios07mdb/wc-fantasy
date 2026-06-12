# Handoff: Vs the Field (live head-to-head surface)

## Overview
"Vs the Field" is the **heart of the XI World Cup fantasy app** — the live, in-match surface where a
manager (you) sees how you stack up against **every other manager at once** for a scoring period
(a Matchday), and drills into any opponent's actual XI to compare players and scores in real time.

The league is an **all-play-all ("power record")** game: each scoring period you are scored against
*every* other manager, not one opponent. So this screen has two jobs:
1. Show your standing across the whole field (a compact leaderboard + a "You vs the field" aggregate).
2. Let you open a **head-to-head (H2H)** against any single manager and study both lineups —
   players, live state, and points — side by side.

The defining mechanic this UI must make legible is **lock-on-play**: a player locks the instant he
plays ≥1 minute. Until then he is "to play" (pending points, still swappable). This surface shows it
through **kit brightness** on the pitch: lit = playing (locked), dimmed = played (locked & banked),
"to play" label = not started (still movable).

## About the Design Files
The files in this bundle are **design references created in HTML/React-via-Babel** — runnable
prototypes that show the intended look, layout, and behavior. **They are not production code to copy
directly.** They were built as standalone HTML using in-browser Babel + global `window` exports and a
hand-rolled CSS-variable design system; that scaffolding (the `vf-stage` presenter chrome, the browser
+ iOS device frames, the `▶ Play` sim bar, the `Feed: live/recon/stale/loading` buttons) is a **demo
harness, not part of the product**. Discard it.

Your task: **recreate these designs in the target codebase's environment** — the project is specced as
**Next.js (App Router) + React + TypeScript + Tailwind** — using its established patterns, real data,
and real realtime transport. Where this prototype fakes scoring with a scripted clock, you will wire to
the live scoring feed. Where it exports components to `window`, you will use real modules/imports.

## Fidelity
**High-fidelity (hi-fi).** Colors, typography, spacing, radii, component anatomy, states, and
interactions are final and intended to be matched closely. Exact token values are listed below
(they come from the shared design system `ds/ds.css`, which the whole app already uses). Recreate the
UI faithfully using the codebase's component library + Tailwind theme; map the tokens below into the
existing Tailwind config rather than inventing new values.

---

## Layout — desktop (≥ ~1100px content width)

The desktop screen is a single full-height column inside the app shell:

```
┌─────────────────────────────────────────────────────────────────────┐
│ TOP BAR  · brand "Vs the Field" + period sub · [This period|Season]   │  flex, 1px bottom hairline, surface-1
│          · spacer · "Updated just now" · ConnPill                     │
├─────────────────────────────────────────────────────────────────────┤
│ (connection banner: reconnecting / stale — only when not live)        │
├─────────────────────────────────────────────────────────────────────┤
│ MATCH STRIP · "Today" + horizontally-scrolling match cards (4)        │  flex, 1px bottom hairline
├──────────────┬────────────────────────────────────────────────────────┤
│              │  COMPARE BAND (3 ranked facts)                          │
│ LEADERBOARD  │  ┌─────────────────────────────────────────────────┐   │
│ (left rail   │  │ You  27  | LOSING −2 (live margin) | 29  Alvaro  │   │
│  228px)      │  └─────────────────────────────────────────────────┘   │
│              │  │ ② Upside still to come · ③ Player-by-player      │   │
│ • You vs the │  ┌──────────────────────┬──────────────────────────┐   │
│   field btn  │  │  YOUR XI (pitch)      │  THEIR XI (pitch)        │   │
│ • Standings  │  │  flag-kit tokens,     │  flag-kit tokens,        │   │
│   rows (N)   │  │  names, score lines   │  names, score lines      │   │
│              │  └──────────────────────┴──────────────────────────┘   │
├──────────────┴────────────────────────────────────────────────────────┤
│ FEED TICKER · "Live ●" + horizontally-scrolling scoring-event chips    │  flex, 1px top hairline
└─────────────────────────────────────────────────────────────────────┘
```

- **Body** is `display:flex`: a fixed-width **leaderboard** (`width:228px; flex:none; border-right`) +
  a flexible **main** column (`flex:1`) that scrolls.
- The main scroll area is a vertical stack with `gap:14px`: **CompareBand** → **two XI panels** (CSS
  grid `grid-template-columns:1fr 1fr; gap:14px; align-items:start`) → a caption line.
- When the **"You vs the field"** aggregate is selected instead of a manager, the main area shows the
  aggregate card (see Screens) in place of band + pitches.
- **Season** tab replaces the whole period view with the power-record standings table.

## Layout — mobile (iPhone, ~402px)

Leaderboard-first. The H2H two-pitches-side-by-side is too cramped on a phone, so mobile uses a
**You / Opponent pitch toggle** showing one full-width pitch at a time.

```
Header (title + ConnPill, [This period|Season] tabs)
─ default (period, nothing selected) ─────────────
  • "You" hero card (your pts, rank, record, still-to-come)
  • Match strip (horizontal scroll)
  • "You vs the whole field" button → aggregate
  • "Standings · tap to compare" + ranked rows (N)
  • Feed ticker
─ manager selected → H2H ──────────────────────────
  • ‹ Standings back button
  • Condensed compare band (You score | margin | Opp score + 2 fact rows)
  • Segmented [ You {pts} | {Opp} {pts} ]
  • One full-width pitch (flag-kit tokens) for the chosen side
  • tap a player → points-breakdown sheet (overlays the phone)
```

Desktop and mobile **share one `selected` state** (responsive parity): tapping a manager on either
form factor selects them everywhere; the desktop always shows a default opponent (your nearest rival
above you) when nothing is explicitly selected, while mobile shows the leaderboard list.

---

## Components

### 1. Leaderboard (left rail) — `.da-lb`
The shrunken "standings table." Prominent but quiet.
- **Container**: `width:228px`, `background: surface-1`, `border-right: 1px hairline`, vertical scroll.
- **"You vs the field" header button** (pinned top): 2×2 grid glyph + `<b>You vs the field</b>` +
  sub `record W–L · rank N`. Selected state = `box-shadow: inset 3px 0 0 accent` + `surface-2` bg.
- **Section label**: "Standings" / "live · pts" (micro, tertiary).
- **Row** (`.da-lb-row`): CSS grid `grid-template-columns:18px 26px 1fr auto; gap:9px; padding:8px 12px`,
  `border-left:3px solid transparent`.
  - Col 1: **rank** (`mono`, tertiary, centered).
  - Col 2: **Avatar** (initials chip, 26px; ring when it's you).
  - Col 3: **name** (`<b>` 13px; "You" for self) + **sub** (micro): when `live>0` a red
    `● {live} live · {ytp} left`; else `{ytp} to play`.
  - Col 4 (right, stacked, end-aligned): **points** (`font-display`, 800, ~17px) + your **H2H margin
    chip** — `W +n` (green), `L −n` (red), `D` (neutral); for self the chip reads "you" in accent.
  - States: hover `surface-2`; selected `surface-3` + `border-left tertiary`; **is-me** `accent-soft`
    bg + `border-left accent`.
- Clicking a row sets `selected = managerId` (loads the H2H).

### 2. Compare band — `.v2-band` (the 3 ranked facts)
The single most important block. Three facts, **ranked by importance**:
- **Primary row** (`grid 1fr auto 1fr`, padding 14px 20px):
  - Left: your Avatar (lg, ring) + `You` + meta `rank N · W–L vs field` + **score** (`font-display`
    46px/800, tabular).
  - Center: **verdict word** `WINNING` / `LOSING` / `LEVEL` (800, 0.1em tracking) over the **live
    margin** (`font-display` 34px/800, `+n`/`−n`) + micro label "live margin". Colored win/loss/draw.
  - Right (row-reverse): opponent Avatar (lg) + name + meta + score.
- **Secondary facts row** (`grid 1fr 1fr`, top hairline, each cell padded 11px 20px, divider between):
  - **Fact ②  "Upside still to come"**: `{myYtp}` of yours yet to play · they have `{theirYtp}` ·
    `+/−n player edge` (green if you have more still to come).
  - **Fact ③  "Player-by-player"**: rank both XIs by points, pair by rank, count slots you lead:
    "ahead in `{k}` of `{n}` slots · biggest edge `{F. Surname}` `+n`".
  - Each fact has a small ranked numeral chip ("2" / "3") and an uppercase micro label.

### 3. XI panel + formation pitch — `.da-xi` / `.da-pitch`
Each manager's XI rendered as a **vertical formation pitch** (this replaced an earlier white player-list;
do not bring the list back). Two panels sit side by side in the H2H.
- **Panel header** (`.da-xi-hd`, surface-2, bottom hairline): Avatar (sm; ring if you) + name + formation
  (`mono`, tertiary, e.g. "3-5-2") + **total** (`font-display` h3/800; pulses on increase).
- **Pitch** (`.da-pitch`): `flex:1; min-height:400px`, striped turf via two `repeating-linear-gradient`
  bands of `--pitch-1`/`--pitch-2` + inset shadow; subtle pitch lines (penalty boxes top/bottom +
  midline + center circle) drawn with low-opacity white borders. Lanes top→bottom = **FWD, MID, DEF,
  GK** (attack at top). Each lane is `flex; justify-content:space-evenly`.
- **Token** (`.sl-tok`, one per starter): a column of
  - **Jersey** (`.sl-jersey`, 46×46) — a shirt shape via `clip-path:polygon(...)`, **filled with the
    player's NATIONAL FLAG** (not position color). The flag fill is a multi-layer CSS `background`
    (see "Flag kits" below). A theme-aware ~2px outline (`--kit-outline`) separates kit from turf.
  - **Name** (`.sl-tok-name`, 700/10.5px, white with a multi-direction dark text-shadow halo so it
    holds on any kit color), shown as "F. Surname".
  - **Score line**: if "to play" → uppercase `to play` label; else a pill `● {pts} pts` (red live dot
    only when `live`). `mono`, small.
  - **Lock-on-play via kit brightness**: `live` = full-bright kit + red dot; `final/played` = kit
    `filter: brightness(.5) saturate(.7)` + name dimmed; `to play` = full-bright, no score, "to play".
  - **Tap** any token → opens the **player score sheet** (breakdown). (There is NO swap interaction on
    this surface — swapping lives on the Set Lineup screen.)

### 4. Player score sheet — `.vf-psheet` (floating breakdown)
Opened by tapping any player token (desktop or mobile). Anchored **within the current frame**
(`position:absolute; inset:0` scrim over the app/phone, centered card ~392px).
- Head: Pos badge + Flag + "F. Surname" + nationality + whose XI · **total** `{pts} pts` (font-display 30px).
- Match line: status pill (Playing/Played/To play) + `HOME h–a AWAY · {min}'/FT/KO soon`.
- Body: **categorized breakdown** (`ScoreBreakdown`) — groups the player's scoring events into
  categories (APP appearance, MIN 60+ mins, GOAL, AST assist, CS clean sheet, YEL yellow), each row =
  tag + label (×count) + per-unit math + subtotal; a bold **Total points** row that sums to the header.
  Empty states for "hasn't kicked off" and "on pitch, no actions yet."
- Note: "Point values illustrative · final scoring per SCORING.md" (see Open Questions).

### 5. Match strip — `.v2-matchstrip`
"Today" label + horizontally-scrolling **match cards**, one per real match in the period (4 here).
Each card: clock chip (`live` red `{min}'` with dot / `FT` steel / `KO soon` tertiary) + `HOME flag/code
· score · AWAY flag/code`. Cards are selectable (active = accent ring) — used to highlight a match
(optional filter affordance). This is the macro view of which matches are live, since each player's
lock state derives from his match's clock.

### 6. Feed ticker — `.v2-ticker`
Bottom strip: "Live ●" label + horizontally-scrolling event chips (newest first), each = type tag
(GOAL/AST/CS/YEL) + flag + player surname + owning-manager short name (in their color) + `+/−pts`.
Your own events use `accent-soft` background. Fresh events flash on arrival (animate **background +
transform only — never opacity from 0**, see Gotchas).

### 7. "You vs the field" aggregate — `.v2-agg`
Shown when the aggregate is selected (leaderboard header / mobile button). A calm, hairline-sectioned
card (max-width 560):
- Big points + "rank N of N".
- **RecordBadge** (the all-play-all W–L, e.g. `8–3`, win/loss-colored) + "scored against all N−1
  managers at once; this W–L is your record; ties break on points."
- A full vertical pitch of your XI + side stats (still to come / playing / played) + legend.
- **Swing rows**: "▲ catch {rivalAbove} +n" and "▼ holding off {rivalBelow} −n".

### 8. Season view (both form factors)
The power-record standings table: rank · manager · **Record (W-L-D)** · Win% · Points · per-period
W/L+pts chips (live period chip outlined). Ranked by **total wins**, ties broken on **total points**.

### Atoms reused from the design system (`vsfield/components.jsx`, `ds/ds.css`)
`Flag` (flag chip), `Pos` (GK/DEF/MID/FWD badge), `Avatar` (initials + presence dot/ring), `ConnPill`
(live/reconnecting/stale/loading), `RecordBadge`, `H2HResult`, `ScoreBreakdown`, `useScorePulse`
(flashes a number when it increases), `StatusTag`. Keep ONE of each across the app.

---

## Interactions & Behavior
- **Select an opponent**: click a leaderboard row (desktop) or a standings row (mobile) → `selected =
  managerId` → loads the H2H. Click "You vs the field" → `selected = 'field'` → aggregate.
- **Open a breakdown**: tap any player token / score line → floating score sheet; tap scrim or ✕ to close.
- **Mobile side toggle**: in H2H, segmented `You / {Opp}` switches which XI's pitch is shown.
- **Tabs**: This period ↔ Season (resets selection on mobile).
- **Score pulse**: any total/score that increases briefly flashes (`useScorePulse`, ~650ms).
- **Live node/dot pulse**: live red elements pulse gently (~2.6s) — pause/desaturate when connection is
  not `live`.
- **Connection states** (must all be handled): `live` (normal), `reconnecting` (info banner + spinner,
  "showing last known points", live indicators paused/dimmed), `stale` (muted banner "delayed · updated
  Xm ago", live dimmed), `loading` (skeletons). Empty/pre-kickoff: every player "to play", full XI
  swappable, "scoring hasn't started" banner.
- **Responsive**: desktop two-pitch H2H; mobile single-pitch with toggle. Both are first-class.
- **Motion**: respect `prefers-reduced-motion` (disable the pulses/flashes). Transitions use the
  DS easing/durations (`--ease-standard`, `--dur-fast` 120ms etc.).

## State Management
Per-surface state (all derived from the live feed in production):
- `t` / live clock — drives every player's status (ytp/live/final) and points. **In production this is
  the realtime scoring feed**, not a scrubber.
- `connection` — `live | reconnecting | stale | loading`.
- `view` — `period | season`.
- `selected` — `null | 'field' | managerId` (shared desktop+mobile).
- `activeMatch` — optional highlighted match id.
- `openPlayer` — `{ player, managerId } | null` for the score sheet (local per frame).
- `freshIds` — set of event ids that just arrived (for the flash), cleared after ~900ms.
- Mobile-only: `side` — `me | opp` for the pitch toggle.

**Derived data** (see `vsfield/data.jsx` + `vsfield2/shared.jsx` for the exact logic to port):
- `evalPlayer(player, t)` → `{ pts, status: ytp|live|final, matchMin, match, doneEvents }`.
- `evalManager` / `evalField(t)` → per-manager snapshot `{ total, ytp, live, final, rows[] }` + the
  **all-play-all provisional record** (`W` per manager you currently outscore, `L` per manager above,
  `D` on tie) + rank.
- `compareFacts(me, opp)` → the 3 ranked facts (margin, upside, lineup slots-ahead + biggest edge).
- Season: 2 completed periods + the live period → wins/points, ranked by wins then points.

---

## Design Tokens (from `ds/ds.css` — map these into the Tailwind theme)

**Fonts**
- Display / scores: **Schibsted Grotesk** (`--font-display`), weights up to 900.
- UI / body: **Hanken Grotesk** (`--font-sans`).
- Timers / raw stats: **JetBrains Mono** (`--font-mono`). Use **tabular figures** wherever numbers align.

**Color — dark theme (default)**
- Surfaces: `--surface-0 #0A0D12` (app bg) · `-1 #11151C` (cards) · `-2 #181D27` (rows/inputs) ·
  `-3 #212834` (hover) · `-4 #2B3340` (active).
- Hairlines: `rgba(255,255,255,0.08)` / strong `0.14`.
- Text: primary `#F1F4F9` · secondary `#A6B0C0` · tertiary `#6C7689`.
- **Accent (locked = cobalt) `#4D8DFF`** (soft `rgba(77,141,255,0.16)`, ring `…0.5`). Accent marks
  **only YOU + primary actions** — never a functional state. Alternates exist (emerald `#2FD39A`,
  violet `#8B7CFF`) as a theme option.

**Color — light theme** (`[data-theme="light"]`)
- Surfaces `#F4F6FA / #FFFFFF / #F0F3F8 / #E7ECF3 / #DCE3EC`; text `#0E1726 / #4C586B / #7A8699`.

**Functional colors** (always paired with icon + word, never color alone)
- live `#FF4D4D` · locked/steel `#7E8DA8` · yet-to-play (caution) **orange** `#E2873C` (light `#C26A1A`)
  — **NOT gold** · win `#2FBF71` · loss `#E5484D` · draw `#8B95A7` · eliminated `#B05563`.
- **GOLD IS BANNED project-wide.** Do not introduce any amber/gold.

**Position badge colors** (fixed, independent of accent)
- GK `#5E6E8C` (slate; white text) · DEF `#4DA8FF` · MID `#19E08A` · FWD `#FF6B8A`.

**Pitch / kit**
- Turf uses `--pitch-1`/`--pitch-2` (mixed with surface). Kit outline `--kit-outline` ≈
  `rgba(255,255,255,.82)` (dark) / `rgba(20,28,42,.5)` (light).

**Radii**: `--r-sm 6 · --r-md 8 · --r-lg 12 · --r-xl 16 · --r-pill 999`.
**Motion**: `--dur-fast 120ms`, `--ease-standard`; pulses ~1.4s (dot) / 2.6s (node).

---

## Flag kits (important detail)
The jersey fills are **CSS flag approximations** keyed by nation code (`JERSEY_BG_V2` in
`vsfield2/directionA.jsx`; the fuller 54-nation library lives in `setlineup/data.jsx` as `JERSEY_BG`).
Each is a **multi-layer `background` shorthand** whose layers carry their own sizes (cantons, stripes,
crosses).

⚠️ **Never set `background-size: cover` on a kit** — it collapses every layer to full-cover and the kit
renders as a solid block (e.g. USA → solid navy). Set the kit string as the element `background` and
leave `background-size` alone. In production, prefer real kit/flag SVG assets if available; otherwise
port the CSS gradients verbatim.

The 8 nations used in this mock: ARG, MEX, FRA, ENG, CRO, USA, BRA, POR. Real implementation should
cover all participating nations.

## Gotchas (learned building this — carry into production)
1. **Kit `background-size:cover`** — see above. Bit multiple screens.
2. **Entrance animations must not start from `opacity:0`** — in capture/preview iframes the animation
   may not tick and the element stays invisible. Animate `transform`/`background` only; keep opacity 1.
   (Applies to the feed ticker flash and any list-item entrances.)
3. **Text-bearing buttons on dark surfaces** must set an explicit `color` — bare `<button>` falls back
   to UA default black and vanishes on dark.
4. **N (manager count) is variable** — never hardcode 12. Derive from the field length.
5. **All times stored UTC**, displayed league-local — be explicit about which you render.
6. **Point values are illustrative** (no SCORING.md yet) — the UI is honest about this; the breakdown
   sums only canonical live events and flags the rest. Don't bake in scoring values.

---

## Files (in this bundle)
Production surface entry + its modules (load order matters; everything exports to `window` in the
prototype — convert to real imports):
- `Vs the Field.html` — entry; wires the stack + the (disposable) presenter stage.
- `vsfield2/v2.css` — **all redesign-specific CSS** (leaderboard `.da-lb`, pitch/tokens `.da-pitch`
  + `.sl-*`, compare band `.v2-band`, score sheet `.vf-psheet`, match strip, feed ticker, mobile `.ma-*`).
- `vsfield2/shared.jsx` — `compareFacts`, `V2Pitch`, `RichPlayerRow` (legacy), `CompareBand`,
  `YouVsField`, `FeedTicker`, `SeasonTable`, `playerCtx`.
- `vsfield2/directionA.jsx` — desktop H2H: `Leaderboard`/`LbRow`, `XIPitch`/`XIToken`, `XIPanel`,
  `kitOf`, `JERSEY_BG_V2`, `DirectionA`.
- `vsfield2/mobile.jsx` — `MobileVsFieldA` + `MaRow`/`MaCompare`/`MaH2H`/`MaYou`/`MaSeason`.
- `vsfield2/app.jsx` — store + sim + the desktop/mobile stage (the sim + frames are DEMO scaffold).
- `vsfield/data.jsx` — **the data model + scoring evaluation logic to port** (managers, matches,
  `evalPlayer/evalManager/evalField`, season power-record, name/flag data).
- `vsfield/components.jsx` — shared atoms (`Flag`, `Pos`, `Avatar`, `ConnPill`, `RecordBadge`,
  `H2HResult`, `StatusTag`, `ScoreBreakdown`, `PlayerScoreSheet`, `useScorePulse`).
- `vsfield/ios-frame.jsx` — iOS device bezel (DEMO scaffold; drop in production).
- `ds/ds.css` — the shared design system (tokens + base component classes). The whole app uses this.
- `tweaks-panel.jsx` — prototype-only tweak panel (accent/theme/density). DEMO scaffold; drop.

**To run the prototype**: open `Vs the Field.html` in a browser (needs network for the pinned React +
Babel CDN scripts). Use the `▶ Play` bar / `Now` / `Full time` / `Kickoff` to move the match clock and
the `Feed:` buttons to exercise connection states. None of that bar ships.

## Open questions (design-blocked, not invented — flag to product)
- **SCORING.md** doesn't exist yet → exact scoring categories & point values are illustrative. The
  box-score/breakdown layout is final; the *values* are not.
- How many all-play-all periods feed the group stage / seeding; deeper tie rules beyond "total points."
