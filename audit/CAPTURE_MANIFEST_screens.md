# XI — Capture Manifest (route × state × viewport)

**Status:** DONE · repo-derived, Pass 1 of the Claude Design feed (states enumerated; **no captures taken, no harness built** — Pass 2 is gated on the two decisions in §6)
**Derived from:** `main@0ae604a` (local == `origin/main` at derivation), 2026-07-06 — mid-knockout: group phase complete, knockout rounds live, Final 2026-07-19
**Seeds:** `audit/DESIGN_PLAN_screen_inventory.md` (route/archetype set) · `audit/DESIGN_PLAN_reconciliation.md` (repo-truth matrix) · `audit/T15_LIVE_WALKTHROUGH.md` (existing screen+state rows)
**Method:** states derived from loaders, phase branches, empty/loading/error conditions and sheet/overlay states in `apps/web` — 4 read-only audit lanes, every state grounded in `file:line`. Read-only pass; the only artifact is this file.

---

## 1. Conventions

### Viewports

| Key | Size | Why |
| --- | --- | --- |
| `360` | 360×780 | Narrowest supported; exercises the T15 F-P0 clip findings (standings Points, vsfield Season, games 5-tab) |
| `390` | 390×844 | Canonical mobile design width (iPhone 12–15 class) |
| `DT` | 1440×900 | Above every app breakpoint (640 shell swap · 720 standings · 760 vsfield · 767 playoffs · 860 marketing · 900 dashboard grid) |

`all` = 360+390+DT. Both mobile widths sit on the same side of every breakpoint, so 360 is only mandatory where clipping is the point; state-variant rows (toasts, banners, modals) default to `390+DT`. The vsfield 760 and playoffs 767 dual-DOM swaps are covered automatically by capturing mobile + DT.

### Source

| Value | Meaning |
| --- | --- |
| `live` | Reachable today on the prod deploy with read-only interaction (taps, tabs, deep-links, signed-out private window all count; no write submitted) |
| `fixture` | Needs a seeded DB, a write, or a phase that no longer/doesn't yet exist |
| `salvage` | Already represented in frozen `design/design_reference/` (mock-data HTML screens; screenshot sets `match_detail/screenshots/` ×6, `the_cut_knockout/screenshots/` ×8). Mock data — design reference, not pixel truth |

Rows reachable live only **after the Final** (champion/complete states) are marked `live (post-final)` — no fixture needed if Pass 2 waits past 2026-07-19.

### F-D08 column

`YES` = the state renders club/nation identity (kit jerseys via `kitOf`, emoji `<Flag>`, `KitChip`, `PlayerAvatar`, nation names) — the surfaces the active Claude Design crest/kit rebuild (F-D08) must see. `—` = identity-free.

---

## 2. Capture matrix — authenticated surfaces

### `/` hub (Dashboard) — `selectLandingView→hub`, phase via `selectTournamentPhase` + `resolveKnockoutPhase`

| State | Viewports | Source | Reachability | F-D08 |
| --- | --- | --- | --- | --- |
| Playoff phase: survival + reinforce modules + bracket mirror (`Dashboard.tsx:472-560,675-678`) | all | live | Default signed-in render today | — (avatars=initials) |
| PrimaryBanner "You're alive" (`PrimaryBanner.tsx:222-248`, meSafe=true) | 390+DT | live | Viewer safe in current round | — |
| PrimaryBanner "You're on the block" (meSafe=false) | 390+DT | live | Viewer below the line mid-round; timing-dependent | — |
| PrimaryBanner "Knockouts underway" (meSafe=null) | 390+DT | live | Eliminated/non-participant viewer — via that manager's session (or commish `?as=` inspector approximation) | — |
| Group phase: spotlight + standings + record + matchday modules (`Dashboard.tsx:269-461,673`) | all | salvage / fixture | NOT reachable today (phase is playoff); `design_reference/Dashboard.html` covers layout | — |
| Pre-draft / draft-day dashboards (`Dashboard.tsx:122-260`) | 390+DT | fixture | Phase gone; RecentPicks module renders emoji flags | YES (draft variant) |
| Complete: champion + finish modules (`Dashboard.tsx:571-652,679-683`) | all | live (post-final) | After Final completed + champion `playoff_entry` written | — (🥇/🥈 emoji) |
| Empty-module guards ("Bracket forming…", "No active matchday", `Dashboard.tsx:496-497,383-389`) | 390 | fixture | Data-gap conditions, not reachable on healthy prod | — |

