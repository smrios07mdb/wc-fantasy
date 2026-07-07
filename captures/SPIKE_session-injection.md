# Spike note — read-only prod-capture mechanism (session injection)

**Pass 2a of the capture manifest** (`audit/CAPTURE_MANIFEST_screens.md`). Proves how to capture the
gated identity surfaces (F-D08: kit jerseys, flags, `KitChip`, `PlayerAvatar`, nation names) from the
**live production** deploy, read-only, feeding the Claude Design crest/kit rebuild.

Sergio waived synthetic identities — real live-league PII is authorized (his league, participants
consented). No seed, no fixture DB. We point a browser at the existing prod deploy and screenshot it.

## The mechanism

Two scripts extend the existing `apps/web/scripts/verify-*.mjs` real-browser pattern (Playwright
chromium at 360 / 390 / 1440). The new axis is an **injected authenticated session**, because every
identity surface is gated: `/lineup` server-redirects `no-session → /sign-in`
(`app/lineup/page.tsx:15`, via `getSessionManager()`), same shape across `/vsfield`, `/players`,
`/waivers`, `/draft`, `/pool`.

Auth is **magic-link (passwordless)**, so a session cannot be minted headlessly — there is no password
to type, and the Supabase anon key / JWT secret are not in the local `.env` (only `DATABASE_URL` /
`DIRECT_URL` / `BALLDONTLIE_API_KEY`). The session must be produced by the human completing the login
once, in a real browser. Playwright's `storageState` (cookies + localStorage) is the transport.

```
1. capture-login.mjs   (HEADED, one-time)   → Sergio completes magic-link login in a visible browser;
                                               script saves context.storageState() to
                                               captures/.auth/state.json   (gitignored, never committed)
2. capture-screens.mjs (HEADLESS, read-only) → loads that storageState into each browser context,
                                               navigates the surface, screenshots it. Nothing else.
```

Cookie injection is opaque: Playwright replays whatever `sb-<project-ref>-auth-token` cookie(s) the
real login produced, so we never need to know the project ref or handle a token by hand.

## Read-only fence (hard)

Per surface the harness does **exactly**: `newContext(storageState)` → `page.goto` → `page.screenshot`.

- No `.click()` on action controls, no `.fill()`, no `.press()`, no `.check()`, no form submit, no POST,
  no request interception. Nothing mutates the live league — no placed bids, submitted lineups, freezes,
  or draft actions.
- Write-dependent states (save/error toasts, frozen period, voided claims) are **not** produced by
  performing the write live — they salvage from `design_reference/` or wait for the calendar
  (manifest §7b). The harness never writes to reach a state.
- **Session-expiry guard**: after `goto`, if the URL bounced to `/sign-in` or `/auth/denied`, the run
  FAILS loudly for that shot rather than saving a signed-out screen mislabeled as the surface.
- No `[skip render]` / deploy / app-source change — this is a harness pointed at the existing prod
  deploy, not a code change to it.

## What is proven autonomously (this pass)

Run against `https://wc-fantasy-web.onrender.com`, no real session:

1. **Prod reachable** — root `200`.
2. **Gate confirmed** — `/lineup` with no session redirects to `/sign-in` (so authed capture genuinely
   requires the injected session; an unauthenticated shot would be the wrong screen).
3. **No-session guard** — `capture-screens.mjs` with no `state.json` exits 1 with the bootstrap
   instruction, writes nothing.
4. **Injection + expiry-guard path** — with a _dummy invalid_ `state.json`, the harness injected the
   cookie, navigated prod `/lineup` at all three viewports, detected the bounce to `/sign-in`, failed
   loudly per viewport, and saved **zero** PNGs. Every line of the mechanism ran except "real data
   renders."

The one remaining step — the three real `/lineup` captures — is gated on a **real session**, which only
Sergio can produce (magic-link → his email). It is not a code gap.

## How to produce the captures

```
cd apps/web
node scripts/capture-login.mjs      # one-time; complete the magic-link login in the opened browser
node scripts/capture-screens.mjs    # read-only; writes captures/lineup__pitch-populated__{mobile-360,mobile-390,desktop-1440}.png
```

Base URL override: `--base=https://host` or `CAPTURE_BASE_URL`. Session lives in
`captures/.auth/state.json` (gitignored); re-run `capture-login.mjs` when a run reports a
session-expired bounce (Supabase refresh-token lifetime).

## Scaling to the rest of Wave 1

`capture-screens.mjs` holds a `SURFACES` array; only the `/lineup` entry is `active: true` this pass.
The Wave-1 remainder (`/vsfield` ladder + H2H XIs, `/players` table, `/games/[id]` Lineups pitch,
`/waivers` KitChips, `/draft` board, `/pool` flags — manifest §6) drops in as additional `active`
entries once these three samples pass Sergio's eyeball. States that need a tap-to-open sheet
(FaPlayerCardSheet, KOSheet H2H, FormationPicker) will read-only `.click()` a _disclosure_ control
only — still no write — and are added deliberately, not by default.
