# T15 — Live mobile walkthrough (operator checklist)

- **Date issued:** 2026-07-03 · companion to `audit/AUDIT_T15_mobile_ux.md` (finding IDs referenced per step)
- **Operator:** Sergio, on his own phone, against the **live Render deploy**
- **Devices:** primary = your iPhone in portrait (Safari). Where a step says *360px*, use the narrowest device you can borrow (iPhone SE/mini class) or Safari Responsive Design Mode pinned to 360×780 as a fallback — but real-device results win. One pass in Chrome-iOS for the sign-in and push steps is a bonus, not required.
- **Recording:** for every step note **PASS / FAIL / N-A** plus a screenshot (screen-record the animation steps). FAIL screenshots should show the whole screen, not a crop.
- **Expected-FAIL steps:** steps marked ⚠ are static-analysis findings this walkthrough exists to confirm on real hardware; a FAIL there is confirmation, not news.

## 0 · Prep

1. Charge phone, join cellular (not wifi) for the cold-load steps; have Settings → Safari → Clear History ready for cache-cold repeats.
2. Know your league timezone setting (expected `America/New_York`); you'll compare clock readings across screens in §9.
3. Some states can't be manufactured on demand — see **Appendix A** for how/when to catch each one. Do those steps opportunistically during the next live round.

## 1 · Global sweeps (any screen)