### `/lineup` — playoff reduced-roster is the **live default** (`kind==="knockout_round"`, `SetLineupClient.tsx:352-355`)

| State | Viewports | Source | Reachability | F-D08 |
| --- | --- | --- | --- | --- |
| Playoff XI · 7 starters, pitch + bench, movable tokens (`components.tsx:374-507,566-567`) | all | live | Default render today | **YES** (PlayerKit jerseys + FlagBadge) |
| Group 11-starter historical snapshot, read-only (`loadLineup.ts:259-264`, PeriodTabs "final") | all | live | Prior group MD via period tabs — includes since-dropped players | **YES** |
| Locked-on-play token w/ ScorePill + live dot (`components.tsx:296-351`) | 360+390+DT | live | Any kicked-off KO match; 360 for micro-label collisions (T15 §3-18) | **YES** |
| Availability badge "Starting"/"Out" (`components.tsx:110-176`, `match_lineup_entry` peek) | 390+DT | live | T-75min pre-kickoff window only — timed capture | **YES** |
| FormationPicker segmented open (`components.tsx:650-669`) | 390+DT | live | Tap; >1 legal shape | YES |
| SaveBar dirty + "Unsaved changes" chip (`components.tsx:734-741,580-586`) | 390+DT | live | Stage a swap, don't save (no write) | YES |
| SaveBar legality-error line (`is-error`, `SetLineupClient.tsx:137`) | 390+DT | live | Stage an illegal shape mid-edit, don't save | YES |
| SaveBar closed-window / fully locked period (`components.tsx:738-740`) | 390+DT | live | Any prior/locked period | YES |
| ForfeitConfirmSheet (`components.tsx:685-724`) | 390+DT | live | Tap a played starter — sheet opens without write; **do not confirm** (one-way forfeit) | — |
| PlayerScoreSheet Points/Stats tabs w/ "Bench & forfeit" (`SetLineupClient.tsx:461-468`) | 390+DT | live | Tap any locked token | YES |
| Saved toast / server-reject toast / "Saving…" (`SetLineupClient.tsx:330-341`) | 390 | fixture | All require a lineup write | — |
| Frozen period (all tokens non-movable, `loadLineup.ts:239`) | 390+DT | fixture | Commish freeze write (T15 App-A allows a quiet-window freeze; that's an operator write — Sergio's call) | YES |
| Empty "No lineup to set yet" / "No open window" (`page.tsx:20-29`) | 390 | fixture | Undrafted manager / no periods | — |

### `/vsfield` — the D2 dual state; gate `knockoutPhaseActive` (`loadVsField.ts:274,493-495`)

