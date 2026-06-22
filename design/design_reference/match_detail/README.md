# Handoff: Match Detail (Sofascore-depth live match page)

## Overview
A rich **match detail screen** for the XI World Cup fantasy app — opened when a manager taps a
fixture (e.g. from the dashboard match list or standings). It pairs **real-match depth**
(Sofascore-style lineups, statistics, events, ratings, group standings) with the app's **fantasy
lens woven through every player**: who in the league owns each player, and the fantasy points he is
earning live. The showcase fixture is **Spain 3–0 Saudi Arabia** (Group H, Matchday 2), driven by a
match clock so the whole screen animates from kick-off → live → full-time.

Two clearly-separated, always-labelled lenses:
- **RATING** — the 0–10 performance score (real match), shown in a colour-coded square.
- **FANTASY** — league points the player earns + which manager owns him (cobalt / accent lens).
The UI never blurs the two numbers.

## About the design files
The files in this bundle are **design references created in HTML/React-via-Babel** — runnable
prototypes showing intended look and behaviour, **not production code to ship directly**. The task is
to **recreate this screen in the XI codebase** (Next.js App Router + React + TS + Tailwind) using its
established components, tokens, and data layer. The `.jsx` files are in-browser-Babel prototypes; port
the **component structure, layout, and the data-shaping logic**, but wire the real data provider
instead of the mock sim.

**Discard these scaffold-only pieces** (they exist purely to demo both form factors on one screen):
- `vsfield/ios-frame.jsx` (the iPhone bezel) and the desktop "browser frame" chrome.
- `tweaks-panel.jsx` and the presenter **sim bar** (Play / clock / Kick-off·HT·FT / feed-state buttons).
- `useFitScale` and the `vf-stage` / `vf-frames` / `vf-browser` / `vf-phone` wrappers.
In the real app you render **one responsive screen** inside the global App Shell; "live" comes from
real data, not the sim clock.

## Fidelity
**High-fidelity.** Final colours, typography, spacing, component states, and interactions. Recreate
pixel-faithfully using the existing `ds/ds.css` design tokens (already in the codebase). All stat,
rating, and fantasy point **values are illustrative placeholders** — Claude Code should wire them to
the real match-data provider + the final SCORING.md values. Player names/ratings mirror the user's
Sofascore reference screenshots.

---

## Screen: Match Detail

### Top-level layout (desktop)
A single vertically-scrolling column inside the app content area (prototype frame 1180×980):
1. **Back / breadcrumb bar** — `‹ Back` pill · `Standings › Matchday 2 › Spain v Saudi Arabia` ·
   connection pill (Live/Reconnecting/Delayed/Loading) pinned right. Height ~44px, `--surface-1`,
   bottom hairline.
2. **Scoreboard** (always visible).
3. **Your-stake strip** (always visible).
4. **Tab bar** — Lineups · Statistics · Events · Ratings · Standings.
5. **Active tab content.**

Mobile is the same stack inside the device viewport: a compact header (`‹ Back` + conn pill), the
scoreboard, the stake strip, a horizontally-scrollable tab bar, then tab content. Two-column desktop
blocks (lineup lists, stat groups) collapse to one column on mobile.

### Component: Scoreboard (`.md-board`)
- Card: `--surface-1` with a faint top radial accent wash, `--r-xl` radius, 1px `--hairline`,
  padding 20px 24px 16px.
- **Main row** — `grid-template-columns: 1fr auto 1fr`:
  - Home: team name (right-aligned) + round flag-kit crest (46px circle). `Spain`, display font
    800, 24px.
  - Center (min-width 148px): **score** `3 – 0` (display 800, 46px; the two digits turn `--live`
    red while live), and a **clock pill** below — `32'` on `--live-soft`/`--live` while live;
    `Full-time` / `Half-time` / `Kick-off 16:00` otherwise (white-space:nowrap).
  - Away: crest + team name (left-aligned).
- **Scorers row** — two columns under a hairline: `⚽ Yamal 11'`, `⚽ Oyarzabal 21', 24'`
  (home right-aligned, away left-aligned), caption size.
