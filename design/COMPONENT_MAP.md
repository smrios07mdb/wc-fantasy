# Component Map — WC Fantasy League (Phase 5 handoff)

> **Audience:** Claude Code, implementing the product in **Next.js (App Router) + React + TS + Tailwind**.
> **Purpose:** the single source of truth for *one* component vocabulary across all 15 surfaces —
> what each component is, where the design reference defines it, where it's reused, and which
> live state each screen owns. Build each canonical component **once** and reuse it; do not
> re-invent per screen.
>
> Design tokens are **not** in this doc — they live in `ds/ds.css` (`:root` custom properties;
> theme via `[data-theme="light"]`, accent via `[data-accent]`, density via `[data-density]`,
> all on `<html>`). Treat `ds/ds.css` as the styling contract.

---

## 0. Conventions baked into every screen (don't relitigate these)

| Rule | Detail |
|---|---|
| **Theme** | dark-first, light first-class. Set `data-theme` on `<html>`. |
| **Accent** | **cobalt `#4D8DFF`** — marks *you* + primary actions **only**, never a functional state. Emerald / Violet are the kept alternates. **Gold is removed project-wide.** |
| **Functional colors** | always **color + icon + word** (live / locked / yet-to-play / win / loss / draw / eliminated / refund). Never color alone. |
| **Position badge colors** | GK slate `#5E6E8C` (white text), DEF `#4DA8FF`, MID `#19E08A`, FWD `#FF6B8A` — fixed, independent of accent. |
| **Numbers** | tabular figures everywhere they align (`.num` / `.mono`). Display/scores = Schibsted Grotesk, UI = Hanken Grotesk, timers/raw stats = JetBrains Mono. |
| **N is variable** | never hardcode 12 managers — read `MANAGERS.length`. |
| **Time** | data is UTC-stored; league-local is a display concern. Be explicit when showing times. |
| **League name** | **PLACEHOLDER `"WC Fantasy League"`.** A 4-spot swap when the real name lands: `AUTH_LEAGUE.name`, `LEAGUE.name`, `LEAGUE_INFO.name`, the `notifs/desktop.jsx` literal — plus the shell's `SHELL_LEAGUE_NAME`. Keep all in sync. No locale/country flavoring; `@example.com` emails only. |
| **Scoring values** | **illustrative** — `SCORING.md` was never provided. Box-score *layout* is real; point values are flagged in-UI as illustrative. Don't bake values into shared logic as if final. |

---

## 1. The canonical component vocabulary

Build **one** of each. "Defined in" = the design reference file Code should port from.

### 1.1 Primitives / atoms
| Component | Defined in | What it is | Key props / states |
|---|---|---|---|
| **PositionBadge** (`Pos`) | `vsfield/components.jsx` | GK/DEF/MID/FWD chip | `p`; color from fixed position palette |
| **Flag** | `vsfield/components.jsx` | national-flag chip | `nat`, `lg`; `flagStyle(nat)` from `NATIONS` |
| **Avatar** | `vsfield/components.jsx` | manager initials disc | `m`, `size` sm/md/lg, `ring`; `presence-dot.is-online` |
| **ConnPill** | `vsfield/components.jsx` | feed connection state | `state`: live / reconnecting / stale / loading |
| **KitChip / JERSEY_BG** | `setlineup/data.jsx` (+ `roster` `KitChip`, `fa` `FaKit`, `notifs` `NotifKit`) | flag-as-jersey "kit" swatch, 54-nation library | inline `style={{background:JERSEY_BG[nat]}}` over `--surface-4`. **GOTCHA: never `background-size:cover`** — it collapses the multi-layer flag to a solid block. Theme-aware `--kit-outline`. |

