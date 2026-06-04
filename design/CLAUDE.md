# CLAUDE.md — World Cup Fantasy · Design

Persistent project memory. Read this first, every session. It captures locked decisions,
the product's unusual mechanics, file conventions, and what's done vs next, so context
survives across conversations. Keep it updated as decisions land.

---

## 1. What this is
A **standalone web app for a private World Cup fantasy league**. ~12 managers (treat N as
**variable** — never hardcode 12), one ~month-long tournament, ~104 matches. Single-tournament
game modeled on **Sleeper.com's polish + depth**, redesigned for a World Cup.

**Claude Design owns UX/UI** (design system + screen designs + component specs). Claude Code
owns implementation in **Next.js (App Router) + React + TS + Tailwind**. We design *to* a locked
data schema — we do **not** redesign the schema, backend, or scoring values.

**Thesis:** the mechanics are unusual and a generic fantasy clone gets them wrong. The highest-value
design work is making these instantly legible. Guiding constraint translated for design:
**clarity & legibility over novelty.** When a flourish and a fact compete, **the fact wins**
(the score, the lock status, whose turn it is).

## 2. The unusual mechanics (design *for* these — they are the product identity)
- **Lock-on-play:** a player locks the *instant he plays ≥1 minute*. Until then he's freely
  swappable — a benched 0-minute starter is **NOT** locked. **No auto-subs.** UI must always make
  "who can I still move right now vs who's frozen" obvious, live, during matches.
- **All-play-all ("power record"):** each scoring period you're scored against *every* other
  manager, not one opponent. Standings = weekly **W-L record + total points**; ties break on total
  points.
- **Guillotine playoffs:** lowest scorer eliminated each knockout round on a **reduced roster**;
  survivors reinforce via FAAB. Per-round cut count ≈2 early, tapering to 1. **Playoff field size
  is flexible (likely 8 or 10), fixed only at the group→playoff transition.**
- **FAAB blind-bid waivers:** $100 budget, **resets to fresh $100 at playoff transition**. Bids are
  **sealed** (you see only your own pending). Batch results history. **Rolling waiver order.**
  **Void + refund** if you bid on a player whose match already kicked off. Free-agency fallthrough.
- **Acquisition cutoff:** can't pick up a player once *his* match kicks off.
- **Roster:** 15-man squad = **2 GK / 5 DEF / 5 MID / 3 FWD**. Unique ownership (one manager per
  player league-wide).
- **Lineup:** XI = **1 GK + 10 outfield**, formation bounds **min 3 DEF / 2 MID / 1 FWD**
  (3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-3-2, 5-4-1…), plus **4-man bench**. Enforce legality in UI.
  Multiple lineups in advance via per-period tabs.
- **Playoff reduced lineup:** cap ≈9 = **7 starters + 2 bench**, shape **1 GK + 6 outfield**
  (min 2 DEF / 2 MID / 1 FWD): 2-2-2 base, 3-2-1, 2-3-1; bench GK optional.
- **Time:** all data **UTC**-stored; **league-local** is a display concern (FAAB batch clock,
  kickoffs). Be explicit when showing times.

## 3. Locked design decisions
- **Theme:** dark-first (justified: evening match windows, OLED, functional colors pop). Light is
  a first-class toggle.
- **Accent: COBALT `#4D8DFF`** (locked default). Alternates kept: **Emerald `#2FD39A`** (refined,
  replaced the original neon green which read acidic) and **Violet `#8B7CFF`**. **GOLD is removed —
  never use gold.** Accent only ever marks *you* + primary actions; never a functional state.
- **Density:** Compact default; Comfortable available.
- **Fonts:** display/scores = **Schibsted Grotesk**; UI/body = **Hanken Grotesk**; timers/raw stats
  = **JetBrains Mono**. Tabular figures wherever numbers align.
- **Functional colors** (always color **+ icon + word**, never color alone): live `#FF4D4D`,
  locked/frozen `#7E8DA8`, yet-to-play `#F5B43C`, win `#2FBF71`, loss `#E5484D`, draw `#8B95A7`,
  eliminated `#B05563`, refund `#F09030`, danger `#E5484D`, success `#2FBF71`, info `#4D9BFF`.
- **Position badge colors:** GK `#F2B33D`, DEF `#4DA8FF`, MID `#19E08A`, FWD `#FF6B8A` (fixed,
  independent of accent).
- **Responsive:** desktop AND mobile both first-class. Draft often on laptops; live scores/lineups
  often on phones. Show both side-by-side for the live surfaces.
- **Mock data:** N=12 managers; **real national teams + plausible real player names**.
- **League name = PLACEHOLDER.** Use **"WC Fantasy League"** wherever a league name renders (it's a
  stand-in the user will set later). Defined per-surface: `AUTH_LEAGUE.name` (auth), `LEAGUE.name` (admin),
  `LEAGUE_INFO.name` (settings), and a literal in `notifs/desktop.jsx` brand. Keep all four in sync; when the
  real name lands it's a 4-spot swap. **Do NOT tropicalize / invent a locale** — no country flavor, no
  geographic team names, no locale-specific emails (use `@example.com` placeholders). The earlier "Pinoleros"
  / Nicaragua flavoring was removed at the user's request (and a stray "Copa Liga" dashboard brand literal — now
  "WC Fantasy League"). The shell adds a 5th spot: `SHELL_LEAGUE_NAME` (`shell/data.jsx`). Player/manager name pools stay as-is (the spec's
  "plausible real player names").

## 4. File conventions
- **`ds/ds.css`** = single source of truth for tokens + component classes. Every screen links it.
  Tokens are CSS custom properties on `:root`; theme via `[data-theme="light"]`, accent via
  `[data-accent="cobalt|green|violet"]`, density via `[data-density="comfortable"]`, all on `<html>`.
