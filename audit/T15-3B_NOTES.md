# T15-3b — input focus-zoom reopened + maxLength verification

**Branch:** `fix/input-zoom-reopen` (= `feat/keyboards-form-attrs` tip `f7e2ff1` + verifier extensions)
**Status:** HOLD — no push/merge/deploy. Sergio's on-device zoom retest after deploy is the close-out gate.

## Root cause (one line)

**T15-3 was never merged.** The brief's premise — "T15-3 merged and deployed (main tip includes
df54c08+2)" — is wrong: `git ls-remote origin main` = `df54c08`, and the "+2" commits
(`192a499`, `f7e2ff1`) exist only on the unmerged branch `feat/keyboards-form-attrs`
(`git merge-base --is-ancestor 192a499 origin/main` → NOT an ancestor). Production is serving
pre-T15-3 code, so F-P1-I2 and F-P3-H2 failed on device exactly as pre-fix code must.
`verify-form-attrs.mjs` passed 42/42 because it ran against the feature branch's working tree —
it proved the branch, and said nothing about what production serves.

This is precisely the CLAUDE.md "status is derived, not narrated" failure class: a thread
reported MERGED+DEPLOYED, and no one diffed the claim against `origin/main`.

## Diagnosis table (per failing field, against the deployed cascade)

Deployed evidence fetched live from `https://wc-fantasy-web.onrender.com` (2026-07-05):

| Field | Class | Deployed computed size (touch) | Deployed winning rule | Zoom? | On T15-3 branch |
|---|---|---|---|---|---|
| Sign-in email | `.au-input` | **15px** (measured live via Playwright touch context) | `auth.css` `.au-input { font: 500 15px … }` — no coarse rule exists in ANY deployed bundle (0 hits across all 3 CSS files served on /sign-in) | YES | `@media (pointer:coarse) .au-input{16px}` — later in same file, same specificity → wins |
| Display-name (/settings) | `.input` | 14px (`--fs-body: 14px`) | ds.css base `.input` rule | YES | coarse `.input,.select,.textarea{16px}` in ALL 5 lockstep ds.css copies (line 252 each) + verified in 9 built bundles |
| FA search (/waivers) | `.wv-comp-input` | 14px | waivers.css base rule | YES | coarse `.wv-comp-input{16px}` |
| Settings/notifications toggles | `.se-toggle-input` | n/a | — | NO — `type="checkbox"`, iOS focus-zoom applies to text-entry controls only | n/a (correctly out of scope) |

Brief checklist 2a–2e, evaluated on the branch (i.e., is the fix sound once deployed):

- **(a) specificity:** no later or more-specific `font-size` rule targets any covered class after
  its coarse block in any stylesheet (swept every `font-size` declaration following each coarse
  block; only the coarse rules themselves match). `.is-error` variants don't set font-size.
- **(b) rem/root:** all coarse rules use `16px` literal; root font-size is irrelevant to them.
- **(c) element coverage:** ds.css rule covers `.select`/`.textarea`; commish covers
  `.adm-select/.adm-input/.adm-num` (coarse block is the LAST rule in commish.css, line 618);
  remaining unswept inputs are checkboxes (`.se-toggle-input`, `.wv-rel-confirm`) — no zoom
  surface. Draft clock input carries inline `fontSize: 16`.
- **(d) portals/modals:** BidComposer/FA-sheet inputs style from route-imported `waivers.css`,
  which Next bundles globally once imported — portal placement doesn't detach the rule.
- **(e) build output:** `pnpm --filter @app/web build` → `@media (pointer:coarse)` present in
  **9** `.next/static/css` bundles, including all 5 lockstep ds.css copies' outputs.

**Conclusion: no code defect in T15-3. The fix is correct; it just never shipped.** The viewport
`maximum-scale` workaround (brief §5) is NOT needed — fields will compute 16px once deployed.

## F-P3-H2 (maxLength)

Deployed `/settings` DOM cannot carry `maxlength="40"` — the attribute exists nowhere on
`origin/main` (grep: zero `maxLength` in the deployed tree). On the branch, `SettingsClient.tsx`
has `maxLength={40}` and the new jsdom/RTL test proves it survives to the **rendered DOM**
(`input.getAttribute("maxlength") === "40"`), closing the prop-spread/controlled-component
drop class. Sergio hitting the server-side Save warning past 40 chars is the expected behavior
of the deployed pre-T15-3 build.

## Verifier extensions (this thread's code changes)

1. **`apps/web/src/settings/SettingsClient.dom.test.tsx`** (new, +2 tests → suite 3314) —
   renders the real `SettingsClient`, asserts `maxlength="40"` + all T15-3 keyboard attrs in
   the rendered DOM, not the JSX.
2. **`verify-form-attrs.mjs` §(3) deployed-drift** (opt-in `--deployed[=URL]` /
   `VERIFY_DEPLOYED_URL`, default the Render URL) — loads the LIVE `/sign-in` in a Playwright
   touch context and asserts the deployed `.au-input` computed font-size ≥ 16px + live keyboard
   attrs. No soft-skip: unreachable prod = failed check.
   - Run today against prod it **fails 4 checks** (`.au-input` computes **15px** live) —
     mechanically reproducing Sergio's on-device F-P1-I2.
   - **Post-deploy close-out gate:** `node apps/web/scripts/verify-form-attrs.mjs --deployed`
     must go green after Render deploys the merge, before asking Sergio to retest on device.
   - Local (non-deployed) run remains 42/42 green; authed fields (/settings, /waivers) can't be
     checked live anonymously — covered by (1) + the working-tree sections.

## Fences

- packages/* byte-untouched (this thread touched only `apps/web` verifier/test + this doc).
- T15-CUT surfaces byte-untouched; fence verifiers pass UNMODIFIED:
  the-cut **43** · playoffs-hero **PASS (19)** · players **14** · shell-stacking **33** ·
  nav-latency **48** · nav-link **14** · mobile-nav **75**.
- DoD gate: `-w typecheck` ✓ · `lint` ✓ · `format:check` ✓ · tests **3314 passed / 104 skipped**
  (baseline 3312 + 2 new) · `@app/web build` ✓ authed routes ƒ (only `/sign-in`, `/auth/denied` ○, as before).

## Staged brain-docs section (apply on merge close-out)

> ### T15-3 / T15-3b — keyboards & form attributes (CORRECTED STATUS)
> - T15-3 (`192a499` + `f7e2ff1`) was **never merged** despite being tracked as merged+deployed;
>   T15-3b root-caused the F-P1-I2/F-P3-H2 device failures to exactly this. Delivery branch:
>   `fix/input-zoom-reopen` = T15-3 + rendered-DOM maxlength test + `--deployed` drift verifier.
>   Merge HELD for Sergio; post-deploy gate = `verify-form-attrs.mjs --deployed` green, then
>   Sergio's on-device zoom retest.
> - **F-P1-G1 on-device PASS (2026-07-05)** — sign-in email keyboard (pre-existing
>   `inputMode="email"` on main, independent of T15-3).
> - **F-P3-H1 on-device PASS (2026-07-05).**
> - **PUSH-KEYS operator item CLOSED** — notifications confirmed working on-device (2026-07-05).
> - **AUTOFIRE_CUTS_ENABLED** — still pending Sergio's Render dashboard confirmation.