| State | Viewports | Source | Reachability | F-D08 |
| --- | --- | --- | --- | --- |
| **The Cut** — KO cockpit: KOYouBand + reduced shape + KoLadder + KOFallen (`VsFieldClient.tsx:407-431`) | all | live | Default render today | YES (ladder avatars=initials; drill-ins carry jerseys) |
| KOYouBand variants: safe / on-block (+Damocles machete) / pending (`KnockoutUI.tsx:96-150`) | 390+DT | live | Depends on viewer standing vs the line; on-block is timing-dependent | — |
| KOSheet mobile H2H drill-in, jersey XIs (`VsFieldClient.tsx:549-599`, ≤760px) | 360+390 | live | Tap a ladder row on phone | **YES** (kitOf jersey XIs) |
| Desktop H2H compare via `?manager=` (`VsFieldClient.tsx:442-473`) | DT | live | Dashboard StandingsModule deep-link or ladder click | **YES** |
| Group cockpit: Leaderboard rail + CompareBand + XI pitches + MatchStrip + scorepills (`VsFieldClient.tsx:433-483`) | all | live | **`?period=<group-MD id>` deep-link only** (T11 historical); not the default view anymore | **YES** (jersey kits) |
| Season tab table (`VsFieldClient.tsx:378-381`) | 360+390+DT | live | Tab toggle; 360 for the F-P0 column-clip finding (T15 §5-30) | — |
| KOCeremony one-shot takeover (`KnockoutUI.tsx:515-604`, latch `decideCeremonyLatch`) | 390+DT | live / salvage | Fires once/device on first open after an unseen cut — clear the latch key or use a fresh browser profile at a round boundary; `the_cut_knockout/screenshots/live-02-ceremony.png` already salvages one frame | — |
| KOFallen expanded (`KnockoutUI.tsx:217-293`) | 390+DT | live | Tap once ≥1 manager cut (true today) | — |
| ConnPill live / reconnecting / historical (`VsFieldClient.tsx:126-163`) | 390 | live | live now; historical on prior period; reconnecting needs a socket drop (airplane-mode toggle) | — |
| noPeriod banner (`VsFieldClient.tsx:388-389`) | 390 | live | Inter-wave gap (between rounds) — timed | — |
| Champion endgame: KOChampion marquee (`KnockoutUI.tsx:297-316`) | all | live (post-final) | After Final + champion entry | — |
| PlayerScoreSheet drill-in (`VsFieldClient.tsx:608-614`) | 390+DT | live | Tap any player | YES |

### `/players`

| State | Viewports | Source | Reachability | F-D08 |
| --- | --- | --- | --- | --- |
| Full pool stat-table, paged 25 (`components.tsx:126-203`) | all | live | Default; includes OwnerChip FA/You/name | **YES** (PlKit jerseys + emoji flags) |
| Eliminated-team rows (`is-elim` "· out", `components.tsx:159,173-175`) | 390+DT | live | True today for eliminated nations | **YES** |
| NationFilter expanded chip grid (`NationFilter.tsx:29-82`) | 360+390+DT | live | Tap "Nations ▸"; 360 for chip tap-targets (T15 §4-29) | **YES** (flag chips) |
| Filters active: position + availability + search + ActiveTeams toggle (`components.tsx:215-309`) | 390+DT | live | Client-side interaction | YES |
| Empty "No players match" + Clear (`components.tsx:369-398`) | 390 | live | Over-narrow filter combo | — |
| FaPlayerCardSheet view-only (no star, "acquire from Waivers." foot) Points/Stats tabs | 390+DT | live | Row tap | **YES** |
| StatusLine "Claims open" vs "Claims closed" (`playersLogic.ts:183-185`) | 390 | live | Phase-dependent (FA window cron); capture both across a batch boundary | — |
| Bid trailer 💲 → `/waivers?bid=` (`components.tsx:191-199`) | 390 | live | Claimable FA + open window | YES |

### `/waivers`

| State | Viewports | Source | Reachability | F-D08 |
| --- | --- | --- | --- | --- |
| Claims tab + playoff FAAB-carryover banner + rails (FaabBar/WaiverOrder/TeamBudgets) (`WaiversClient.tsx:318-326`, `components.tsx:275-404`) | all | live | Default today | YES (KitChip text-abbrev + emoji flags — **no jerseys by design**, `components.tsx:5-9`) |
| BatchBar phases: sealed-bid / free-agency / locked (`components.tsx:275-295`) | 390+DT | live | Phase-dependent — capture across a batch boundary (T15 §4-21) | — |
| FreeAgentPanel mounted (FA window open — cron-set `period.status='open'`) vs absent/locked copy (`WaiversClient.tsx:366-383`, `FreeAgentPanel.tsx:103-107`) | 390+DT | live | Timed: minutes-after-batch window; the closed state is the common one | YES |
| BidComposer open: search + PositionSegmented + NationFilter + amount stepper + drop-picker (`BidComposer.tsx:157-287`) | 360+390+DT | live | Open only, no submit; 360 for keyboard/vh findings (T15 §4-22/23) | YES |
| Pending ClaimRow list + edit/cancel (`components.tsx:407-486`) | 390+DT | live | Needs viewer's own pending bids — else fixture | YES |
| Empty "No pending claims" (FA vs sealed copy, `WaiversClient.tsx:402-418`) | 390 | live | Default when no bids | — |
| Batch-results tab: won/lost/void bid lines (`components.tsx:492-581`) | 390+DT | live | Settled batches exist | YES |
| ReleasePanel trim-to-cap + sub-states (below-floor, unfillable confirm) (`ReleasePanel.tsx:137-160`) | 390+DT | live / fixture | Only over-cap playoff survivors see it; sub-states need specific squads | YES |
| Non-participant "Waiver moves are closed for you" (`WaiversClient.tsx:328-334`) | 390 | fixture | Eliminated manager's session | — |
| FaPlayerCardSheet w/ star toggle (`FaPlayerCardSheet.tsx:57-148`) | 390+DT | live | Info tap from FA pool | **YES** |
| Void-note banner / claim inline errors | 390 | fixture | Needs voided claims / failed writes | — |