### 1.2 Status & scoring (the product identity — the unusual mechanics)
| Component | Defined in | What it is | Key state |
|---|---|---|---|
| **LockTag + lock-on-play model** | `roster/` + `setlineup/` (`statusOf`) | per-player lock status derived from HIS match clock | **movable** (match not kicked off — swappable, incl. a benched 0-min starter) · **locked·playing** · **locked·played**. No auto-subs. |
| **ScorePill** | `setlineup/components.jsx` | compact live/banked points pill | neutral pill + red pulsing dot when live; click → `PlayerScoreSheet` |
| **PlayerScoreSheet** | `setlineup/components.jsx` | minute-by-minute breakdown | values illustrative; honesty contract — canonical events sum to hero total |
| **RecordBadge** | `vsfield/components.jsx` | all-play-all W–L "power record" | provisional vs final |
| **H2HResult** | `vsfield/components.jsx` | one-vs-one margin within the field | win/loss/draw + each side ytp |
| **Countdown** | `ds.css` `.countdown` (+`is-urgent`/`is-mine`/`.tick`) | deadline / kickoff timer | urgent <threshold; "you're on the clock" variant |
| **useScorePulse** | `vsfield/components.jsx` | hook: flash a number on change | — |

### 1.3 Pitch / lineup
| Component | Defined in | What it is |
|---|---|---|
| **Pitch / PitchToken** | `setlineup/components.jsx` | tall vertical formation pitch; tokens styled by live lock state (full-bright / dimmed-played / to-play); name halo + kit outline |
| **PitchMini** | `vsfield/components.jsx` | per-row horizontal mini-pitch (formation legibility in tables) |
| **FormationPicker** | `setlineup/components.jsx` | segmented legal shapes; disables shapes that would force a locked player off |
| **LockHero** | `setlineup/components.jsx` | next-lock summary (3 variants: summary / deadline / strip) |
| **MyReducedPitch / PoNode** | `playoffs/components.jsx` | playoff 7+2 reduced lineup (1 GK + 6 out) reusing the lock model |

### 1.4 Tables, modules, layout
| Component | Defined in | What it is |
|---|---|---|
| **Module** | `dashboard/components.jsx` | the standard card shell (head + CTA + body) used across the home |
| **PrimaryBanner** | `dashboard/components.jsx` | phase-aware headline + CTA; colored by **functional** state (`--phc`), never accent |
| **StandingsTable / StandRow / RowDetail** | `standings/components.jsx` | the canonical power-record table; **ranked by total WINS, ties on total POINTS** |
| **FormStrip / FormChip**, **Seed**, **Move** | `standings/components.jsx` | per-matchday mini-record strip, seed number, ▲▼ movement |
| **MatchStrip / MatchCard** | `vsfield/components.jsx` | today's staggered fixtures (kickoff/live/final) |
| **FeedItem** | `vsfield/components.jsx` | a scoring event (goal/assist/CS), mine accented, fresh flashes |

### 1.5 Market / waivers / playoffs / admin / auth / notifs / settings (surface-specific, still ONE each)
| Component(s) | Defined in |
|---|---|
| `FaKit`, `FaFixture`, `CutoffTag`, `FaStats`, `Acquire`, `FaBidPreview` | `fa/components.jsx` |
| `FaabBar`, `WaiverOrderRail`, `ClaimRow`, `BidComposer`, `ResultItem`/`ResultsBatch` | `waivers/components.jsx` |
| `GuillotineCutLine`/`GuillotineIcon`, `SurvivorRow`, `RoundColumn`, `ReinforceModule`, `ShapeChip` | `playoffs/components.jsx` |
| `AdmCard`/`AdminRibbon`/`CommishBadge`, `ConfirmModal` (type-to-confirm), `AuditLog`/`AuditEntry`, `ViewAsSwitcher`/`ManagerView`, `SegRow`/`Stepper`/`PollerStatus` | `admin/components.jsx` + `admin/panels.jsx` |
| `AuthFlow` + views, `RosterAvatars`, `InviteBanner`, `PrivateTag` | `auth/components.jsx` |
| `NotifItem`/`CatIcon`/`NotifKit`, `FilterChips`, `NotifToast`, **`Bell`**, `PreferencesPanel`/`PrefRow`/`ChannelToggle` | `notifs/components.jsx` |
| `SubCard`/`SettingRow`/`Field`/`SegControl`/`Toggle`/`ProfileHeader`, the **appearance picker** (writes `data-theme/-accent/-density/-reduce-motion` on `<html>`) | `settings/components.jsx` |

