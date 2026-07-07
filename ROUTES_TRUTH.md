# ROUTES_TRUTH.md

Derived from apps/web/app route tree + repo-wide entry-point grep, cross-checked against audit/DESIGN_PLAN_screen_inventory.md R1-R5. Evidence-only; no consolidation opinions.

## Route tree

### User-facing pages (page.tsx)

| Path              | File                                    | Layout                                                                                                                                         | Notes                                                                    |
| ----------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `/`               | `apps/web/app/page.tsx`                 | `apps/web/app/layout.tsx` (root only — no `AppShell`; page renders its own `Hub`/`SignIn`/`Unlinked`/`Denied` branch via `selectLandingView`)  | `force-dynamic`; 4-outcome auth branch                                   |
| `/auth/denied`    | `apps/web/app/auth/denied/page.tsx`     | root layout only (no `apps/web/app/auth/denied/layout.tsx` exists)                                                                             | static info page                                                         |
| `/sign-in`        | `apps/web/app/sign-in/page.tsx`         | root layout only (no `apps/web/app/sign-in/layout.tsx` exists)                                                                                 |                                                                          |
| `/commish`        | `apps/web/app/commish/page.tsx`         | `apps/web/app/commish/layout.tsx` → `AppShell active="commish" isCommissioner`                                                                 | commissioner-gated; `access.kind === "redirect"` → `redirect(access.to)` |
| `/draft`          | `apps/web/app/draft/page.tsx`           | `apps/web/app/draft/layout.tsx` → `AppShell active="draft"`                                                                                    |                                                                          |
| `/games/:matchId` | `apps/web/app/games/[matchId]/page.tsx` | `apps/web/app/games/[matchId]/layout.tsx` (no `AppShell` here — mounted in `page.tsx` itself per comment: "a LAYOUT cannot read searchParams") | dynamic segment `[matchId]`; also has `not-found.tsx`, `loading.tsx`     |
| `/lineup`         | `apps/web/app/lineup/page.tsx`          | `apps/web/app/lineup/layout.tsx` → `AppShell active="lineup"`                                                                                  |                                                                          |
| `/players`        | `apps/web/app/players/page.tsx`         | `apps/web/app/players/layout.tsx` → `AppShell active="players"`                                                                                |                                                                          |
| `/playoffs`       | `apps/web/app/playoffs/page.tsx`        | `apps/web/app/playoffs/layout.tsx` → `AppShell active="playoffs"`                                                                              |                                                                          |
| `/pool`           | `apps/web/app/pool/page.tsx`            | `apps/web/app/pool/layout.tsx` → `AppShell active="pool"`                                                                                      |                                                                          |
| `/scoring`        | `apps/web/app/scoring/page.tsx`         | `apps/web/app/scoring/layout.tsx` → `AppShell active="scoring"`                                                                                |                                                                          |
| `/settings`       | `apps/web/app/settings/page.tsx`        | `apps/web/app/settings/layout.tsx` → `AppShell active="settings"`                                                                              |                                                                          |
| `/standings`      | `apps/web/app/standings/page.tsx`       | `apps/web/app/standings/layout.tsx` → `AppShell active="standings"`                                                                            |                                                                          |
| `/vsfield`        | `apps/web/app/vsfield/page.tsx`         | `apps/web/app/vsfield/layout.tsx` → `AppShell active="vsfield"`                                                                                |                                                                          |
| `/waivers`        | `apps/web/app/waivers/page.tsx`         | `apps/web/app/waivers/layout.tsx` → `AppShell active="waivers"`                                                                                |                                                                          |

### API routes (route.ts)

