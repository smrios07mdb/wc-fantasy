# T15-3 thread notes — keyboards & form attributes

Branch: `feat/keyboards-form-attrs` (worktree off `origin/main` @ `ac9e038`). Scope per
`SEQUENCE_T15_LAUNCH.md` → A3 / T15-3: F-P1-I2 (16px input floor), F-P1-G1 (FREEZE/CUT
autocapitalize), the inputmode/enterkeyhint sweep, F-P3-H1/H2. **HOLD — no push/merge/deploy**;
Sergio's merge gate. This branch predates the NAV-LINK-CONVERSION merge, so the test baseline
cut here is **3307 passed / 104 skipped** (per the assignment's stated fallback).

Fences respected: attributes + CSS only. No loader/handler/API/schema/RLS/Realtime/migration
changes, except the single minimal local-state guard required by F-P3-H1 (see §4) — no fetch/
loader/API touched. `packages/*` byte-untouched (no packages were read or written this thread).
BidComposer/FreeAgentPanel submit internals untouched — only attributes added to their existing
inputs. T15-CUT/vsfield surfaces byte-untouched.

---

## 1. Input inventory + attribute decisions

Every `<input>`/`<textarea>`/`<select>` on an authed surface, and the attribute decision applied.
Selects are native comboboxes with no on-screen keyboard concerns — no attributes added to any
`<select>`.

| File | Field | Type | Decision |
|---|---|---|---|
| `app/commish/CommishConsole.tsx` (`fz-word-*`) | FREEZE confirm word | text | `autoCapitalize="characters"` `autoCorrect="off"` `spellCheck={false}` `enterKeyHint="done"` — F-P1-G1 |
| `app/commish/CommishConsole.tsx` (`fz-reason-*`) | Freeze reason (logged) | text | `enterKeyHint="done"` |
| `app/commish/CommishConsole.tsx` (`uf-reason-*`) | Unfreeze reason (logged) | text | `enterKeyHint="done"` |
| `app/commish/CommishConsole.tsx` (`adv-word`) | CUT confirm word | text | `autoCapitalize="characters"` `autoCorrect="off"` `spellCheck={false}` `enterKeyHint="done"` — F-P1-G1 |
| `app/commish/CommishConsole.tsx` (`adv-reason`) | Cut reason (logged) | text | `enterKeyHint="done"` |
| `app/commish/CommishConsole.tsx` (`rp-add-search`) | Free-agent-pool search | text | `inputMode="search"` `enterKeyHint="search"` `autoCapitalize="none"` `autoCorrect="off"` `spellCheck={false}` |
| `app/commish/CommishConsole.tsx` (roster-repair reason) | Repair reason (logged) | text | `enterKeyHint="done"` |
| `app/commish/CommishConsole.tsx` (release reason) | Release reason (logged) | text | `enterKeyHint="done"` |
| `app/commish/CommishConsole.tsx` (starters reason) | Starters-fix reason (logged) | text | `enterKeyHint="done"` |
| `app/commish/CommishConsole.tsx` (Won / Committed) | Penalty entry | number, step 1 | `inputMode="numeric"` `enterKeyHint="done"` |
| `app/commish/CommishConsole.tsx` (penalty reason) | Penalty reason (logged) | text | `enterKeyHint="done"` |
| `app/commish/CommishConsole.tsx` (rating override) | Rating override, step 0.1 | number, decimal | `inputMode="decimal"` `enterKeyHint="done"` |
| `app/commish/CommishConsole.tsx` (rating reason) | Rating-override reason (logged) | text | `enterKeyHint="done"` |
| `app/commish/CommishConsole.tsx` (stat correction) | Per-stat correction, step 1 | number | `inputMode="numeric"` `enterKeyHint="done"` |
| `app/commish/CommishConsole.tsx` (stat-correction reason) | Stat-correction reason (logged) | text | `enterKeyHint="done"` |
| `app/sign-in/page.tsx` | Sign-in email | email | already had `inputMode="email"`/`autoComplete="email"`/`spellCheck={false}`; added `autoCapitalize="none"` `enterKeyHint="go"` |
| `src/settings/SettingsClient.tsx` (`se-display-name`) | Display name | text | `maxLength={40}` (F-P3-H2) `autoCapitalize="words"` `autoCorrect="off"` `spellCheck={false}` `enterKeyHint="done"` |
| `src/players/components.tsx` (`SearchField`) | Player search | search | `inputMode="search"` `enterKeyHint="search"` `autoCapitalize="none"` `autoCorrect="off"` `spellCheck={false}` |
| `src/waivers/FreeAgentPanel.tsx` | FA search | text | `inputMode="search"` `enterKeyHint="search"` `autoCapitalize="none"` `autoCorrect="off"` `spellCheck={false}` |
| `src/waivers/BidComposer.tsx` (search) | FA search | text | same as above |
| `src/waivers/BidComposer.tsx` (amount) | Sealed bid amount | number | `inputMode="numeric"` `enterKeyHint="done"` (the named F-P1-I2 merged instance) |
| `src/waivers/ReleasePanel.tsx` | Unfillable-XI confirm | checkbox | none (checkbox — no keyboard concern) |
| `src/notifications/NotificationsClient.tsx` | 3 preference toggles | checkbox | none |
| `app/draft/DraftRoomClient.tsx` (pick-clock seconds) | Clock seconds | number | `inputMode="numeric"` `enterKeyHint="done"`; inline `fontSize` bumped 13→16 (dead surface today, per audit — draft is historically complete; fixed anyway since the sweep is systemic) |
| `app/draft/components.tsx` (`dr-search`) | Draft player/nation search | text | `inputMode="search"` `enterKeyHint="search"` `autoCapitalize="none"` `autoCorrect="off"` `spellCheck={false}` |

**Deliberately not changed:** `type` attributes on the bespoke search inputs above (draft, waivers
FA panel/composer, commish `rp-add-search`) — kept as plain `text` rather than switching to
`type="search"`, to avoid introducing the native browser clear-✕ affordance as an unaudited
visual side effect. `players` `SearchField` already used `type="search"` in the shipped code —
left as-is, attributes only added.

## 2. F-P1-I2 — 16px input floor

Fix applied as `@media (pointer: coarse) { … font-size: 16px; }` in each touched stylesheet,
rather than a blanket bump — this is scoped to touch input (where iOS Safari's zoom-on-focus
actually fires) and leaves desktop/mouse density untouched. Touched:

- **All 5 `ds.css` copies, in lockstep** (`app/styles/ds.css`, `app/draft/ds.css`,
  `app/lineup/ds.css`, `app/vsfield/ds.css`, `app/_landing/ds.css` — verified byte-identical
  before and after via `md5`): `.input, .select, .textarea` floor to 16px under coarse pointer.
  Covers settings display-name, draft's `dr-search`, and any other surface using the shared
  `.input`/`.select`/`.textarea` classes.
- `app/_auth/auth.css` — `.au-input` (sign-in email; was 15px).
- `app/commish/commish.css` — `.adm-select`, `.adm-input`, `.adm-num` (was `var(--fs-sm)`=13px,
  or UA-default ~13.3px for `.adm-num`, which had no explicit font-size at all).
- `src/waivers/waivers.css` — `.wv-comp-input` (FA/bid-composer search; was 14px). `.wv-bid-input`
  was already 18px — no change needed.
- `src/players/players.css` — `.pl-search-input` (was 14px).

## 3. F-P1-G1 — FREEZE/CUT confirm-word keyboard fix

`FREEZE_CONFIRM_WORD = "FREEZE"` and `CUT_CONFIRM_WORD = "CUT"` are matched via
`typed.trim() === FREEZE_CONFIRM_WORD` (case-sensitive, exact). Default iOS `autocapitalize`
("sentences") only capitalizes the first letter typed, so a manager typing normally produces
`"Freeze"`/`"Cut"`, which never satisfies the exact-match gate — the confirm button silently
stays disabled with no visible reason, on the two most consequential irreversible actions
(period freeze; playoff cut), exactly when the commissioner is racing a live deadline.

Fix: `autoCapitalize="characters"` (every keystroke is uppercased as typed, so `"FREEZE"` and
`"CUT"` are what actually lands in the field) + `autoCorrect="off"` + `spellCheck={false}` (kill
predictive-text interference with the guard word) on both `fz-word-*` and `adv-word`.

**⚠ MANUAL CHECK NEEDED — Sergio:** this is exactly the field the sequence flags as needing an
on-device check, since `autocapitalize="characters"` behavior varies subtly by iOS keyboard
version. On a real iPhone:

1. Open `/commish` → Game operations (or Playoff cuts) → open a Freeze (or Cut/Advance) confirm.
2. Tap into the "Type FREEZE confirm" (or "Type CUT confirm") field.
3. Type the word in **lowercase**, letter by letter, exactly as you'd type normally (don't
   manually hold shift or toggle caps-lock).