### `/pool` (Quiniela)

| State | Viewports | Source | Reachability | F-D08 |
| --- | --- | --- | --- | --- |
| Knockout bracket frame (R32→Final) + resolved 2-way fixture cards (`PoolClient.tsx:239-243`, `components.tsx:110-114`) | all | live | Default today (`playoffActive`) | **YES** (emoji flags on resolved teams) |
| Undecided KO fixture: TBD teams, no controls (`components.tsx:57-63,252-254`) | 390+DT | live | Un-drawn later rounds (SF/Final) | — |
| Locked fixture + LockPill + others revealed chips (`components.tsx:140,165-186`) | 390+DT | live | Any kicked-off match with rival picks | YES |
| Result graded: `.is-correct`/`.is-wrong` + score (`components.tsx:129-134,223-229`) | 390+DT | live | Completed matches | YES |
| Pick-made (own pick selected, unlocked) (`components.tsx:128,134`) | 390+DT | live | Only if an upcoming resolved KO fixture exists pre-kickoff — timed | YES |
| Pre-pick 3-way HOME/DRAW/AWAY controls (group) (`PickControl:110-119`) | 360+390+DT | salvage / fixture | Group fixtures hidden from Picks tab today (`showGroup=!playoffActive`, `PoolClient.tsx:183`); 3-way control layout needs group phase; 360 for tap-target finding (T15 §5-34) | YES |
| Completed archive drawer expanded (`PoolClient.tsx:292-300`) | 390+DT | live | `<details>` tap — spans group+KO history | YES |
| Leaderboard tab + row-me accent (`components.tsx:265-316`) | all | live | Tab toggle | — (initials) |
| ManagerPicksModal (rival drill-in) (`components.tsx:370-420`) | 390+DT | live | Leaderboard row tap — shows revealed group+KO picks | YES |
| 3rd-place `3P` round bucket (`poolView.ts:167-171`) | 390+DT | live | Once the 3P period exists (July 18) — timed | YES |

### `/standings`

| State | Viewports | Source | Reachability | F-D08 |
| --- | --- | --- | --- | --- |
| Matchday tab + period selector w/ live dot (`components.tsx:359-405`) | 360+390+DT | live | Default tab; 360 for the F-P0 Points clip (T15 §2-9) | — |
| Cumulative tab: power record + cut-line divider + ContextBand (`components.tsx:176-335`) | 360+390+DT | live | Tab; 360/390 for chevron/trend clip (T15 §2-10); ≤720px drops Pct+Form | — |
| Cumulative row expanded (RowDetail per-period table) (`components.tsx:131-173,234`) | 390+DT | live | Row tap | — |
| Season tab: managers×matchday grid, sticky column, h-scroll (`components.tsx:413-483`) | 360+390+DT | live | Tab; scroll-affordance finding (T15 §2-11) | — |
| ConnPill live / reconnecting (`StandingsClient.tsx:59-66`) | 390 | live | reconnecting needs socket drop | — |

### `/scoring`

| State | Viewports | Source | Reachability | F-D08 |
| --- | --- | --- | --- | --- |
| Static rulebook §1–§9, single state (engine-sourced values, zero-rating note §1) (`page.tsx:72-405`) | all | live | Always | — (pos badges only) |

### `/draft` — live status is **complete**; pre/active states are phase-gone