| Path                             | File                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `POST /api/commish/advance`      | `apps/web/app/api/commish/advance/route.ts`                                                          |
| `POST /api/commish/freeze`       | `apps/web/app/api/commish/freeze/route.ts`                                                           |
| `POST /api/commish/lineup`       | `apps/web/app/api/commish/lineup/route.ts`                                                           |
| `POST /api/commish/penalty`      | `apps/web/app/api/commish/penalty/route.ts`                                                          |
| `POST /api/commish/rating`       | `apps/web/app/api/commish/rating/route.ts`                                                           |
| `POST /api/commish/roster`       | `apps/web/app/api/commish/roster/route.ts`                                                           |
| `POST /api/commish/stat`         | `apps/web/app/api/commish/stat/route.ts`                                                             |
| `POST /api/commish/unfreeze`     | `apps/web/app/api/commish/unfreeze/route.ts`                                                         |
| `/api/db-check`                  | `apps/web/app/api/db-check/route.ts`                                                                 |
| `/api/draft/clock`               | `apps/web/app/api/draft/clock/route.ts`                                                              |
| `/api/draft/force-pick`          | `apps/web/app/api/draft/force-pick/route.ts`                                                         |
| `/api/draft/pick`                | `apps/web/app/api/draft/pick/route.ts`                                                               |
| `/api/draft/queue`               | `apps/web/app/api/draft/queue/route.ts`                                                              |
| `/api/draft/start`               | `apps/web/app/api/draft/start/route.ts`                                                              |
| `/api/draft/state`               | `apps/web/app/api/draft/state/route.ts`                                                              |
| `/api/draft/timer`               | `apps/web/app/api/draft/timer/route.ts`                                                              |
| `/api/faab/bid`                  | `apps/web/app/api/faab/bid/route.ts`                                                                 |
| `/api/faab/free-agent`           | `apps/web/app/api/faab/free-agent/route.ts`                                                          |
| `/api/faab/release`              | `apps/web/app/api/faab/release/route.ts`                                                             |
| `/api/health`                    | `apps/web/app/api/health/route.ts`                                                                   |
| `/api/lineup`                    | `apps/web/app/api/lineup/route.ts`                                                                   |
| `/api/manager/display-name`      | `apps/web/app/api/manager/display-name/route.ts`                                                     |
| `/api/manager/watchlist`         | `apps/web/app/api/manager/watchlist/route.ts`                                                        |
| `/api/notifications/preferences` | `apps/web/app/api/notifications/preferences/route.ts`                                                |
| `/api/notifications/subscribe`   | `apps/web/app/api/notifications/subscribe/route.ts`                                                  |
| `/api/notifications/test`        | `apps/web/app/api/notifications/test/route.ts`                                                       |
| `/api/notifications/unsubscribe` | `apps/web/app/api/notifications/unsubscribe/route.ts`                                                |
| `/api/player-box`                | `apps/web/app/api/player-box/route.ts`                                                               |
| `/api/player-tournament-stats`   | `apps/web/app/api/player-tournament-stats/route.ts`                                                  |
| `/api/playoffs`                  | `apps/web/app/api/playoffs/route.ts`                                                                 |
| `/api/pool/pick`                 | `apps/web/app/api/pool/pick/route.ts`                                                                |
| `/api/standings`                 | `apps/web/app/api/standings/route.ts`                                                                |
| `/api/vsfield`                   | `apps/web/app/api/vsfield/route.ts`                                                                  |
| `/auth/callback`                 | `apps/web/app/auth/callback/route.ts` — OAuth/magic-link exchange, no `page.tsx` at this path        |
| `/auth/sign-out`                 | `apps/web/app/auth/sign-out/route.ts` — POST-only, invoked from `AppShell.tsx:267` sign-out `<form>` |

### `next.config.mjs` redirects

`apps/web/next.config.mjs` — no `redirects()` key present. All redirects in this app are programmatic (`redirect()` from `next/navigation` in Server Components, or `NextResponse.redirect()` in route handlers), not config-level.

### `middleware.ts`

`apps/web/middleware.ts:5-7` — calls `updateSession(request)` from `@/lib/supabase/middleware` on every navigable request (matcher excludes `_next/static`, `_next/image`, `favicon.ico`, `sw.js`, `site.webmanifest`, and common image extensions — `middleware.ts:13-15`). This is session-cookie refresh only; it performs no path rewriting or redirecting itself (auth-gate redirects happen in each `page.tsx`, not in middleware).