4. Confirm the field visibly shows `FREEZE` (or `CUT`) in all caps as you type — not `Freeze`
   or lowercase — and that the confirm/apply button arms (goes from disabled to enabled) once
   the reason field is also filled.
5. Also confirm no autocorrect suggestion bar appears above the keyboard while typing the word.

## 4. F-P3-H1 — push-enable double-tap guard

Added `enabling` state to `NotificationsClient`, mirroring the existing `savingPrefs` pattern
already used for the preference toggles. `handleEnable` sets it `true` before calling
`enableBrowserPush` and `false` in a `finally`; the "Enable browser notifications" button binds
`disabled={enabling}`. This only guards against concurrent double-tap — it does **not** add the
try/catch error-handling around `enableBrowserPush`'s own rejection path that F-P1-H1 (a separate
T15-9f thread, out of this thread's scope) calls for; an unhandled rejection from
`enableBrowserPush` still propagates after the guard resets, unchanged from before.

## 5. F-P3-H2 — display-name maxLength

`maxLength={40}` on `se-display-name`, matching `validateDisplayName`'s 40-char server-side cap
(`src/manager/displayName.ts:13`). Manager now gets a proactive stop instead of learning the
limit only after a round-trip Save.

## 6. Verification

- `apps/web/scripts/verify-form-attrs.mjs` (new, follows the `verify-*.mjs` house pattern) — 42
  checks, all green:
  - **Font floor** (real Playwright/Chromium, real CSS inlined): every touched form-control
    class computes `font-size >= 16px` under a touch/mobile context (360, 390) and stays at its
    original pre-fix size under a desktop mouse context (1180) — proves the fix is
    `pointer:coarse`-scoped, not a blanket bump.
  - **Attribute sweep** (source-pinned, not a replica — reads the real `.tsx` files and
    regex-asserts the swept attributes are present near each named field, so a future edit that
    drops an attribute fails this check): FREEZE/CUT confirm words, commish search/numeric/
    decimal fields, sign-in email, settings display-name maxLength, notifications busy-guard,
    players search, waivers bid amount, draft clock.