| State | Viewports | Source | Reachability | F-D08 |
| --- | --- | --- | --- | --- |
| DRAFT COMPLETE: Board + RosterPanel, mobile Board/"Your squad" tabs (`DraftRoomClient.tsx:395-424`) | all | live | Default today; 360 for board header names (T15 §10-62) | **YES** (flags via CountryFlag) |
| Pre-draft Lobby + commissioner Start button + "No clock" badge (`components.tsx:723-772,147-149`) | 390+DT | salvage / fixture | Phase gone; `design_reference/Draft Room.html` covers layout | YES |
| Active: ClockBar my-turn vs other-turn, Ticker, AvailableList, QueuePanel (`DraftRoomClient.tsx:426-506`, `components.tsx:104-614`) | 390+DT | salvage / fixture | Phase gone; the F-D08 rebuild target for the grid | **YES** |
| Bespoke collapsible nation grid open/closed (`components.tsx:373-416`) | 360+390+DT | fixture | Renders inside AvailableList (active-draft rail) — **the D4(a) migration target**; salvage HTML approximates it | **YES** |

### `/settings`

| State | Viewports | Source | Reachability | F-D08 |
| --- | --- | --- | --- | --- |
| Display-name form idle + notification toggles + enable-push idle (`SettingsClient.tsx:60-76`, `NotificationsClient.tsx:123-140`) | all | live | Default | — |
| Push unsupported message (Safari tab, `browserEnv()===null`, `NotificationsClient.tsx:29-44`) | 390 | live | Safari non-A2HS context | — |
| Push enabled + send-test states (`NotificationsClient.tsx:75-117`) | 390 | live | Requires the enable write — treat as operator-interactive, Sergio's own device | — |
| Display-name saving / error (name_taken etc.) / saved toast (`SettingsClient.tsx:77-90`) | 390 | fixture | All require writes | — |

### `/commish` (commissioner session; Sergio only)