### 1.6 Shell / chrome — **NEW in Phase 5** (the connective tissue)
| Component | Defined in | What it is |
|---|---|---|
| **GlobalSidebar / GlobalTopbar** | `shell/components.jsx` | the desktop nav — two patterns, a Tweak. Same canonical IA, active state. |
| **MobileTabBar + MobileSheet** | `shell/components.jsx` | 5-slot bottom tab-bar (Home · My Team · The Field · Market · More); Market/More open bottom sheets |
| **NavIcon** | `shell/components.jsx` | the one icon set for every destination |
| **ShellBell** | `shell/components.jsx` | persistent bell; unread badge from `shellUnread(t)` → `buildFeed` (same feed as Notifications) |
| **AvatarMenu** | `shell/components.jsx` | identity menu (Profile · Settings · Commissioner if gated · Sign out → Join) |
| **MoreDropdown** | `shell/components.jsx` | desktop top-bar overflow for non-primary destinations |
| **DesktopShell / MobileShell / ShellHome** | `shell/desktop.jsx`, `shell/mobile.jsx` | chrome wrapping a **live Home** that reuses dashboard `renderModule`/`modulesFor`/`PrimaryBanner` |

### 1.7 Stage / presentation infrastructure (design-prototype scaffold)
> This is how the **design files** present desktop + mobile side-by-side. In the real app, Code
> drops the per-screen content into the shell layout and **discards the presenter stage + sim bar**
> (they are demo affordances, not product chrome).

| Piece | Where | Note |
|---|---|---|
| **Presenter stage** `vf-stage` / `vf-frames` / `vf-browser` / `vf-phone` | CSS in each surface's HTML (canonical copy in any surface, e.g. `App Shell.html`) | fit-scaled desktop browser frame (1180×980) + phone, letterboxed |
| **`useFitScale(contentW, contentH)`** | `shell/app.jsx` (and per surface) | **`w<=0` guard** + **height-aware** `Math.min(1, w/contentW, h/contentH)` |
| **IOSDevice** (+ status bar / nav / list / keyboard) | `vsfield/ios-frame.jsx` | the one phone bezel; `dark`, `width`, `height` |
| **Presenter sim-bar** (play/scrub minute clock, phase switcher, Feed state) | per surface `app.jsx` | demo-only; drives the illustrative live states |

---

## 2. Screen → file → owned state → components

> Every screen is its own fit-scaled desktop+mobile stage today. The **App Shell** is the canonical
> chrome that ties them together; in production the shell layout wraps every route.