- **Meta row** — centered, tertiary caption, dot-separated, nowrap items:
  `Sun 21 Jun 2026 · 16:00 · FIFA World Cup · Group H · Round 2 · Mercedes-Benz Stadium, Atlanta`.
- **Fantasy line** — under a dashed hairline: a `FANTASY` tag (accent-soft) + 
  `Feeds 9 of the league's XIs · 9 started, 5 benched` (counts computed from ownership).

### Component: Your-stake strip (`.md-stake`)  — *the personal hook*
A slim accent-tinted bar (`--accent-soft`, accent-28% border, `--r-lg`) directly under the scoreboard.
This is the first thing a manager wants when opening a live match — **how are MY players doing?**
- Left: `YOUR XI` tag (solid accent) + `3 in this match`.
- Center: a wrapping row of **player chips** (`--surface-1` pills): 18px round flag-kit · surname ·
  rating square · fantasy points. Each chip opens that player's sheet.
- Right: combined **`+11`** (display 800, 22px, accent) over a `YOUR FPTS` micro-label, divided by a
  left hairline.
- Updates live with the clock; hidden if the manager owns no players in the match.

### Tab: Lineups (default)
- **Formation pitch** (`.md-pitch`) — both teams on one pitch (desktop horizontal, 516px tall; mobile
  vertical, 660px). Striped green pitch (`--pitch-1`/`--pitch-2`), centre line/circle/penalty boxes.
  Formation tags top corners (`4-3-3`, `5-4-1` with flag). Players grouped into position lanes
  (home GK→FWD left-to-right; away mirrored).
  - **Player token** (`.md-tok`) — a **flag-kit jersey** (the player's national flag as the shirt,
    via clip-path), shirt number centered, name below (with multi-direction dark halo so white text
    holds on any kit). Corner badges: **rating square** (top-left, colour-coded) and **ownership**
    (top-right): a solid accent `YOU` chip if you own him, else a small rival-colour **dot**. Under
    the name: **fantasy points** chip — *muted grey* for baseline (appearance only), *bright accent*
    when he has a real return (goal/assist/clean-sheet) or is yours.
  - Tap a token → player sheet.
- **Legend** — explains rating square vs fantasy chip vs `YOU`/owned dot.
- **Lineup lists** (`.md-tl`, two columns) — per team: header (crest · name · formation · team-avg
  rating), **Starting XI** then **Substitutes** as rows (`.md-lr`: number · name · pos badge · owner
  chip · event glyphs · fantasy pts · rating square; your players carry an inset accent rail). Coach
  line at the bottom.

### Tab: Statistics (`.md-stats`)
- Toolbar: two team swatches+flags, and an **All / 1st-half** segmented toggle (1st-half enabled only
  after half-time).