### In-code `redirect()` calls (source → target, file:line)

| Source page       | Target                                                         | file:line                                  |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------ |
| `/draft`          | `/sign-in`                                                     | `apps/web/app/draft/page.tsx:16`           |
| `/draft`          | `/auth/denied`                                                 | `apps/web/app/draft/page.tsx:17`           |
| `/players`        | `/sign-in`                                                     | `apps/web/app/players/page.tsx:21`         |
| `/players`        | `/auth/denied`                                                 | `apps/web/app/players/page.tsx:22`         |
| `/standings`      | `/sign-in`                                                     | `apps/web/app/standings/page.tsx:21`       |
| `/standings`      | `/auth/denied`                                                 | `apps/web/app/standings/page.tsx:22`       |
| `/standings`      | `/auth/denied` (manager row vanished mid-session)              | `apps/web/app/standings/page.tsx:25`       |
| `/lineup`         | `/sign-in`                                                     | `apps/web/app/lineup/page.tsx:16`          |
| `/lineup`         | `/auth/denied`                                                 | `apps/web/app/lineup/page.tsx:17`          |
| `/commish`        | `access.to` (dynamic target from `access.kind === "redirect"`) | `apps/web/app/commish/page.tsx:24`         |
| `/playoffs`       | `/sign-in`                                                     | `apps/web/app/playoffs/page.tsx:22`        |
| `/playoffs`       | `/auth/denied`                                                 | `apps/web/app/playoffs/page.tsx:23`        |
| `/vsfield`        | `/sign-in`                                                     | `apps/web/app/vsfield/page.tsx:26`         |
| `/vsfield`        | `/auth/denied`                                                 | `apps/web/app/vsfield/page.tsx:27`         |
| `/scoring`        | `/sign-in`                                                     | `apps/web/app/scoring/page.tsx:56`         |
| `/scoring`        | `/auth/denied`                                                 | `apps/web/app/scoring/page.tsx:57`         |
| `/settings`       | `/sign-in`                                                     | `apps/web/app/settings/page.tsx:25`        |
| `/settings`       | `/auth/denied`                                                 | `apps/web/app/settings/page.tsx:26`        |
| `/waivers`        | `/sign-in`                                                     | `apps/web/app/waivers/page.tsx:26`         |
| `/waivers`        | `/auth/denied`                                                 | `apps/web/app/waivers/page.tsx:27`         |
| `/games/:matchId` | `/sign-in`                                                     | `apps/web/app/games/[matchId]/page.tsx:36` |
| `/games/:matchId` | `/auth/denied`                                                 | `apps/web/app/games/[matchId]/page.tsx:37` |
| `/pool`           | `/sign-in`                                                     | `apps/web/app/pool/page.tsx:19`            |
| `/pool`           | `/auth/denied`                                                 | `apps/web/app/pool/page.tsx:20`            |
| `/auth/callback`  | `${origin}/auth/denied?reason=missing_code`                    | `apps/web/app/auth/callback/route.ts:23`   |
| `/auth/callback`  | `${origin}/auth/denied?reason=exchange_failed`                 | `apps/web/app/auth/callback/route.ts:27`   |
| `/auth/callback`  | `${origin}/auth/denied?reason=not_allowlisted`                 | `apps/web/app/auth/callback/route.ts:35`   |
| `/auth/callback`  | `${origin}${next}` (post-login target, e.g. `/`)               | `apps/web/app/auth/callback/route.ts:42`   |
| `/auth/sign-out`  | `/sign-in` (303)                                               | `apps/web/app/auth/sign-out/route.ts:12`   |

Every authenticated page page.tsx follows the same two-line pattern: `no-session` → `/sign-in`, any other non-`ok` outcome → `/auth/denied`. `/commish` additionally has its own `access.kind === "redirect"` branch.

## Entry-point map