- Component classes already built: `.btn`(+primary/ghost/quiet/danger/sm/lg/block), `.input`
  `.select` `.textarea` `.field-*`, `.tabs/.tab`, `.tabline/.tabline-item`, `.pos`(+GK/DEF/MID/FWD),
  `.pill`(+live/locked/ytp/win/loss/draw/elim/refund/neutral), `.wld`(+W/L/D), `.avatar`(+sm/md/lg,
  `.presence-ring`, `.presence-dot.is-online`), `.dtable`(+`.row-me`), `.meter`(+is-low/is-empty),
  `.countdown`(+is-urgent/is-mine/.tick), `.score-pulse`, `.toast`(+success/danger/info/warn),
  `.alert`(+info/warn/danger), `.scrim/.modal/.drawer`, `.skeleton`, `.pcard`(+is-locked/is-owned),
  `.card/.card-2`, `.chip`, plus type helpers `.t-display-xl/.t-display-l/.t-h1..h3/.t-body/.t-sm/
  .t-caption/.t-micro/.t-label`, `.mono` `.num` `.display`, layout helpers `.row/.stack/.between/
  .gap-*`. **Reuse these — don't redraw.** Add new shared components to ds.css, not per-screen.
- **`Design System.html`** = the showcase + the canonical Tweaks panel reference.
- React prototypes: use the pinned React 18.3.1 + Babel script tags; split components into JSX
  files, export to `window`; name style objects uniquely (never `const styles`).
- **Tweaks panel:** vanilla protocol implemented in Design System.html (listens `__activate_edit_mode`/
  `__deactivate_edit_mode`, posts `__edit_mode_available`/`__edit_mode_set_keys`/`__edit_mode_dismissed`;
  defaults in an `/*EDITMODE-BEGIN*/…/*EDITMODE-END*/` block; mirror to localStorage). For React
  screens use `tweaks-panel.jsx` starter. Default tweaks to expose: accent, theme (+ density where useful).
- Filenames: descriptive, e.g. `Draft Room.html`. Register user-facing deliverables as assets.

## 5. Component-map discipline (for Code handoff)
Keep ONE vocabulary across screens: one PlayerCard, one StandingsRow, one Countdown, one
PositionBadge, etc. — reused, not re-invented. Phase 5 produces the screen → component → state map.

## 6. Screen inventory & phase tracker
**Phase 1 — Design system foundation — ✅ DONE** (`Design System.html` + `ds/ds.css`): tokens,
3 accent directions, full component library with states, Tailwind handoff block, Tweaks panel.

**Phase 2 — 3 flagship live/lock surfaces (interactive, with realtime states): ✅ DONE**
- [x] Draft room — ✅ DONE (`Draft Room.html` + `draft/data.jsx` + `draft/app.jsx`). Snake board
      (12×15, snake reversal w/ direction labels, live-pulsing current cell), server-synced 60s
      countdown (distinct "you're on the clock" vs watching, urgent <10s), autopick on expiry from
      queue→need→best-available, best-available list w/ search+position filters+owned-as-taken,
      live roster vs 2/5/5/3, drag-reorder draft queue (=autopick source, relationship explained),
      presence row, recent-picks ticker, pre-draft lobby + post-draft summary (grade/value pick),
      Synced connection pill, mobile reflow (Board/Available/Queue/Roster tab bar). Sim controls
      (Start/Pause/Sim-to-end/Restart) are demo affordances.
      Board cell = TWO LINES: compact top row (pos badge · flag · pick#) + player name on its own
      full-width line as "F. Surname" (first-initial + surname, not bare surname). Cells carry a
      **position tint** — `.dr-cell.tint-{GK|DEF|MID|FWD}` = ~13% position-color wash over surface-2
      + a 3px inset left stripe in the position color; name stays the dominant element. (Decided
      AGAINST fully-saturated position backgrounds — too loud at 180 cells, fights the cobalt
      current-cell highlight, hurts white-text contrast on gold/green.) Reuse this tint pattern for
      any future position-coded card grid.
- [x] Vs-the-field — ✅ DONE (`Vs the Field.html` + `vsfield/{data,components,desktop,mobile,app}.jsx`,
      reuses `vsfield/ios-frame.jsx`). Shows **desktop + mobile side-by-side**, fit-scaled, driven by
      ONE shared sim state (responsive parity demo). Live all-play-all surface for a scoring PERIOD
      (Matchday): every starter is tied to one of today's 4 staggered real matches, so lock-on-play is
      legible — the **XI is shown as a formation pitch** (PitchMini): each starter is a node placed in
      the lineup's shape, styled by live state per the legend — PLAYING (lit red, gentle pulse on the
      large pitches) · PLAYED (filled steel-blue `--node-played #6E86B4`) · TO PLAY (faint empty ring =
      "white space"). The fill-vs-empty + colour contrast reads at a glance; pitch enlarged on desktop
      (table 140×64) so the formation is appreciable per-row. No gold. Per-row horizontal mini-pitch in
      the table; full vertical pitch + side counts (still-to-come / playing / played) in the hero. Primary upside element = **count of starters
      yet-to-play** ("Upside left" column + hero "still to come" stat + the hollow nodes). **You-vs-field
      rail** (calm, hairline-sectioned): provisional all-play-all record (e.g. 8–3) w/ "beating 8 of 11" +
      short note, big points + rank, the pitch, swing (nearest catch / holding-off). **Per-opponent H2H**: click any row → two-column XI compare w/ margin + each side's
      ytp; mobile drills in (shared `selected`). **Season view** = power-record standings ranked by total
      WINS (ties on total pts — Wilmer>Marlon on wins despite fewer pts demonstrates it), per-period W/L+pts
      chips, live period chip outlined red. **Scoring feed** = the match goals/assists/CS, mine accented,
      fresh events flash. Score changes pulse (`useScorePulse`). States via presenter sim bar: Play/scrub
      minute clock, **Live / Reconnecting (banner) / Stale (delayed + dimmed live dots, "1:34 ago") /
      Loading (skeletons) / Empty (Kickoff, t=0, full XI swappable)**, Full-time. Point VALUES are
      illustrative (flagged in-UI) pending SCORING.md. Reusable widgets added: XIBar, RecordBadge,
      H2HResult, MatchStrip/MatchCard, FeedItem, ConnPill, useScorePulse — keep for standings/box-score.