1. ⚠ **Cold-load font flash / layout shift** — cellular, cache cleared, open `/`. Watch the first second: PASS = brand type appears quickly with no visible re-flow of headings/scores; FAIL = system-font flash, then everything jumps when Schibsted/Hanken swap in. (F-P2: font @import chain)
2. ⚠ **Dark overscroll + first paint** — on any screen, rubber-band past the top and the bottom; then cold-reload. PASS = the stretch areas and first paint are the app's near-black; FAIL = white bands / a white flash. (F-P2: color-scheme)
3. **Landscape notch** — rotate a notched iPhone on `/vsfield` and open the More sheet. PASS = no content/tab tucked under the notch or home-indicator ears. (F-P3: safe-area-x)
4. **PWA standalone** — Share → Add to Home Screen → launch from icon. PASS = dark splash, crisp XI icon, readable status bar, tab bar clear of the home indicator.
5. ⚠ **Keyboard vs bottom bar** — focus the display-name field on `/settings`, then a bid amount on `/waivers`. PASS = the tab bar behaves (doesn't float mid-screen over the input or keyboard). Known iOS `position:fixed` quirk — record what actually happens.
6. ⚠ **404 page** — type `/zzz` into the URL bar, once with the phone in light appearance and once in dark. Expected FAIL: a white (or pure-black), unbranded "404" with no nav and no way back. (F-P1: no not-found.tsx)
7. ⚠ **Tab-switch freeze on slow network** — enable Low Data Mode or find weak signal; tap Dashboard → Set lineup → Waivers. Time from tap to *any* visual change. Expected FAIL: the old screen sits frozen for the full round-trip (no loading state). (F-P2: no loading.tsx)
8. *(staging only — skip on prod)* forced server error → expect Next's bare white "Application error" page with no XI styling. (F-P1: no error.tsx)

## 2 · /standings

9. ⚠ **Matchday tab Points clipped** — open `/standings` (Matchday is the default tab) at 360–390px. Expected FAIL: the Points value per row is cut off / absent; tap where it should be — nothing. Compare at 430px where it should fit. (F-P0)
10. ⚠ **Cumulative tab chevron/trend clipped** — switch to Cumulative at 360 and 390px. Expected FAIL: the ▲/▼ trend is partly gone and the expand chevron fully gone; rows still expand when tapped but nothing invites the tap. (F-P1)
11. **Season grid scroll affordance** — hand the phone to someone who hasn't seen the app; ask them what the Season tab shows. PASS = they discover the horizontally-scrolled matchday columns unprompted. (F-P2)
12. **Live re-sort cue** — during a live scoring wave, watch the table when ranks change. PASS = any visible cue; FAIL = rows silently teleport. (F-P2)
13. **Stale "provisional cut" copy** — post-transition, check the ContextBand: does it still say the cut is provisional / "fixed at the group→playoff transition", and does "Top N qualify" match the real locked field on `/playoffs`? (F-P2)

## 3 · /lineup

14. ⚠ **SaveBar buried under the tab bar** — make any swap so the save bar appears, scroll so the pitch is centered. Expected FAIL: "Save lineup" and the legality-reason line sit behind the bottom nav, only emerging at absolute page bottom. (F-P1)
15. ⚠ **Server-reject error invisible** — during a live window, stage an edit, wait for a kickoff to lock one of the involved players, then Save. Expected FAIL: the error toast renders at the page bottom (behind/below the fold) and the tap looks like a no-op. (F-P1)
16. **Frozen period presentation** — freeze the current period from `/commish` (quiet moment; unfreeze after). On `/lineup`: are players still shown swappable and Save enabled? If yes, what happens on Save? (F-P2, needs-live-verify)
17. **Live lock flip** — sit on `/lineup` across a real kickoff. PASS = the affected token flips movable→locked without reload. (F-P2)
18. **Token micro-labels at 360px** — with real fixtures (long opponent names like "Saudi Arabia"), check the 9–11px opponent/kickoff/score labels over the turf: contained, no collisions, readable in daylight? (F-P2)
19. **Eight period tabs at 360px** — count wrap rows the MD1…Final strip consumes above the pitch and try fast-switching tabs; note mis-taps (~30px tall). (folded into F-P2 tap-target sweep)
20. ⚠ **Score sheet scroll-chain + close reachability** — open a played starter's score sheet (dense breakdown), scroll inside to the end, keep dragging. Expected FAIL: the page behind scrolls / pull-to-refresh arms; also check whether ✕ stays reachable when scrolled deep. Repeat on `/waivers` FA card Stats tab. (F-P2 scroll-containment, F-P2 sheet-close)

## 4 · /waivers

21. **FA window flip** — right after a knockout batch clears, watch for the free-agency panel to appear (cron flips the period open). Note the exact gap; while absent, does the screen explain *when* free agency opens, or look broken? (needs-live-verify)
22. ⚠ **Composer vs keyboard** — open the bid composer, focus amount then search. Expected risk: the composer's lower half (drop picker, Place bid) unreachable behind the keyboard. (F-P1 IA / F-P2 vh)
23. **URL-bar vs 90vh** — open the composer immediately after load (URL bar tall) and again after scrolling (bar collapsed). PASS = action row uncut in both. (F-P2 vh→dvh)
24. **Search jank** — with the full live FA pool, type fast in "Search free agents…". PASS = no dropped keystrokes. (F-P2)
25. ⚠ **Scroll-chain in composer lists** — swipe past the end of the FA list / drop picker. Expected FAIL: background scrolls. (F-P2 scroll-containment)
26. **Release-list confusion** — during a trim-down, ask a manager with played players whether the shorter release list reads as "N locked until the round ends" or as "players missing". (F-P1, needs-live-verify)
27. ⚠ **Composer under bottom nav** — with the composer open, check the Place-bid row clears the tab bar and that tabs do NOT respond through the scrim. Expected FAIL: nav tappable, mid-bid tap navigates away. (F-P1 z-index)
28. ⚠ **FA player card under nav** — open a player card from the FA pool. Expected FAIL: the tab bar paints over the card bottom and stays tappable. (F-P1 z-index, merged)
29. **NationFilter ergonomics** — expand "Nations ▸", scroll the grid, tap individual chips, then collapse and clear via the ✕ on the active chip. Note mis-taps (28px chips, 14px clear) and whether the grid steals the pick list off-screen. (F-P2)

## 5 · /vsfield + /pool

30. ⚠ **Season tab table clipped** — `/vsfield` → Season at 360–430px. Expected FAIL: rightmost columns (Points, by-period) cut with no in-table scroll. (F-P0)
31. **Elimination legibility** — across a cut moment (blade drop), watch the live field/leaderboard: PASS = something explains the field shrinking; FAIL = "rank X of N" silently changes. (F-P1)
32. **Period strip auto-scroll** — deep in the bracket (SF/Final live), load `/vsfield` at 360px. Expected FAIL: strip parked at MD1, active round off-screen right. (F-P2)
33. **Sheet height vs URL bar** — open the score sheet with the URL bar expanded. PASS = whole card incl. ✕ visible. (F-P2 vh)
34. ⚠ **Pool pick buttons** — one-handed, tap Home/Draw/Away near their edges repeatedly on a small iPhone. Expected FAIL: noticeable miss rate (34px tall). (F-P1)
35. **Contrast outdoors** — in bright light, check tertiary micro-labels on both screens and the cut-line labels on `/playoffs`. (F-P2)
36. **Pool leaderboard staleness** — background the tab mid-match, return after ~2 min: any "updated Xs ago" cue or does stale data look live? (F-P3)

## 6 · /games/[matchId]

37. ⚠ **Five-tab clip** — open a completed group-stage match (has Statistics + Standings) at 360–390px. Expected FAIL: the tab row is cut; Standings (and part of Ratings) unreachable. (F-P0)
38. **Live minute** — during a live match: is there any running clock/HT indicator anywhere, or a bare "Live" word? (F-P2)
39. **ET/pens** — open a knockout match decided on penalties (catch the next one). Expected FAIL: plain "1–1 · Full-time" with no shootout info; check Events for the score-anomaly banner. (F-P1)
40. **Event name overlap** — find a goal/sub by a long-named player; check the Events row at 360px for name-vs-minute collisions. (F-P2)
41. **Pitch token size** — on an iPhone SE-class device, Lineups tab: are shirt tokens comfortably tappable (≥~40px)? (F-P2)
42. **Muted fantasy chip contrast** — find an appearance-only (muted) points chip; readable? (F-P2)
43. **Deep-link Back** — open a match URL from a Notes/Messages paste; tap "‹ Back". PASS = sensible in-app destination (or the bottom nav suffices). (F-P3)
44. **Ratings podium** — a match whose top-3 includes long nation names: podium row fits at 360px? (F-P3)

## 7 · /commish (on your phone, mid-round conditions)

45. ⚠ **THE KEYBOARD TEST — type-to-confirm** — open the freeze confirm and the cut apply confirm; type the word with the stock keyboard, no manual caps. Expected FAIL: "Freeze"/"Cut" (auto-capitalized) never arms the button. (F-P1)
46. ⚠ **Borderless inputs** — Corrections/Playoff-cuts tabs: do inputs/selects have visible borders, or float as bare text patches (undefined `--border`)? (F-P2)
47. **Bottom clearance** — scroll a long tab (audit log) to the end: last row + confirm buttons fully above the tab bar/home indicator? (F-P3)
48. **Tab strip overflow** — at 360px: is it obvious the 4-tab strip scrolls sideways? Is Game operations reachable? (F-P2)
49. **Cut-preview with real names** — during the live round, read the alive-field table: can you identify everyone near the blade, or do names ellipsize to ~5 chars / CUT chips overflow? (F-P2)
50. **Ledger timestamps** — check audit rows: exact time visible on touch (not hover-only) and in league-local? (F-P2 + §9)

## 8 · Auth + settings

51. **Sign-in fold** — logged out on an SE-class phone: is "Send magic link" visible without scrolling past the brand panel? (needs-live-verify)
52. ⚠ **Input zoom** — focus the sign-in email, the FA search, the display-name field. Expected FAIL: page zooms on focus (and stays zoomed after blur) for every input except the bid amount. (F-P1 systemic)
53. **Magic-link interstitial** — tap the emailed link on cellular; time the blank page before landing. (F-P2)
54. **iOS push, Safari tab** — `/settings` → Enable browser notifications WITHOUT Home-Screen install. Record the exact behavior/message. Then A2HS and repeat: full flow completes end-to-end? (F-P2 messaging + F-P1 error handling)
55. ⚠ **Mid-enable failure** — start enabling, flip airplane mode right after granting permission. Expected FAIL: "Enabling…" stuck forever. (F-P1)
56. **Long email clip** — sign in with your longest manager email; in the check-email view is the address fully visible at 360px? (needs-live-verify)
57. **Expired link** — reuse a >15-min-old magic link: do you land on the generic denied page (conflating "not invited" with "link expired")? (F-P2)

## 9 · Time-consistency sweep (one fixture, side-by-side)

58. ⚠ **Same kickoff, four screens** — pick one upcoming fixture; read its kickoff/lock time on `/games/[matchId]`, `/lineup`, `/waivers` (batch bar), `/pool`. Expected FAIL: `/games` (and dashboard in group phase) show a time ~4h off the others, with no zone label; `/pool` says "ET" regardless of league setting. (F-P1 + F-P2s)
59. **League tz** — confirm the league timezone value in settings (expected America/New_York) so the offset math in §58 is anchored. (needs-live-verify)

## 10 · /draft (dead surface)

60. **Realtime leak** — idle on `/draft` 90s; if you can, check whether a websocket stays connected (visible as battery/network churn; DevTools if desktop-paired). (F-P2)
61. **Set clock inert-success** — as commissioner, submit a new pick-clock value. Expected FAIL: silent "success" on a permanently-complete draft. (F-P1)
62. **Board header names** — Board tab at 360px: longest manager name stays inside its column? (F-P3)

## 11 · /playoffs (guillotine theater)

*(The blade drop, champion endgame, and reduced-motion visuals are already proven by the Playwright harness `verify-playoffs-hero.mjs` — 12/12 desktop+mobile. The steps below cover what it does NOT: state semantics, tap targets, sockets, real density.)*

63. ⚠ **Eliminated-manager band** — while a later round is live, view `/playoffs` as (or shoulder-surf) a manager cut in an earlier round. Expected FAIL: the "You" band paints the rank in cobalt "safe" accent, or goes blank ("You –/N · – pts"), instead of an explicit red Eliminated/Out state. (F-P1-K1)
64. **Board/Ladder + round-nav targets** — at 360px tap the Board/Ladder toggle and the R1…Rn buttons repeatedly; note mis-taps (~30px tall). (F-P2-K2)
65. ⚠ **Backgrounded socket honesty** — open a live round, background Safari 60–120s, return. PASS = pill flips to Reconnecting/Delayed or points refresh immediately; FAIL = "Live" pill over frozen points for up to ~20s or indefinitely. (F-P2-K3)
66. **Boundary-tie victims row** — when a whole tied set sits at the cut, check the in-board avatar row stays within 360px (no wrap is coded). (F-P3-K4)
67. **Cut-zone contrast outdoors** — bright light: elim-on-elim-soft labels, accent on the You-band, 9–11px eyebrow text — readable at arm's length? (F-P2-I4, pairs with step 35)
## Appendix A · Hard-to-simulate states — when to catch them

| State | How/when |
|---|---|
| **Live match in progress** | Any knockout matchday evening — do §3 (14, 15, 17), §5 (31, 32), §6 (38), §7 (49) in one sitting. |
| **Frozen period** | You create it: `/commish` → freeze current period during a quiet window, run §3-16, unfreeze. Freeze gates auto-restatement only, but do it between matches anyway. |
| **Elimination / blade-drop moment** | End of the current round — have `/playoffs` and `/vsfield` open as the round settles (§5-31, §11). |
| **ET/penalties match** | Next shootout in the real schedule — do §6-39 within a day while the match page is fresh. |
| **FA window flip** | Minutes after the round's FAAB batch processes (§4-21). |
| **Playoff reduced-roster lineup** | Current reality — all §3 steps double as reduced-roster checks; confirm the pitch reads 7 starters + 2 bench. |
| **Server error page** | Staging only; never break prod. (§1-8) |