Canonical nav source: `apps/web/src/shell/crossNav.ts` — `NAV_ITEMS` (desktop top strip, `crossNav.ts:47-68`, exact hrefs: `/`, `/draft`, `/lineup`, `/vsfield`, `/standings`, `/waivers`, `/players`, `/pool`, `/playoffs`, `/scoring`, `/settings`), `BOTTOM_TAB_ITEMS` (mobile bottom bar, `crossNav.ts:73-83`: home, draft?, lineup, vsfield, pool, players — see file for exact 6-slot set), `MORE_SHEET_ITEMS` (mobile overflow, `crossNav.ts:87-95`: scoring, waivers, standings, playoffs, draft, settings), and the commissioner-gated `COMMISH_NAV_ITEM` (`crossNav.ts:40-44`, href `/commish`, rendered conditionally). Both `NAV_ITEMS` and `BOTTOM_TAB_ITEMS`/`MORE_SHEET_ITEMS` are consumed by `apps/web/app/shell/AppShell.tsx` (desktop strip: `AppShell.tsx:224-256`; mobile bottom bar: `AppShell.tsx:280-304`) and `apps/web/app/shell/MoreSheet.tsx` (overflow sheet: `MoreSheet.tsx:99-116`).

- **`/`** — `crossNav.ts:47` (`NAV_ITEMS` id `home`); `AppShell.tsx:208` brand-mark `<a href="/">`; `BoundaryScreen.tsx:69` `<Link href="/">` (error-boundary "go home" CTA); auth-callback default post-login `next` target (`auth/callback/route.ts:42`, via `safeNextPath(null)`).
- **`/auth/denied`** — linked from `apps/web/app/page.tsx:139` (Denied-state CTA); redirect target from every authenticated page (see redirect table above) and `auth/callback/route.ts:23,27,35`.
- **`/sign-in`** — linked from `apps/web/app/page.tsx:125` (SignIn state), `apps/web/app/auth/denied/page.tsx:27`, `apps/web/app/_landing/MarketingLanding.tsx:196,233,1318,1320,1321,1322,1329,1333,1334,1335` (marketing landing CTAs); redirect target from every `no-session` branch (see redirect table); `auth/sign-out/route.ts:12` (post sign-out).
- **`/commish`** — `crossNav.ts:40-44` `COMMISH_NAV_ITEM`, rendered conditionally at `AppShell.tsx:243-256` and `MoreSheet.tsx:117-132` (gated on `isCommissioner`); also self-referential CTAs inside the console itself: `apps/web/app/commish/CommishConsole.tsx:2266`, `2307`.
- **`/draft`** — `crossNav.ts:47` region (`NAV_ITEMS`), also present in `MORE_SHEET_ITEMS` (`crossNav.ts:93`) so it's reachable from both the desktop strip and the mobile More sheet.
- **`/games/:matchId`** — no nav entry (dynamic, not a `NavId`); linked as a drill-in with template-literal paths: `apps/web/app/_dashboard/Dashboard.tsx:433` (`` `/games/${match.matchId}?from=home` ``), `apps/web/app/vsfield/components.tsx:158` (`` `/games/${m.matchId}?from=vsfield` ``), `apps/web/src/pool/components.tsx:220` (`` `/games/${fixture.matchId}` ``). Confirmed by `games/[matchId]/layout.tsx:2-3` comment: "a DRILL-IN reached from the dashboard matchday list, the Quiniela (/pool) fixtures, and The Cut's match strip."
- **`/lineup`** — `crossNav.ts` `NAV_ITEMS`/`BOTTOM_TAB_ITEMS`, rendered at `AppShell.tsx:224-240` (desktop) and `AppShell.tsx:280-304` (mobile bottom tab).
- **`/players`** — in `crossNav.ts` `NAV_ITEMS` (`crossNav.ts:59`) and `BOTTOM_TAB_ITEMS` (`crossNav.ts:82`) as a first-class tab; ALSO a separate hardcoded `<Link href="/players">` fallback at `apps/web/app/shell/MoreSheet.tsx:114`, outside the `moreItems.map()` loop (`MoreSheet.tsx:99-110`) and not sourced from `MORE_SHEET_ITEMS` — this is the redundant "Browse players" entry R3 flags. Also linked from `apps/web/src/waivers/WaiversClient.tsx:491` (`<a href="/players">`, "browse all" from Waivers).
- **`/playoffs`** — `crossNav.ts:64` in `NAV_ITEMS`, also `crossNav.ts:92` in `MORE_SHEET_ITEMS` — reachable from both desktop strip and mobile More sheet (`AppShell.tsx:224-240`, `MoreSheet.tsx:99-110`).
- **`/pool`** — `crossNav.ts:62` in `NAV_ITEMS` (label "Quiniela"), rendered via `AppShell.tsx:224-240`.
- **`/scoring`** — `crossNav.ts:66` in `NAV_ITEMS`, `crossNav.ts:88` in `MORE_SHEET_ITEMS`.
- **`/settings`** — `crossNav.ts:68` in `NAV_ITEMS`, `crossNav.ts:94` in `MORE_SHEET_ITEMS`.
- **`/standings`** — `crossNav.ts:54` in `NAV_ITEMS`, `crossNav.ts:91` in `MORE_SHEET_ITEMS` — present in both desktop strip and mobile More sheet, but NOT linked from `Dashboard.tsx`'s `StandingsModule`, which instead links to `/vsfield?manager=${e.managerId}` (`Dashboard.tsx:351`) — the dashboard's own "where do I stand" module bypasses `/standings` entirely.
- **`/vsfield`** — `crossNav.ts:51` region in `NAV_ITEMS`/`BOTTOM_TAB_ITEMS`; also linked from `Dashboard.tsx:351` (`` `/vsfield?manager=${e.managerId}` ``) and `Dashboard.tsx:780` (`<a href="/vsfield">`).
- **`/waivers`** — `crossNav.ts:55` in `NAV_ITEMS`, `crossNav.ts:89` in `MORE_SHEET_ITEMS`; also deep-linked with a query param from Players: `apps/web/src/players/components.tsx:194` (``href={`/waivers?bid=${player.id}`}``), consumed by `apps/web/src/waivers/waiversLogic.ts:168` and seeded via `apps/web/src/waivers/FreeAgentPanel.tsx:57` / `BidComposer.tsx:62`.
- **`/auth/callback`** (route.ts, not a page) — target of the Supabase magic-link email; not linked in-app by `<Link>`/`href` (external OAuth provider callback URL, configured in Supabase, not grep-visible in this repo).
- **`/auth/sign-out`** (route.ts, not a page) — POST-only `<form action="/auth/sign-out" method="post">` at `apps/web/app/shell/AppShell.tsx:267`.