- [x] Set lineup — ✅ DONE (`Set Lineup.html` + `setlineup/{data,components,desktop,mobile,app}.jsx`,
      reuses `vsfield/{data,components,ios-frame}.jsx` + `tweaks-panel.jsx`). **Desktop + mobile
      side-by-side**, one shared sim (same stage pattern as Vs the Field). My 15-man squad mapped onto
      today's 4 staggered matches so **lock-on-play is live**: each player's state derives from HIS
      match clock — **movable** (match not kicked off — swap freely, incl. a benched 0-min starter) ·
      **locked·playing** · **locked·played**. No auto-subs. Can't move a player (in OR out) once his
      match starts. **Tall vertical formation pitch** (`.sl-pitch`, flexes to fill the 980px-tall
      browser frame) is the primary surface; lanes FWD→GK top-to-bottom.
      • **Lock legible via the KIT, not a badge** (we tried a corner armband — too small, killed the UI;
        removed). Playing = full-bright kit; played = kit dimmed (brightness .5 + saturate .7); movable =
        full-bright + "TO PLAY" label. A **score line under each token** (neutral pill, red pulsing dot
        when live) shows live/banked points; **click any score → `PlayerScoreSheet`** minute-by-minute
        breakdown (values illustrative pending SCORING.md). Scores also on bench/XI-list rows (`ScorePill`).
      • **Jersey = the national FLAG**, not position color. Built a reusable **`JERSEY_BG` flag-kit
        library in `setlineup/data.jsx` covering 54 nations** (helpers `_vt/_ht/_vb/_hb/_dot/_cross/_nordic`;
        emblem-heavy flags are recognizable approximations, not exact). Also extends `NATIONS` so the small
        `<Flag>` chips render for every country. **Kit outline**: theme-aware `--kit-outline` (~2px white in
        dark / dark in light) so kits separate from the green (fixes Brazil-on-green). Player **names carry a
        multi-directional dark halo** so white text holds on any pitch/kit shade in both themes.
      • **Formation picker first** (segmented legal shapes; a shape that would force a LOCKED player off the
        pitch is disabled w/ lock glyph). Pick formation → `reshape()` keeps locked starters, fills from
        unlocked, surplus→bench, shortage→empty (+) slots. **Swap = drag-and-drop default** (tap-select &
        action-sheet are Tweaks): pick a movable player → eligible same-position targets highlight (accent),
        everything else dims; `canSwap`/`eligibleTargets` enforce legality (never move/displace a locked man;
        slot↔bench must match position). `SelectionHint` explains the rule + adapts to swap mode.
      • **Per-period tabs** = current + next (`PERIODS` md3 live / md4 ahead). **Playoff reduced variant**:
        9-man squad (`SQUAD_PO`), 7 starters + 2 bench, shapes `FORMATIONS_PO` 2-3-1/3-2-1/2-2-2 (min
        2DEF/2MID/1FWD). Exposed BOTH ways — a `⚔ Playoff` demo toggle in the sim bar AND it reads reduced
        when the playoff period tab is selected. **Autosave** + "Next lock in Xh" countdown + "Autosaved ·
        Xm ago" stamp; **LockHero** has 3 variants (summary default / deadline / strip) as a Tweak.
      • States via presenter sim bar: Kickoff (t=0, full XI swappable) → progressive locking → Deadline
        (all matches started, frozen) + Live/Reconnecting/Stale/Loading. **Tweaks**: swap interaction,
        pitch tokens (jersey/named/disc+list), lock hero, theme. Accent LOCKED to cobalt, density LOCKED to
        comfortable (per user — green/violet/compact removed from this surface's panel).
      Reusable: `JERSEY_BG`+flag helpers, `PitchToken`/`Pitch`, `ScorePill`/`PlayerScoreSheet`,
      `FormationPicker`, `LockHero`, the kit-outline + name-halo pattern — carry into roster/box-score.

**Phase 3 — Core screens — ✅ DONE (5 of 5):**
- [x] **Dashboard — ✅ DONE** (`Dashboard.html` + `dashboard/{data,components,desktop,mobile,app}.jsx`).
      Status-aware HOME, desktop+mobile side-by-side on one sim. **Phase switcher (5 states)** in the
      presenter bar: pre-draft (countdown + readiness grid) · draft (on-the-clock + squad forming + recent
      picks) · group (record / lock-on-play / waivers / standings / fixtures / activity modules) · playoff
      (guillotine survival bracket, cut line in `--elim` red) · complete (champion + podium + season recap).
      **Phase-aware `PrimaryBanner`** (headline+CTA, colored by FUNCTIONAL state live/elim/win/info via
      `--phc`, never accent). **Global nav** links every screen (it's the integrative hub). **Tweaks**:
      model hub↔router (router = focused "what matters now" + jump chips), hub layout grid(masonry)↔spotlight,
      theme. `dashboard/data.jsx` aggregates reuse `evalField`/`recordForPeriod`/`seasonTable`,
      `buildLineup`+`lineupSummary` (lock), `ROSTER_FAAB`/`faabLeft`. Module set per phase in `modulesFor()`.
- [x] **My Team / Roster — ✅ DONE** (`My Team.html` + `roster/{data,components,desktop,mobile,app}.jsx`).
      Full 15-man squad GROUPED by position w/ legality vs 2/5/5/3 (per-group + `LegalityStrip` verdict),
      lock-on-play status (`LockTag`), this-period pts (`ScorePill`→`PlayerScoreSheet`) + season figure,
      starter/bench (green dot-pill "Starting" vs muted "Bench"). FAAB meter + Set-Lineup CTA in header.
      Row kebab/sheet → View box-score · Open in Set Lineup · **Drop** (blocked when locked-on-play; drop
      removes player so legality goes red, ↺ Restore in sim bar). **Tweaks**: layout grouped↔table, theme.
      `roster/data.jsx` adds `ACQ`/`acqLabel`, `SEASON_PTS_PLAYER`/`seasonPts`, `ROSTER_REQ`, `ROSTER_FAAB`/
      `faabLeft`, `playerFixture`, `canDrop`. Reusable `KitChip` (flag-on-shirt).
- [x] **Player detail / box-score — ✅ DONE** (`Player Box Score.html` + `boxscore/{data,components,desktop,
      mobile,app}.jsx`). ~25 categories grouped Attacking/Defending/Discipline/Goalkeeping/Bonus, each row
      = period stat · Pts · season stat (BOTH timeframes). **Honesty contract** (SCORING.md missing): hero
      period total = `evalSquadPlayer().pts` (matches ScorePill everywhere) and the **Pts column SUMS to it**
      (only canonical live events score; other rows show "—", flagged illustrative). Hero season total =
      `seasonPts()`. Position-aware (GK→Goalkeeping group + Saves tile; outfield→Clean-sheet tile).
      **Tweaks**: lead (tiles always first, then form[default]/points-timeline+match-log), breakdown
      grouped↔table, theme. Player switcher + `?p=<id>` deep-link (roster "View box-score" → here; back → roster).
- [x] **Standings — ✅ DONE** (`Standings.html` + `standings/{data,components,desktop,mobile,app}.jsx`).
      The canonical all-play-all POWER RECORD table, desktop+mobile on one sim. `standings/data.jsx`
      `buildStandings(t)` reuses `evalField`/`recordForPeriod`/`SEASON_PTS` (same logic as `seasonTable`)
      but adds per-period detail + movement: cumulative W/L/D summed across 3 periods (2 from SEASON_PTS,
      md3 live from the sim), **ranked by total WINS, ties on total POINTS** (the `stCmp` comparator;
      PF column carries a dotted "tiebreak" underline when a row is level on wins). Scrubbing the sim bar
      moves md3 points → the table **reorders live**. Columns: seed# · manager (me accented) · W–L–D ·
      Win% · PF · **form strip** (per-matchday all-play-all mini-record chips, md3 chip red-outlined live) ·
      **movement ▲▼** (vs rank through completed periods only). **Cut line** divider after seed N with
      qualifiers/eliminated split (`cutContext`), `--elim` styling, "field size locks at group→playoff
      transition" note. **Row click → expand**: per-period breakdown (pts · record · winning/losing week)
      + plain-words cut edge ("2 wins clear of the cut line"). Context band = leader · your seed (in/out) ·
      cut summary (on the line / first out). **Tweaks**: playoff field size 8↔10 (cut line moves), theme.
      Accent LOCKED cobalt, density LOCKED comfortable. Reusable: `Move`, `FormChip`/`FormStrip`, `Seed`,
      `StandingsTable`/`StandRow`/`RowDetail`, `buildStandings`/`cutContext`/`winPct` — carry into the
      playoff seeding screen.
- [x] **Free-agent browser — ✅ DONE** (`Free Agents.html` + `fa/{data,components,desktop,mobile,app}.jsx`).
      Waiver-wire browser, desktop+mobile on one sim. `fa/data.jsx` builds a deterministic ~48-player pool
      (regional name pools per the 8 nations playing today) each tied to one of today's 4 staggered matches,
      so the **acquisition cutoff** rides the SAME clock as lock-on-play: `faCutoff(p,t)` → open (match ytp,
      claimable) with a **per-player countdown to HIS kickoff** (orange/urgent ≤18′ out) vs **closed**
      (match started → locked-out, CTA disabled, locked styling). **Unique ownership**: free agents
      (owner=null) by default + an "**include rostered**" toggle reveals owned players dimmed w/ owner avatar
      (`faAvailable`). Search + position segmented filter + **sorts** (Season pts default · Position ·
      Kickoff-urgency via `faList`). Cutoff-grounded **match strip** up top (claims open / cutoff passed per
      match). Count band (available now / past cutoff / rostered league-wide) + rule line (can't claim once
      his match KO's · blind $100 FAAB · squad full 15/15 so a claim drops). Row/card list = **density Tweak**
      (`FaRow` list default ↔ `FaCard` cards). FAAB **bid flow DEFERRED to Phase 4** — `Place bid` CTA
      (disabled past cutoff) opens `FaBidPreview`: sealed-bid PREVIEW w/ FAAB meter + amount stepper + rules
      (sealed · processes at next batch · tie→rolling waiver order TBD · void+refund if his match KO's),
      explicitly flagged "full flow ships with waivers screen". Closed-state preview shows the void+refund
      warning. **Tweaks**: density list↔cards, theme. Accent LOCKED cobalt. Reusable: `FaKit` (flag-on-shirt
      + theme-aware `--kit-outline`), `FaFixture`, `CutoffTag`, `FaStats`, `Acquire`, `FaBidPreview`,
      `faCutoff`/`faList`/`faCounts` — carry into the Phase-4 FAAB/waivers screen.

**Shared vocabulary now spanning screens** (keep ONE of each for Code handoff): `KitChip`/`JERSEY_BG` flag-kits,
`Pos`/`Flag`/`Avatar`, `LockTag` + lock-on-play status model, `ScorePill`/`PlayerScoreSheet`, `RecordBadge`/
`H2HResult`, `MatchStrip`, `ConnPill`, `useScorePulse`, the presenter sim-bar + fit-scaled desktop+mobile STAGE
(`vf-stage`/`vf-frames`/`vf-browser`+`vf-phone`), the iOS frame, the `Module` card + `PrimaryBanner`. Cross-links
live: roster→box-score (`?p=`), dashboard nav→every screen, roster/dashboard→Set Lineup & Vs the Field.

**Phase 4 — Specialized — ✅ COMPLETE (6 of 6):**
- [x] **FAAB / waivers — ✅ DONE** (`Waivers.html` + `waivers/{data,components,desktop,mobile,app}.jsx`).
      Desktop+mobile on one sim. **Tabbed**: *My claims* + *Batch results*. `waivers/data.jsx` reuses
      `FA_POOL`/`faCutoff`/`faAvailable` (claim targets ride the SAME acquisition-cutoff clock as lock-on-play)
      + `SQUAD`/`statusOf`/`seasonPts` (drops, can't drop locked-on-play) + `ROSTER_FAAB`/`faabLeft`.
      • **Blind sealed bids**: each pending claim = add player + drop + sealed $ amount + reorderable
        priority. `BidComposer` (place/edit): left = claimable-FA picker (search + pos filter, shows
        `rivalBids()` sealed counts — "N rivals bidding", amounts MASKED), right = amount stepper (capped at
        `faabState().left`) + drop picker + rules. Full working flow (place/edit/cancel/reorder in `app.jsx`).
      • **`FaabBar`** = available vs after-pending budget (committed pending overlaid on the $100 track).
        **`WaiverOrderRail`** = rolling waiver order with my priority (#4). **TIE-BREAK RESOLVED: equal
        bids break on the rolling waiver order** (no longer TBD — stated definitively in the rail note,
        composer, foot notes). **Fully sealed** — we DON'T show rival bid counts (user call; the old
        "N rivals bidding" / `rivalBids` display was removed everywhere; you see only your own claims).
      • **Void + refund** is LIVE via the sim: a pending claim whose target's match has kicked off
        (`claimStatus(bid,t)==='void'`) flips to a refund state — scrub the clock to demo (one initial claim
        sits on an already-started match). **Batch results** (`HISTORY`) reveal sealed winning amounts post-
        processing, "beat N bids", drops, won/lost/**void+refund** outcomes; mine accented. Results layout
        timeline↔table = Tweak. **Playoff FAAB reset** = a `⚔ Playoff reset` sim toggle → budgets return to a
        fresh $100 + banner (group→playoff transition). Next-batch countdown labeled illustrative cadence.
      • **Tweaks**: results layout (timeline/table), theme. Accent LOCKED cobalt, density LOCKED comfortable.
        Reusable: `FaabBar`, `WaiverOrderRail`, `ClaimRow`/`MClaim`, `BidComposer`, `ResultItem`/`ResultsBatch`,
        `faabState`/`claimStatus`/`claimableFAs`/`droppableSquad` — carry into commissioner overrides.
      • **KIT-RENDER FIX (project-wide gotcha):** the flag kits in `JERSEY_BG` are multi-layer `background`
        shorthands whose layers carry their OWN sizes (cantons, crosses, stripes). NEVER set
        `background-size:cover` on a kit chip — it collapses every layer to full-cover (e.g. USA → solid navy,
        reads black). Match `roster`'s `.rt-kit`: `background:var(--surface-4)` base + inline
        `style={{background:JERSEY_BG[nat]}}`, no size override. Fixed on Free Agents + Waivers' `.fa-kit`.
      • **Button-text color gotcha:** any text-bearing `<button>` on a dark surface MUST set an explicit
        `color` (e.g. `var(--text-primary)`) — bare buttons fall back to the UA default (black) and vanish
        on dark. Bit us on the composer's FA picker + drop picker; fixed.
- [ ] **Guillotine playoffs** — ✅ DONE (`Guillotine Playoffs.html` + `playoffs/{data,components,desktop,mobile,app}.jsx`).
      Desktop+mobile on one sim (same `vf-stage`/`vf-frames`/`vf-browser`+`vf-phone` + presenter sim bar + iOS frame).
      **Seeding feeds from standings**: `poSeeds(field)` = qualified rows of `cutContext(buildStandings(PERIOD_END))`.
      MECHANIC made legible: knockout rounds where survivors PERSIST; lowest scorer(s) guillotined each round on
      a reduced roster. Opens MID-ROUND, LIVE on **Round 2 of N** (Round 1 already settled), so a forming cut line
      moves as you scrub. `buildGuillotine(field,preset,t)` builds all rounds: round1 = fixed `PO_R1_PTS`; round2 =
      live `PO_R2_STEPS` timelines tied to the 4 staggered kickoffs (lock-on-play); rounds 3+ = projected count
      placeholders (participants unknown until prior round locks — honest, not invented). Authored so **YOU sit 6th
      of 8 at the default minute — one place above the blade, +1 clear** — with Fran (group seed #1!) facing the cut
      (seed doesn't protect you in a fresh-scoring round). Scrub earlier → you dip into the zone; scrub to FT → late
      surge clears you to 5th. **"Blade drops"** sim jump (t=PERIOD_END) locks the live round: blade graphic slides
      down, in-zone rows go struck-through Eliminated.
      • **The guillotine graphic** (user ask: "a graphic red line with a guillotine on top, make it fun"):
        `GuillotineCutLine` = a centered guillotine SVG (posts + crossbar + sliding **`.po-blade`**, idle sway via
        `po-sway`, drops on lock) sitting on a **red dashed blade line** spanning the table, `--elim` throughout.
        Inserted between the last survivor and the first cut row. Mobile has a condensed version.
      • **Reduced-roster constraint** reuses Set-Lineup PLAYOFF mode exactly: `MyReducedPitch` renders my real
        `buildLineup('playoff','2-3-1')` (1 GK + 6 outfield + 2 bench) with live lock states (`statusOf`) + live pts
        (`evalSquadPlayer`) + flag kits (`JERSEY_BG`, no `background-size:cover`). Per-survivor `ShapeChip` ("7+2 ·
        1 GK · 6 out", with a node-shape mini) toggled by the **reduced-shape Tweak**.
      • **FAAB reinforcement**: `ReinforceModule` = "Reinforce your survivors" with `FAAB reset to $100` tag + meter +
        **CTA → Waivers.html**, in the rail; mobile has a compact version.
      • **Two layouts (Tweak)**: `board` (default — current-round leaderboard + guillotine + your-survival hero +
        reduced-lineup/reinforce rail + round-nav to inspect any round) ↔ `ladder` (rounds as columns L→R; R1 settled
        w/ eliminated struck, R2 live w/ cut line, R3+ projected). **Tweaks**: field 8↔10 (provisional, reflows the
        field — fewer spots pushes YOU into the zone), cut-count schedule (`default` taper 2→1 / `steep` / `gentle`,
        all flagged provisional · commissioner-set — the OPEN GAP, surfaced not invented), layout, reduced-shape,
        theme (light first-class). Accent LOCKED cobalt (marks only YOU + primary CTAs, never the cut), density
        comfortable. **Variable N** throughout (`MANAGERS.length`).
      Reusable: `GuillotineCutLine`/`GuillotineIcon` + `--po-frame` tokens, `SurvivorRow`/`MPoRow` + safe/zone/elim
      states, `RoundColumn`/ladder, `MyReducedPitch`/`PoNode`, `ReinforceModule`, `ShapeChip`, `buildGuillotine`/
      `cutSchedule`/`poSeeds`/`poMyMargin` — carry into the commissioner cut-config screen.
- [x] **Commissioner/admin — ✅ DONE** (`Commissioner.html` + `admin/{data,components,panels,desktop,mobile,app}.jsx`).
      is_commissioner-gated console, desktop+mobile on one sim (same `vf-stage`/`vf-frames` + presenter sim bar + iOS
      frame). **Visually distinct via a slate "elevated privileges" treatment** — `--adm-edge` slate `--locked` chrome
      (banner/ribbon/badge), cobalt RESERVED for actions, **never gold** (warning variant uses `--ytp` orange, not gold).
      Four tabbed tasks: **(1) Playoff field — THE OPEN GAP** (field size 8↔10 + cut schedule default/steep/gentle via
      `fieldPlan`→`cutSchedule`/`poSeeds`; bracket-shape preview + qualified seeds from group power record; **Lock field**
      is irreversible → **type-to-confirm** "LOCK"; provisional until locked). **(2) Stat corrections** — full per-player
      line editor (`STAT_CATS` grouped Appearance/Attacking/Defending/Goalkeeping/Discipline, position-aware via
      `catApplies`, steppers/toggles, `catPts`/`linePts` recalc → recorded→corrected delta, illustrative-flagged; one
      authored discrepancy: Lautaro recorded 1 goal, scored 2). **(3) Game operations** — poller-silent ALERT (sim toggle)
      w/ recovery CTAs, lock-on-play fallback auto↔scheduled, scoring source live↔manual, **period-freeze** override
      (type-to-confirm "FREEZE"). **(4) Draft setup** — date/time, snake/linear, pick clock, autopick, order + randomize.
      **Audit log**: append-only, every action logged w/ actor+when+reversibility; reversible entries have a Reverse
      action (confirm). **View-as / impersonation**: prominent switcher → read-only `ManagerView` (seed/record from
      `cutContext(buildStandings)`), commissioner controls hidden. **Confirmation model**: high-stakes = type-to-confirm
      (`ConfirmModal` confirmWord); consequential = confirm-with-summary; all → audit + toast. **Tweaks**: admin-look
      (ribbon/banner/steel/warning), console layout (live-editing rail ↔ audit-spine), theme. Accent LOCKED cobalt,
      density comfortable. Variable N throughout. Reusable: `AdmCard`/`AdminRibbon`/`CommishBadge`, `ConfirmModal`
      (type-to-confirm), `AuditLog`/`AuditEntry`, `ViewAsSwitcher`/`ViewAsBanner`/`ManagerView`, `SegRow`/`Stepper`/
      `PollerStatus`, `STAT_CATS`/`catPts`/`linePts`, `fieldPlan` — carry into auth/settings. Still-open gaps flagged
      in-UI: exact cut counts + final field (8 vs 10) are commissioner-set here but the spec value is TBD; SCORING.md
      values illustrative.
- [x] **Auth/join — ✅ DONE** (`Join.html` + `auth/{data,components,app}.jsx`). Logged-out magic-link flow,
      desktop+mobile on one sim (reuses `vf-stage`/`vf-frames`/`vf-browser`+`vf-phone` + iOS frame; auth is one
      responsive `<AuthFlow>` rendered in both, NOT separate desktop/mobile files). **PRIVATE LEAGUE = the identity:**
      passwordless **magic-link** primary + optional **Google** (Tweak); **allowlist/invite-gated** — a valid,
      well-formed email that ISN'T invited is rejected (`ALLOWLIST`/`onAllowlist`, `emailValid`). State machine
      (`auth/data.jsx` AUTH_VIEWS) driven by a presenter sim bar (Flow jumps + Errors jumps + Reset), fully
      interactive: type email → Send → 850ms → **check-email** (allow-listed) or **not-invited** (denied); check-email →
      "open the link" → **verifying** → **success** (You're in! + roster avatars + Enter the league → Dashboard.html).
      Error views: **not-invited** (allowlist gate, shield/danger, ask-commissioner), **link-expired** (15-min validity,
      warn/ytp), **rate-limited** (warn). Invite mode prefills `INVITE.email` + shows an `InviteBanner` ("Marlon invited
      you") + social-proof roster avatars + spots-left. **Tweaks**: entry point (invite link ↔ plain sign-in), Google
      (show/hide), desktop layout (centered card ↔ split brand panel w/ value props), theme. Accent LOCKED cobalt.
      Functional colors only (success=win, denied=danger, expiry/ratelimit=ytp; gold-free). Reusable: `AuthFlow` +
      view components, `RosterAvatars`/`InviteBanner`/`PrivateTag`, the centered↔split shell.
- [x] **Notifications/alerts — ✅ DONE** (`Notifications.html` + `notifs/{data,components,desktop,mobile,app}.jsx`).
      Notification center, desktop+mobile on one sim (same `vf-stage`/`vf-frames` + presenter sim bar + iOS frame).
      Feed is grounded in the league's real mechanics so each alert is legible: **lock-on-play** windows (player kicks
      off → locks), **FAAB** waiver wins/losses + **void+refund**, **all-play-all** scoring + power-record movement,
      **guillotine** survival/cut-line/elimination, **commissioner/league** actions, **draft** clock. `notifs/data.jsx`
      = authored `NOTIF_HISTORY` (relative ages, read flags, CTAs deep-linking every screen, optional player kit refs) +
      `NOTIF_LIVE` (6 arrivals tied to the 4 staggered kickoffs — `buildFeed(t)` prepends them as the match clock
      passes their minute, popping an in-app **toast**). Categories carry **functional color + icon + word** (`NOTIF_CATS`
      tone→ds token: live/refund/win/info/elim/locked/accent; gold-free). Item = `CatIcon` + title/body + `nt-tag` +
      player `NotifKit` (flag-on-shirt, no `background-size:cover`) + CTA + unread dot. **Filters** (All · Locks · Waivers ·
      Scores · Playoffs · League) w/ unread counts; **mark-all-read**; **grouping** time↔category (Tweak). **Preferences
      rail/sheet** = per-category × 3-channel (push/email/in-app) matrix + quiet-hours switch. **Live toasts** slide in
      (win-tone etc.), auto-dismiss, dismissible; a **🔔 Test alert** presenter button fires one on demand. **Bell** w/
      unread badge in the top nav. **Tweaks**: group-by (time/category), in-app toasts (on/off), theme. Accent LOCKED
      cobalt, density comfortable. Variable N. **GOTCHA (project-wide):** never give list-item / toast ENTRANCE
      animations an `opacity:0` from-state — in the capture/preview iframe the animation may not tick and the element
      stays invisible (bit both the live feed items + toasts). Animate transform/background only, keep opacity 1 (same
      rule as deck entrance animations). Reusable: `NotifItem`/`CatIcon`/`NotifKit`, `FilterChips`, `NotifToast`, `Bell`,
      `PreferencesPanel`/`PrefRow`/`ChannelToggle`, `buildFeed`/`groupFeed`/`NOTIF_CATS` — carry into settings/profile.
- [x] **Settings/profile — ✅ DONE** (`Settings.html` + `settings/{data,components,desktop,mobile,app}.jsx`).
      Desktop+mobile on one sim. **Six sections** (`SETTINGS_SECTIONS`): Profile (editable display/team/handle/bio +
      "backing a WC team" flag picker + commissioner badge + banner/plain header), Account (passwordless magic-link +
      Google connect + active-sessions list w/ "this device"), Notifications (**reuses `PreferencesPanel` from
      notifs/components** — per-category × push/email/in-app matrix + quiet hours), Appearance, League, Sign-out/Danger.
      **Appearance is the live hero**: theme (dark/light/system) · accent (cobalt/emerald/violet — the DS's 3 directions) ·
      density (comfortable/compact) · reduce-motion — these are REAL product settings that write `data-theme/-accent/
      -density/-reduce-motion` on the document root, so BOTH frames re-theme live. (Because of this, theme/accent/density
      are NOT in the Tweaks panel for this screen — the in-product Appearance section is the switcher; Tweaks note says so.)
      League section = info tiles + commissioner + **league-local timezone** select (UTC-stored / local-display, per the
      time rule). Danger zone = leave-league / delete-account → confirm modal. **Desktop layout Tweak**: sidebar
      master-detail ↔ single-page stacked. **Mobile** = iOS grouped settings (profile card + grouped rows → push to a
      section w/ back). "Changes saved" toast on edit. **Tweaks**: layout (sidebar/stacked), profile header (banner/plain).
      Reusable: `SubCard`/`SettingRow`/`Field`/`SegControl`/`Toggle`/`ProfileHeader`, the appearance picker, the
      `data-*`-on-root appearance pattern. **GOTCHA**: when reusing `PreferencesPanel` outside its home screen, copy its
      CSS into the host file AND give `.nt-prefrow-name` `flex:1; min-width:0` or labels mis-truncate.

**Phase 5 — Integration — ✅ DONE (feature-complete).**
- [x] **App shell — ✅ DONE** (`App Shell.html` + `shell/{data,components,desktop,mobile,app}.jsx`). The canonical
      navigable product + the reference `GlobalNav` — the connective tissue tying all 14 screens into ONE product.
      Presented in the SAME `vf-stage`/`vf-frames` desktop+mobile presenter STAGE as every screen (the shell NESTS into
      the stage, doesn't replace it; forks Dashboard.html's scaffold + full module CSS). Content area hosts a LIVE Home
      reusing dashboard `renderModule`/`modulesFor`/`PrimaryBanner` (NOT a stub). Every nav target is a real `<a>` to the
      existing screen file. **Desktop nav = sidebar ↔ top-bar, a Tweak** (user asked for both): `GlobalSidebar` (rail:
      primary group + "More" group + slate commish pinned foot) / `GlobalTopbar` (brand · primary items · `MoreDropdown`
      overflow · ConnPill · Bell · AvatarMenu) — both verified to fit 1180px w/o overflow. **Mobile = `MobileTabBar`**
      (5 slots: Home · My Team · The Field · Market · More) + `MobileSheet` bottom sheets (Market → Free Agents/Waivers/
      Draft; More → Standings/Playoffs/Box Score/Notifications/Settings/Commissioner). **IA (`shell/data.jsx`)**: flat
      PRIMARY (Home·My Team·Set Lineup·The Field·Standings·Free Agents) + MORE overflow (Waivers·Draft·Playoffs·Box Score·
      Notifications·Settings) + slate **commissioner** entry (gated by a Tweak, both sidebar-foot AND avatar-menu) — the
      `is_commissioner` "elevated privileges" treatment uses `--locked` slate, cobalt RESERVED for you+actions, gold-free.
      **Persistent chrome**: `ShellBell` unread badge from `shellUnread(t)`→`buildFeed` (SAME feed as Notifications, so
      the count is product-wide consistent) → Notifications.html; `AvatarMenu` (Profile · Settings · Commissioner gated ·
      Sign out → Join.html). **Shared state**: shell owns league phase + sim clock (drives hosted Home + bell unread) +
      identity chrome; other destinations are independent surfaces reached by nav (navigation-depth integration, not a
      full shared store). `useFitScale(w,h)` here is the height-aware version (`w<=0` guard + `Math.min(1,w/W,h/H)`).
      **Tweaks**: desktop nav (sidebar/topbar) · Commissioner on/off · theme. Accent LOCKED cobalt, density comfortable.
      Variable N. Reusable: `GlobalSidebar`/`GlobalTopbar`/`MobileTabBar`/`MobileSheet`, `NavIcon` (one icon set),
      `ShellBell`, `AvatarMenu`, `MoreDropdown`, `DesktopShell`/`MobileShell`/`ShellHome`, the IA in `shell/data.jsx`.
- [x] **Component map — ✅ DONE** (BOTH formats per §5). `COMPONENT_MAP.md` (developer-facing, drops into the Code repo)
      + `Component Map.html` (on-brand browsable doc: sticky side-nav, hero, conventions, the canonical vocabulary tables,
      the screen→component→state map, the IA, the data-modules-to-port list, open gaps). ONE vocabulary documented:
      atoms (Pos/Flag/Avatar/ConnPill/KitChip·JERSEY_BG), status&scoring (LockTag+lock-on-play, ScorePill/PlayerScoreSheet,
      RecordBadge/H2HResult, Countdown, useScorePulse), pitch (Pitch/PitchToken/PitchMini/FormationPicker/LockHero), tables
      &modules (Module/PrimaryBanner/StandingsTable/FormStrip/MatchStrip/FeedItem), surface-specifics, the NEW shell chrome,
      and the presentation scaffold (vf-stage/vf-frames/vf-browser/vf-phone, useFitScale, IOSDevice, presenter sim-bar) —
      explicitly flagged as design-prototype scaffold to DISCARD in production (Code wraps each screen's content in the
      shell layout + drops the sim bars). Open gaps flagged: SCORING.md values illustrative; final field size 8 vs 10 +
      exact cut counts TBD; group-period count + deeper tie rules. Resolved-don't-reopen: FAAB tie→rolling waiver order,
      gold removed, league-name placeholder.

**NOTE:** fixed a stray locked-decision violation along the way — Dashboard's brand literal read "Copa Liga" (leftover
locale flavoring); swapped to the "WC Fantasy League" placeholder in `dashboard/desktop.jsx` + `dashboard/mobile.jsx`.
The shell adds a 5th league-name spot: `SHELL_LEAGUE_NAME` (`shell/data.jsx`) — keep in sync on the real-name swap.

## 7. Open gaps (brain files PROJECT/ARCHITECTURE/DECISIONS/SCORING.md were NOT provided)
Flag, don't invent. Resolve via a decision thread, not here:
- Exact **per-round guillotine cut counts** and final playoff field size (8 vs 10).
- **FAAB tiebreak** when equal bids — ✅ RESOLVED: breaks on the rolling waiver order (locked in Waivers UI).
- Exact **scoring category list & values** (SCORING.md) — we design the box-score *layout*, not values.
- Whether group stage has fixed period count / how many all-play-all periods feed seeding.
- Tie handling in all-play-all weekly record beyond "total points".
- **GOLD RETUNE — ✅ RESOLVED PROJECT-WIDE.** `ds/ds.css` is now gold-free: `--pos-gk` → slate `#5E6E8C`
  (with `.pos-GK{color:#fff}`) in both themes; `--ytp` → orange `#E2873C` dark / `#C26A1A` light (a clearly
  non-gold caution/pending tone) + matching softs. Draft Room re-checked and still reads correctly. The old
  per-surface overrides in Vs the Field / Set Lineup are now redundant (harmless; they also set `--node-played`
  + `--kit-outline` which are still needed). No remaining amber/gold anywhere.
If the four brain files appear later, reconcile this file against them.