| State | Viewports | Source | Reachability | F-D08 |
| --- | --- | --- | --- | --- |
| Playoff-cuts tab (default): guillotine ladder + AdvanceCutCard field table + cut-line (`CommishConsole.tsx:507-754`) | 360+390+DT | live | Live mid-knockout; 360 for name-ellipsis finding (T15 §7-49). **View only — do not type-to-confirm/apply** | — (names) |
| Boundary-tie picker + release-preview (`CommishConsole.tsx:688-729,472-505`) | 390+DT | live / fixture | Only when a tied set sits at the blade; preview is a dry-run POST — hold unless Sergio ok's | — |
| Stat-corrections tab: match→player selects + Penalty/Rating/StatLine forms (`:946-1052`) | 390+DT | live | Tab; selects render team names | YES (team names) |
| Roster & lineup repair tab (`:1107-1176`) | 390+DT | live | Tab; forms idle only | YES |
| Game-operations tab: FreezeRow pills + Freeze/Unfreeze confirms (`:136-444`) | 390+DT | live | Tab; confirm modal open = no write; **do not arm** (T15 §7-45 keyboard test is Sergio's) | — |
| ViewAsSwitcher `?as=` manager inspector (`:74-86`) | 390+DT | live | Read-only inspector — also the least-bad proxy for eliminated-viewer states | — |
| Audit-log rail (`:116-119`) | 390+DT | live | **PII caution: residual commish_audit text (T15-14R)** — synthetic or crop | — |

### `/games/[matchId]` (deep-link only)

| State | Viewports | Source | Reachability | F-D08 |
| --- | --- | --- | --- | --- |
| Completed match, Lineups tab: kit-jersey formation pitch + legend + enriched lists (`GameDetailClient.tsx:442-522`) | all | live | Any finished match deep-link | **YES** (kitOf jerseys + flags + owner corners) |
| Events timeline (goals/subs/cards, KO/HT/FT markers) (`:883-926`) | 360+390+DT | live | Tab; 360 for name-vs-minute collision (T15 §6-40) | YES |
| Ratings tab: podium + Fantasy-MVP + board (`:526-635`) | 390+DT | live | Rated matches; empty variant on unrated | YES |
| Statistics tab (comparison bars) (`:695-737`) | 390+DT | live | When feed posted team stats | — |
| Standings tab (WC group table) (`:935-989`) | 360+390+DT | live | **Group matches only** — historical deep-link; drives the 5-tab clip finding (T15 §6-37) | YES |
| Live match: red Live pill, live fantasy dots, live-note (`:1005-1017,1040`) | 390+DT | live | Match-day evenings only — timed | YES |
| Scheduled (upcoming): "v" score, Scheduled pill (`:1016,1047-1049`) | 390+DT | live | Future fixtures (resolved teams) | YES |
| Fantasy exposure line vs not-linked note (`:1080-1088,1166-1176`) | 390 | live | Depends on match↔fantasy overlay | — |
| Empty box-score card (`view.empty`, `:1178-1184`) | 390 | live | Scheduled match without lineup data | — |
| Match not-found 404 (`not-found.tsx:11-19`) | 390+DT | live | Bad matchId | — |
| PlayerScoreSheet drill-in (period-keyed) (`:1156,1263-1269`) | 390+DT | live | Tap a token when periodId set | YES |

---

## 3. Capture matrix — auth + marketing surfaces (signed-out private window; no writes)

| Route · state | Viewports | Source | Reachability | F-D08 |
| --- | --- | --- | --- | --- |
| `/` marketing landing — full page: hero board, #mechanics, #scoring grid, #showcase, #how, #explore, CTA, footer (`MarketingLanding.tsx:241-1298`) | all | live | Signed-out visit; identities are hardcoded fiction (Mbappé/France etc.) — **no PII concern by construction** | YES (mock kits/flags) |
| `/` marketing ≤860px: anchor nav hidden, Log-in CTA stays (`landing.css:55`) | 360+390 | live | Same page, mobile widths | YES |
| `/sign-in` email form idle + brand split-shell (`page.tsx:82-146`, `AuthChrome.tsx:124-169`) | all | live | Signed-out | — |
| `/sign-in` check-your-email sent state (`page.tsx:53-79`) | 390+DT | live | **Echoes the typed email — use a synthetic address for the capture** | — |
| `/sign-in` inline error (`page.tsx:108-113`) | 390 | live | Provoke with an OTP failure (e.g. malformed flow) or skip | — |
| `/auth/denied` — single conflated screen (all 3 `?reason=` values render identically, `denied/page.tsx:11-34`) | 390+DT | live | Direct URL visit; one capture covers not-allowlisted/expired/failed | — |
| `/` unlinked state (`page.tsx:53`) | 390 | fixture | Allowlisted email with no linked manager — provisioning seam | — |
| `/` denied state (`page.tsx:54,118-146`) | 390 | fixture | Defensive arm — callback signs out non-allowlisted first; likely unreachable in normal flow | — |

---

## 4. Capture matrix — cross-cutting shell states

| State | Viewports | Source | Reachability | F-D08 |
| --- | --- | --- | --- | --- |
| RouteSkeleton ×6 variants — dashboard (`/`), list (commish/pool/players/waivers/scoring/standings), pitch (lineup/games), cockpit (draft/vsfield), form (settings), board (playoffs) — 13 `loading.tsx` total | 390+DT | live | Throttled navigation (DevTools slow-3G); one capture per **variant** (6), not per route | — |
| Root `error.tsx` ("Something went wrong" + Try again) | 390+DT | fixture | Needs a forced server error — **staging only, never prod** (T15 §1-8) | — |
| Root `not-found.tsx` (branded 404) | 390+DT | live | `/zzz` URL | — |
| MoreSheet open: 6 items + hardcoded Browse-players + conditional Commissioner row + scrim (`MoreSheet.tsx:88-118`) | 360+390 | live | <640px only; capture as commissioner AND as regular manager (row differs) | — |
| Bottom bar KO relabels: "The Cut" + machete glyph + live dot; "Theater" in More (`crossNav.ts:121-146`, `AppShell.tsx:153-168`) | 360+390 | live | Active today; live dot only while a KO match is in flight | — |
| Bottom bar group-phase labels ("Vs the field" / "Playoffs") | 360+390 | salvage / fixture | Phase gone; salvage HTML shows old chrome | — |
| Desktop topbar: 11-item strip + commish entry + "Signed in as" + sign-out (`AppShell.tsx:204-273`) | DT | live | **"Signed in as {name}" renders viewer identity — PII row** | — |

### `/playoffs` (Theater) — hero-only after T15-CUT demote-lite

| State | Viewports | Source | Reachability | F-D08 |
| --- | --- | --- | --- | --- |
| Live CHOP hero: round headline + OnTheBlock + "Your survival" (`components.tsx:327-391`) | all | live | Default today (`.po-desktop`/`.po-mobile` dual DOM at 767px) | — (initials + trophy + machete; **no jerseys — `reducedLineup` loaded but unrendered**) |
| Blade phases wind/drop (`components.tsx:282-296`, latch `PlayoffsClient.tsx:129-149`) | 390+DT | live / salvage | Once/device at round boundaries — fresh profile or latch clear; `the_cut_knockout/screenshots/` salvages frames | — |
| "Your survival" sub-states: safe / facing-cut / eliminated / out (`components.tsx:107-162`) | 390+DT | live / fixture | safe now; eliminated needs a cut manager's view | — |
| Champion endgame hero (`components.tsx:299-324`) | all | live (post-final) | After Final + champion entry | — |
| Reconnecting banner + ConnPill states (`PlayoffsClient.tsx:218-222`) | 390 | live | Socket drop | — |

---

## 5. States that do NOT exist (Pass-2 ghost list)

Enumerated so nobody budgets capture slots for them; each was expected by an earlier doc and refuted at `file:line` this pass:

1. **`/playoffs` Board/Ladder toggle + R1..Rn round nav** — removed by T15-CUT demote-lite (`playoffs/components.tsx:5-12,471-473`; `PlayoffsClient.tsx:203-205`). T15 walkthrough step 64 is stale; the ladder lives on `/vsfield` "The Cut". `/playoffs` renders **no club/nation identity**.
2. **ET/penalties scoreboard state** — no shootout branch in `MatchStatus`/`Scoreboard`; shootouts surface only as PEN-tagged goals in the games Events timeline (`buildGameDetail.ts:287,405,430`). T15 step 39's "plain Full-time" is the coded behavior, not a bug-state to capture separately.
3. **`/standings` post-transition ContextBand copy** — only the "provisional cut" variant exists (`standings/components.tsx:240-286`); T15 step 13's expected second copy was never built.
4. **`/settings` sign-out control** — Account section is a stub (`settings/page.tsx:49`); sign-out lives in topbar + MoreSheet only.
5. **A2HS-vs-Safari-tab distinct push messaging** — single `browserEnv()===null` unsupported message (`NotificationsClient.tsx:29-44`); no standalone-display detection.
6. **Draft `Summary` screen** — exported but never rendered (`draft/components.tsx:774-834`); the complete state is Board+RosterPanel.

---

## 6. Capture order (Pass 2)

F-D08 identity surfaces first — they feed the active Claude Design crest/kit rebuild; everything else follows. Both mobile widths + DT unless the matrix says otherwise.

**Wave 1 — F-D08 identity surfaces (live, this week while knockout data is rich):**

1. `/lineup` playoff pitch (PlayerKit jerseys, locked ScorePills) + group historical snapshot via period tab
2. `/vsfield` The Cut ladder + KOSheet/H2H jersey XIs + group cockpit via `?period=` deep-link
3. `/players` stat table (PlKit jerseys, eliminated rows, NationFilter open) + FaPlayerCardSheet
4. `/games/[matchId]` Lineups pitch + Events + Ratings on one completed KO match and one group match (Standings tab)
5. `/waivers` KitChip surfaces: claims + composer open + FA card (the no-jersey contrast is itself F-D08 evidence)
6. `/draft` complete Board (flags) — grid rebuild target; active-draft grid from salvage
7. `/pool` bracket + resolved fixture flags + ManagerPicksModal

**Wave 2 — chrome + flows:** shell (MoreSheet, KO relabels, topbar), RouteSkeleton ×6, auth surfaces (signed-out private window), `/standings` three tabs, `/scoring`, `/settings`, `/commish` (view-only), `/playoffs` hero.

**Wave 3 — timed/opportunistic (calendar-bound):** live-match states (next KO match day), FA-window-open + batch-boundary states (minutes after next batch), Starting-badge T-75 window, on-block banner mid-round, noPeriod inter-wave gap, 3P bucket (~July 18), ceremony at next round boundary.

**Wave 4 — post-final (after 2026-07-19):** champion endgame trio (`/vsfield` KOChampion, `/playoffs` champion hero, dashboard complete) — live, no fixture needed.

**Deferred until decision (b):** everything marked `fixture` (write toasts/errors, frozen period, group dashboard, draft active, eliminated-viewer sessions, unlinked/denied landing arms, root error page).

---

## 7. Decisions for Sergio (gate Pass 2)

### (a) PII strategy for committed shots — **recommend: synthetic-fixture identities**

Captures land in the repo and feed an external design tool, so they're published artifacts. Repo truth on exposure:

- T15-13 established there is **no masking layer at render** — `manager.displayName` is the only name field and ~12 surfaces render it raw (waivers rails, pool leaderboard/modal, vsfield ladder, players owner chips, draft board, games, standings).
- T15-14R's backfill fixed the worst class **on live prod** (2026-07-05: `email_shaped_rows=0`), so live captures no longer leak raw emails via displayName — but they still commit **real people's chosen names** across every leaderboard/ladder shot, the **viewer's real email** on the sign-in sent state and anywhere account identity echoes, "Signed in as {name}" in the topbar, and the **residual commish_audit text** (T15-14R's open item) in the `/commish` audit rail.