## R1-R5 verdict table

| Finding                                                                                                                                          | Doc's stated verdict                                                                                                               | Independent verdict                                         | Deciding evidence (file:line)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 — `/vsfield` (The Cut) vs `/playoffs` (Theater), "not in nav" / "entry point unclear"                                                         | REFUTED (both are in nav on both viewports; reachable via multiple CTAs)                                                           | CONFIRMED (agrees with doc)                                 | `/vsfield` and `/playoffs` both appear in `crossNav.ts` `NAV_ITEMS` (`crossNav.ts:51,64`) and `crossNav.ts` `MORE_SHEET_ITEMS` (`crossNav.ts:92` for playoffs; vsfield is a primary `BOTTOM_TAB_ITEMS` slot, not overflow) — rendered at `AppShell.tsx:224-256` (desktop) and `MoreSheet.tsx:99-116` (mobile). Additional non-nav CTAs into `/vsfield`: `Dashboard.tsx:351,780`. `/playoffs` has no non-nav CTA found in this grep pass beyond the nav entries themselves — still reachable, but via nav only.                                                                                  |
| R2 — "Where do I stand" split across `/standings`, `/vsfield`, dashboard module; dashboard module actually points at `/vsfield` not `/standings` | CONFIRMED (three display surfaces exist; `/standings` is Season-only, `/vsfield` covers both live+season)                          | CONFIRMED (agrees with doc)                                 | `StandingsModule` in `apps/web/app/_dashboard/Dashboard.tsx:328` links out via `href={`/vsfield?manager=${e.managerId}`}` at `Dashboard.tsx:351` — the dashboard's standings module bypasses `/standings` entirely and routes to `/vsfield`. `/standings` remains independently reachable only through `crossNav.ts:54` (`NAV_ITEMS`) / `crossNav.ts:91` (`MORE_SHEET_ITEMS`), with zero inbound `href`/`router.push` references found from any dashboard or feature component.                                                                                                                 |
| R3 — Player browsing overlap `/players` vs `/waivers`; MoreSheet "Browse players" fallback is hardcoded, not sourced from `MORE_SHEET_ITEMS`     | CONFIRMED on 3 of 4 sub-claims (incl. the hardcoded MoreSheet fallback)                                                            | CONFIRMED (agrees with doc)                                 | `apps/web/app/shell/MoreSheet.tsx:114` — `<Link href="/players" prefetch={false} className="sh-more-item" onClick={close}>Browse players</Link>` sits OUTSIDE the `moreItems.map(...)` loop at `MoreSheet.tsx:99-110`, which only iterates the prop-supplied `moreItems` (sourced from `MORE_SHEET_ITEMS`/`navItemsForPhase`, per `AppShell.tsx:192,311`) — this is a second, independently-coded `/players` entry, not one driven by the shared nav config. `/players` is separately also a first-class `NAV_ITEMS`/`BOTTOM_TAB_ITEMS` entry (`crossNav.ts:59,82`), confirming the redundancy. |
| R4 — Duplicated identity UI: `<Flag>`/NationFilter vs draft's bespoke nation grid                                                                | grid duplication CONFIRMED; `<Flag>` sub-claim REFUTED                                                                             | Not independently verifiable from Part 2 route/nav evidence | Out of scope for a route/entry-point grep — R4 concerns component-level code duplication (draft's local nation-grid state vs `NationFilter`), not routing or nav wiring. No route-level file:line evidence bears on this claim; deferred to the doc's own component-level citations.                                                                                                                                                                                                                                                                                                            |
| R5 — "`/standings` and `/playoffs` absent from both nav surfaces"                                                                                | REFUTED on both viewports (both present in desktop strip + mobile More sheet; absent only from the 5 _primary_ mobile bottom tabs) | CONFIRMED (agrees with doc)                                 | `crossNav.ts:54` (`{ id: "standings", href: "/standings", ... }` in `NAV_ITEMS`) and `crossNav.ts:64` (`{ id: "playoffs", href: "/playoffs", ... }` in `NAV_ITEMS`) — both rendered in the desktop top strip via `AppShell.tsx:224-240`. Both also appear in `MORE_SHEET_ITEMS` (`crossNav.ts:91` standings, `crossNav.ts:92` playoffs), rendered in the mobile overflow via `MoreSheet.tsx:99-110`. Neither appears in `BOTTOM_TAB_ITEMS` (`crossNav.ts:73-83`), confirming they are absent from the 5 _primary_ mobile bottom tabs specifically, not from nav entirely.                       |

## Orphan routes

None found among page.tsx routes — every user-facing route has at least one inbound reference (nav config entry, redirect target, or in-code `href`/template-literal link), per the Entry-point map above.

The following are reachable only through the shared `AppShell`/`crossNav.ts` nav config and have no additional standalone in-app CTA beyond that (i.e., they'd be orphaned if the shared nav were ever removed from their render path, but are not currently orphaned): `/scoring`, `/settings`, `/draft` (draft also has `/draft` in `MORE_SHEET_ITEMS`, no other inbound found), `/pool`, `/playoffs`.

`/auth/callback` is a route.ts with no in-repo `<Link>`/`href` reference — its only "entry point" is the external Supabase magic-link email URL, which is not visible to a repo grep. Not flagged as orphan since it is a callback endpoint, not a navigable page.