| # | Screen | HTML / module dir | State this screen OWNS | Reuses (beyond atoms) |
|---|---|---|---|---|
| — | **App Shell** *(Phase 5)* | `App Shell.html` · `shell/` | nav pattern, league phase, sim clock, feed state, commissioner flag, **bell unread** | GlobalSidebar/Topbar, MobileTabBar, AvatarMenu, ShellBell, dashboard Home modules, IOSDevice, presenter stage |
| 1 | Draft Room | `Draft Room.html` · `draft/` | snake board position, 60s pick clock, queue order, autopick, presence | Pos, Flag, Avatar, Countdown, KitChip |
| 2 | Vs the Field | `Vs the Field.html` · `vsfield/` | sim minute, feed state, selected opponent (H2H) | PitchMini, RecordBadge, H2HResult, MatchStrip, FeedItem, ConnPill, useScorePulse |
| 3 | Set Lineup | `Set Lineup.html` · `setlineup/` | formation, swap selection, per-period tab, playoff mode, autosave | Pitch/PitchToken, FormationPicker, LockHero, ScorePill/PlayerScoreSheet, JERSEY_BG |
| 4 | Dashboard / Home | `Dashboard.html` · `dashboard/` | league phase, hub↔router model, layout | Module, PrimaryBanner, all phase modules (record/lock/waiver/standings/fixtures/activity/bracket/recap…) |
| 5 | My Team / Roster | `My Team.html` · `roster/` | grouping vs table, drop/restore, legality vs 2/5/5/3 | LockTag, ScorePill, KitChip, LegalityStrip, FAAB meter |
| 6 | Player Box Score | `Player Box Score.html` · `boxscore/` | selected player (`?p=`), lead/breakdown layout | ScorePill total contract, period vs season columns |
| 7 | Standings | `Standings.html` · `standings/` | sim minute (md3 live → reorders), playoff field size, expanded row | StandingsTable/StandRow/RowDetail, FormStrip, Seed, Move, `cutContext` |
| 8 | Free Agents | `Free Agents.html` · `fa/` | search/filter/sort, include-rostered, cutoff clock, bid preview | FaKit, CutoffTag, FaFixture, Acquire, FaBidPreview |
| 9 | Waivers / FAAB | `Waivers.html` · `waivers/` | pending claims (add/drop/$/priority), batch results, void+refund, carry-forward budget (the prototype's "playoff reset" demo is STALE — FAAB never resets, per DECISIONS) | FaabBar, WaiverOrderRail, BidComposer, ClaimRow, ResultsBatch |
| 10 | Guillotine Playoffs | `Guillotine Playoffs.html` · `playoffs/` | round nav, live cut line, field size, cut schedule, board↔ladder, reduced shape | GuillotineCutLine, SurvivorRow, RoundColumn, MyReducedPitch, ReinforceModule, ShapeChip |
| 11 | Commissioner | `Commissioner.html` · `admin/` | tabbed tasks, field lock (type-to-confirm), stat corrections, ops overrides, audit, view-as | AdmCard/AdminRibbon, ConfirmModal, AuditLog, ViewAsSwitcher, Stepper/SegRow |
| 12 | Join / Auth | `Join.html` · `auth/` | auth state machine, email validity, allowlist gate, invite mode | AuthFlow + views, RosterAvatars, InviteBanner, PrivateTag |
| 13 | Notifications | `Notifications.html` · `notifs/` | filter, group-by, mark-read, live toasts, preferences | NotifItem/CatIcon, FilterChips, NotifToast, Bell, PreferencesPanel |
| 14 | Settings / Profile | `Settings.html` · `settings/` | section, editable profile, **appearance (real product settings)**, sessions, danger | SubCard/SettingRow/SegControl, appearance picker, PreferencesPanel (reused from notifs) |

---

## 3. Information architecture (the shell)

Canonical IA lives in `shell/data.jsx`. **Every destination is a real screen.**

- **Primary (always visible on desktop):** Home · My Team · Set Lineup · The Field · Standings · Free Agents
- **More overflow:** Waivers · Draft Room · Guillotine Playoffs · Player Box Score · Notifications · Settings
- **Commissioner:** slate "elevated privileges" entry — pinned bottom of the sidebar / inside the More dropdown / avatar menu shortcut. **Gated by `is_commissioner`.**
- **Mobile tab-bar (5):** Home · My Team · The Field · **Market** (sheet → Free Agents / Waivers / Draft Room) · **More** (sheet → Standings / Guillotine Playoffs / Player Box Score / Notifications / Settings / Commissioner)
- **Persistent chrome:** ConnPill · **Bell** (unread from `buildFeed`) · AvatarMenu (Profile · Settings · Commissioner · Sign out → `Join.html`).

**Shell Tweaks:** desktop nav pattern (sidebar ↔ top-bar) · Commissioner on/off · theme. League phase + feed state are the presenter sim-bar (demo affordances).

**Integration depth:** the shell owns persistent identity/feed chrome + a phase/clock that drives the hosted Home; other destinations are independent surfaces reached by navigation. In production, the shell layout wraps all routes and the per-screen sim bars are removed.

---

## 4. Data / logic modules to port (don't re-derive)

| Module | Exports Code should reuse |
|---|---|
| `vsfield/data.jsx` | `MANAGERS`, `ME_ID`, `mgr`, `NATIONS`/`flagStyle`, `MATCHES`, `evalField`, `evalManager`, `recordForPeriod`, `seasonTable`, `feedUpTo`, `matchState`/`matchScore` |
| `setlineup/data.jsx` | `JERSEY_BG` (54-nation kit lib) + helpers, `buildLineup`, `lineupSummary` (lock), `SQUAD`, `FORMATIONS`(+`_PO`), `PERIODS`, `SQUAD_PO`, `SL_DEFAULT_MIN`/`SL_DEADLINE` |
| `roster/data.jsx` | `ROSTER_REQ` (2/5/5/3), `ROSTER_FAAB`/`faabLeft`, `ACQ`/`acqLabel`, `SEASON_PTS_PLAYER`/`seasonPts`, `playerFixture`, `canDrop` |
| `standings/data.jsx` | `buildStandings`, `cutContext`, `winPct`, `stCmp` (wins → points tiebreak) |
| `fa/data.jsx` | `FA_POOL`, `faCutoff`, `faAvailable`, `faList`, `faCounts` |
| `waivers/data.jsx` | `faabState`, `claimStatus` (open/void), `claimableFAs`, `droppableSquad` |
| `playoffs/data.jsx` | `buildGuillotine`, `poSeeds`, `cutSchedule`, `poMyMargin` |
| `admin/data.jsx` | `STAT_CATS`/`STAT_GROUPS`, `catPts`/`linePts`/`catApplies`, `fieldPlan`, `AUDIT_SEED`, `IS_COMMISSIONER` |
| `auth/data.jsx` | `AUTH_VIEWS`, `ALLOWLIST`/`onAllowlist`, `emailValid`, `INVITE`, `AUTH_LEAGUE` |
| `notifs/data.jsx` | `buildFeed`, `groupFeed`, `NOTIF_CATS`, `NOTIF_HISTORY`/`NOTIF_LIVE`, `NOTIF_PREF_ROWS` |
| `settings/data.jsx` | `SETTINGS_SECTIONS`, `LEAGUE_INFO`, session/profile shapes |
| `dashboard/data.jsx` | `PHASES`, `modulesFor`, the aggregations (`seasonTable`, `myLock`, `waiverState`, `fixtures`, `ACTIVITY`) |
| `shell/data.jsx` | the IA (`SHELL_NAV_PRIMARY`/`_MORE`/`_COMMISH`, `SHELL_MOBILE_TABS`, `SHELL_MARKET_GROUP`, `shellMoreGroup`, `shellAvatarMenu`), `shellUnread` |

---

## 5. Open gaps — **flag, don't invent** (resolve via decision thread, not in code)

The four "brain" docs (`PROJECT/ARCHITECTURE/DECISIONS/SCORING.md`) were **never provided**. These
remain genuinely undecided and are surfaced in-UI as provisional/illustrative:

1. **SCORING.md** — the exact scoring **category list & point values**. The box-score *layout* is final;
   the values are illustrative and flagged in-UI. Do not freeze values in shared scoring logic.
2. **Final playoff field size — 8 vs 10**, and the **exact per-round guillotine cut counts** (default
   taper ≈2→1). Modeled as commissioner-set (`fieldPlan` / `cutSchedule`) and provisional until the
   group→playoff transition. The Commissioner screen is where this gets locked; the spec value is TBD.
3. **Group-stage period count** feeding seeding, and **tie handling** in the all-play-all weekly record
   beyond total points.

**Resolved (locked, don't reopen):**
- **FAAB tiebreak on equal bids → breaks on the rolling waiver order** (stated in Waivers UI).
- **Gold removed project-wide** — `--pos-gk` slate, `--ytp` orange. No amber/gold anywhere.
- **League name** stays the `"WC Fantasy League"` placeholder; no locale flavoring.

---

*Generated for Phase 5 integration. The browsable on-brand version of this map is `Component Map.html`.*