- Full DoD gate green: `pnpm -w typecheck` · `pnpm -w lint` · `pnpm -w format:check` ·
  `pnpm -w test` → **3307 passed / 104 skipped** (baseline cut before NAV-LINK-CONVERSION merge,
  per the assignment's stated fallback) · `pnpm --filter @app/web build` green, all authed routes
  still `ƒ` dynamic.
- Fence verifiers UNMODIFIED and still green: `verify-the-cut.mjs` 43/43,
  `verify-playoffs-hero.mjs` (all green), `verify-players.mjs` 14/14,
  `verify-shell-stacking.mjs` 33/33, `verify-nav-latency.mjs` 48/48,
  `verify-mobile-nav.mjs` 75/75. (`verify-nav-link.mjs` does not exist on this branch — it postdates
  the NAV-LINK-CONVERSION merge this branch was cut before, consistent with the 3307 baseline.)
- `packages/*` diff: empty (confirmed via `git status`/`git diff --stat` before commit — this
  thread never touched a package).

## 7. Staged brain-docs section (for `/braindocs`, not yet applied)

**PROJECT.md** — add under the T15 session log:

> **T15-3 (keyboards & form attributes) DONE — HELD** (2026-07-05, `feat/keyboards-form-attrs`):
> F-P1-I2 16px input floor shipped as `@media (pointer: coarse)` across the 5 lockstep `ds.css`
> copies + `.au-input`/`.adm-select`/`.adm-input`/`.adm-num`/`.wv-comp-input`/`.pl-search-input`
> (touch-scoped, desktop density unchanged); F-P1-G1 FREEZE/CUT confirm-word
> `autoCapitalize="characters"` fix (manual on-device check owed — see
> `audit/T15-3_NOTES.md` §3); full inputmode/enterkeyhint/autocomplete sweep across every
> authed text/number input (commish, sign-in, settings, players, waivers, draft); F-P3-H1 push-
> enable busy-state guard; F-P3-H2 display-name `maxLength={40}`. New
> `verify-form-attrs.mjs` (42/42: real-Chromium font-floor proof + source-pinned attribute
> sweep). Attributes/CSS only — zero loader/handler/API/schema change (one local `enabling`
> state var for the busy-guard). Gate green (typecheck/lint/format/**3307**/web build). Fence
> verifiers (the-cut 43, playoffs-hero, players 14, shell-stacking 33/33, nav-latency 48/48,
> mobile-nav 75/75) UNMODIFIED. HOLD for Sergio's merge + the FREEZE/CUT on-device check.

**DECISIONS.md** — no new decisions; this thread only implements audit-prescribed fixes, no
open questions.

**ARCHITECTURE.md** — add a one-line cross-ref under the CSS-system section: "form-control
touch-target font floor (`@media (pointer: coarse)`) lives alongside the z-scale/token pass from
T15-2 — same 5-ds.css-copies-in-lockstep constraint applies to any future edit of
`.input,.select,.textarea`."