- Live note while in progress: `● Live totals — updating as the match plays`.
- **Stat groups** (2-col on desktop): Overview (possession, xG, big chances), Shots, Attacking,
  Passing, Defending, Discipline. Each stat (`.md-stat`): `grid 48px 1fr 48px` top row (home value ·
  centered label · away value; leading side's value brighter), then a **two-sided bar** — home fill
  (`--mh` teal) growing left-from-center, away fill (`--ma` violet) growing right.
- **Stat-presentation is a Tweak**: `bars` (default) vs `numbers` (hide the bars). In production this
  can be a user/setting toggle or just ship bars.
- Counting stats scale with match progress; ratios (possession, pass %) stay; xG accrues.

### Tab: Events (`.md-events`) — timeline
- Header: home flag/name · `Match events` · away flag/name.
- **Center-spine timeline**, newest first. Full-width markers for Kick-off / Half-time · 3–0 /
  Second half / Full-time · 3–0. Event rows (`grid 1fr 64px 1fr`): home events bodies right-aligned in
  the left cell, away in the right cell, minute pill on the spine.
  - **Goal**: `⚽ Scorer` · `assist · Name` · owner chip + `+N fpts` (fantasy woven into the event).
  - **Sub**: `▲ On` (green) / `▼ Off` (red).
  - **Card**: yellow rect + player + reason. **VAR**: `VAR` chip + outcome + note.

### Tab: Ratings (`.md-ratings`) — player ratings board
- **Highest-rated podium** — top 3 cards (rank · flag-kit disc + number · big rating square · surname
  · team · fantasy pts). #1 card gets a subtle green wash.
- **Fantasy MVP** callout — accent bar: highest fantasy-points player + owner chip.
- **Full ranked list** — every rated player: rank · rating square · name+pos+team · owner chip ·
  fantasy pts (your rows get the accent rail). Tap → player sheet.

### Tab: Standings (`.md-standings`) — the match's group
- `🏆 Group H · Top 2 advance`. Table: `# · Team · P W D L GD GF Last Pts`. Top-2 rows get a green
  qualification position badge; the **two teams in this match are highlighted** (accent row tint +
  dot). `Last` = form chips (W/L/D). Tie-breaker note below.

### Component: Player sheet (`.md-sheet`) — modal, opens from any player
- Scrim + centered card (380px). Header: flag-kit disc + number · name (captain `C`) · pos+flag+team
  (+ sub-on/off minute) · **rating square (lg)** labelled `RATING` and **fantasy total** labelled
  `FANTASY`.
- **Ownership row**: owner chip; if benched by his owner → `On {Manager}'s bench — scores 0 to his XI`
  (the lock-on-play / bench nuance).
- **Points / Stats** segmented tabs:
  - *Points*: categorised fantasy breakdown (APP/MIN/GOAL/AST/CS rows × value, summing to total) +
    "Fantasy values illustrative" note.
  - *Stats*: this-match statline (goals, assists, shots, on-target, key passes, passes, pass %,
    touches, duels won/total, tackles, dribbles, fouls, fouled, recoveries, + saves for GK).

---

## Interactions & behavior
- **Tab switching** — local state; instant content swap.
- **Player tap** (token, lineup row, stake chip, ratings row, podium) → opens the player sheet
  overlay; scrim-click or ✕ closes.
- **Player-sheet tabs** — Points / Stats local toggle.
- **Stats half toggle** — All / 1st-half (1st disabled pre-HT).
- **Live updates** — in production, the match clock comes from the realtime feed. Everything derives
  from it: score, which events are shown, player ratings (ease toward final), fantasy points (accrue
  as event minutes pass), match-stat totals, the stake strip total. Score/points changes should
  pulse/flash subtly.
- **Connection states** — Live / Reconnecting (banner) / Delayed (dimmed) / Loading (skeletons).
- **Responsive** — desktop two-column blocks → single column on mobile; horizontal pitch → vertical;
  tab bar scrolls horizontally on mobile.

## State management
- `tab` (lineups|statistics|events|ratings|standings), `half` (all|first), `sheet` ({player, team} | null).
- `t` (match minute) + `conn` — **replace with realtime feed subscription** in production.
- Data selectors to port (pure, derive from `t`): `mdScore`, `mdPhase`, `mdRating(player,t)`,
  `mdFantasy(player,t)`, `mdLiveStats(t,half)`, `mdRatingsBoard(t)`, `mdTeamRating(team,t)`,
  `mdLeagueExposure(t)`, `mdMyStake(t)`, `mdEventsUpTo(t)`. See `matchdetail/data.jsx`.

## Design tokens (from `ds/ds.css` — already in the codebase)
- **Accent**: cobalt `--accent` `#4D8DFF` — marks **you** + primary actions only. **No gold anywhere.**
- **Functional**: live `#FF4D4D`, win/success `#2FBF71`, loss `#E5484D`, draw `#8B95A7`,
  locked/steel `#7E8DA8`.
- **Position badges**: GK `#F2B33D`, DEF `#4DA8FF`, MID `#19E08A`, FWD `#FF6B8A`.
- **Match-stat team hues** (this screen): home `--mh` `#3FA6B5` (teal), away `--ma` `#A98BD8`
  (violet) — neutral, not accent/functional, always paired with a flag.
- **Rating colour scale** (`mdRatingColor`): ≥8.0 `#1F9E63` · ≥7.0 `#46A05A` · ≥6.5 `#7C9B3E` ·
  ≥6.0 `#C7913A` · <6.0 `#D2544F`. White text.
- **Type**: display/scores **Schibsted Grotesk**, UI/body **Hanken Grotesk**, raw stats/mono
  **JetBrains Mono**; tabular figures where numbers align.
- Surfaces `--surface-0..4`, `--hairline(-strong)`, radii `--r-sm..xl/--r-pill`, `--e1..e3`,
  durations `--dur-fast/base/slow`. Theme: dark-first, `[data-theme="light"]` first-class.

## Data model & fantasy mechanics (port these — they are the product identity)
- **Fantasy ownership** — each real player maps to one league manager (`owner`), `null` = free agent;
  unique ownership league-wide. `benchedBy` = owned but on that manager's bench → **scores 0 to his
  XI** even while playing. Show owner everywhere a player appears.
- **Fantasy scoring** (illustrative `PTS`, position-weighted): appearance +2, 60-min +1,
  goal GK10/DEF8/MID6/FWD5, assist +3, clean-sheet GK5/DEF4/MID1/FWD0, yellow −1. Replace with
  SCORING.md. Baseline (appearance-only) renders **muted**; real returns render **bright**.
- **Lock-on-play** — a player locks the instant he plays ≥1'. On a live match every starter is
  already locked (self-evident); the nuance surfaces in the player sheet (bench → 0 to XI).
- **All-play-all stake** — the "Your XI in this match" strip + the league-exposure header make the
  manager's stake in this single fixture explicit.

## Assets
- **Flag-kit jersey library** (`JERSEY_BG` in `setlineup/data.jsx`) — pure-CSS national-flag fills used
  as shirts/crests/discs for ~54 nations (incl. ESP, KSA, URU here). **GOTCHA: these are multi-layer
  `background` shorthands with per-layer sizes — set `background` inline and NEVER add
  `background-size: cover`, which collapses them (e.g. Saudi → solid white).**
- Favicons / `logo/icon-tile.png` (the brand badge in the demo's stage logo) live in `logo/` in the
  main project — not bundled here; use the app's real brand assets.
- No images otherwise; everything is CSS + system fonts. No betting widgets (intentionally omitted).

## Files in this bundle
**The screen** (`matchdetail/`):
- `data.jsx` — the full match model (both lineups, bench, events, match stats, group table) + all the
  live-derivation selectors. **The most important file to port.**
- `components.jsx` — RatingBadge, FantasyPts (muted/pop logic), OwnerChip, KitToken (pitch jersey),
  Scoreboard, MyStakeStrip, StatBar, MatchPlayerSheet.
- `lineups.jsx` — formation pitch (both teams) + lineup lists + coaches.
- `stats.jsx` — Statistics tab (groups + half toggle + bars/numbers).
- `events.jsx` — Events timeline + Ratings board + Standings tabs.
- `desktop.jsx` / `mobile.jsx` — the two layout shells (tab bar + tab content).
- `app.jsx` — store + sim + stage wiring (**sim/stage are demo-only**).
- `md.css` — all `.md-*` styles + the shared presenter-stage chrome (stage chrome is demo-only).
- `Match Detail.html` — the host page (script load order).

**Reused foundations** (for reference — Code already has equivalents):
- `ds/ds.css` — design tokens + base component classes (source of truth).
- `vsfield/data.jsx` — `NATIONS`, `MANAGERS`/`mgr`/`ME_ID`, `PTS`, the match-clock helpers.
- `vsfield/components.jsx` — `Flag`, `Pos`, `Avatar`, `ScoreBreakdown`, `ConnPill`.
- `setlineup/data.jsx` — the `JERSEY_BG` flag-kit library + `FLAG_NAMES`.
- `vsfield/ios-frame.jsx`, `tweaks-panel.jsx` — **scaffold only, discard.**

**Screenshots** (`screenshots/`) — desktop + mobile reference captures:
- `01-lineups.png` — formation pitch + your-stake strip + scoreboard.
- `02-statistics.png` — stat groups with two-sided bars.
- `03-events.png` — center-spine timeline.
- `04-ratings.png` — highest-rated podium + Fantasy MVP + ranked board.
- `05-standings.png` — Group H table.
- `06-player-sheet.png` — the player modal (Points breakdown).