Options: **synthetic** (capture against a seeded league with fictional managers — zero scrub debt, re-capturable forever, and the same seed answers decision (b)'s fixture needs) vs **scrub** (capture live, then blur/crop ~60 shots ×2–3 viewports, re-doing it on every re-capture, one miss = a name in git history permanently). Recommendation: **synthetic for anything committed**; live-readonly captures stay fine for ephemeral/local design iteration that never lands in the repo. Middle path if seeding feels heavy for Wave 1: commit only shots whose surfaces are identity-free or fiction-by-construction (marketing landing), keep name-bearing live shots uncommitted until the synthetic league exists.

### (b) Fixture strategy — which `fixture` states justify a seeded DB vs salvage

Buckets from the matrix:

| Bucket | States | Call to make |
| --- | --- | --- |
| **Salvage suffices** | Group dashboard, draft lobby/active + bespoke grid, group pool 3-way controls, old group chrome, ceremony frames | `design_reference/` mocks already express the layout; they're mock-data and slightly stale vs live CSS — fine as Claude Design *input*, wrong as pixel truth. **Recommend: salvage, no fixture.** |
| **Wait, don't build** | Champion/complete trio (post-7/19), timed states in Wave 3 (live match, FA window, 3P, Starting badge, on-block) | Calendar delivers these free within two weeks. **Recommend: wait.** |
| **Seeded DB genuinely required** | Write micro-states (save/error toasts, saving), frozen period, voided claims, non-participant + eliminated-viewer sessions, unlinked/denied landing arms, empty-data guards, root error page | Small design value per shot — mostly toasts and guards, not layout drivers. **Recommend: defer unless Claude Design asks**, EXCEPT that decision (a)=synthetic already implies a seeded league — if that seed gets built, harvesting this bucket from it is nearly free, and the eliminated-viewer + non-participant states (which shape real UCL design calls) become capturable properly instead of via the `/commish?as=` proxy. |
| **Operator-interactive (Sergio, live)** | Push enabled/send-test on his device, quiet-window freeze (T15 App-A already sanctions it), pending-bid rows if he places one | Piggyback on the T15 walkthrough he already owes; no harness. |

Net: **(a) synthetic → build one seeded fixture league once, capture everything committed from it; (b) salvage for phase-gone layouts, calendar for timed states, no extra fixture machinery beyond the (a) seed.**

---

*Pass 1 stops here per the thread fence: no capture harness, no session injection, no fixture seeding, no screenshots. Pass 2 opens on Sergio's (a)+(b) calls.*
