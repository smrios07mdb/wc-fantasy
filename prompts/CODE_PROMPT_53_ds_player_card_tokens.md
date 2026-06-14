# CODE_PROMPT — ds.css: add shared player-card (.pc-*) tokens (ADDITIVE)

## Context
The 2026-06-13 design batch shipped a fresh `ds/ds.css` export at
`design/design_reference/screens_2026-06-13/ds/ds.css`. Diffed against canonical
`apps/web/app/styles/ds.css` it diverges both ways (+50 / -30). Verdict:

- ADOPT (net-new): a shared **player-card** block — segmented Points|Stats tabs
  (`.pc-seg*`), Stats body (`.pc-stats`, `.pc-tiles`, `.pc-tile*`, `.pc-log*`,
  `.pc-lrow*`, `.pc-statline`, `.pc-stat*`), and standalone card chrome
  (`.pc-scrim`, `.pc-sheet`, `.pc-x`, `.pc-head*`, `.pc-ovr*`). Consumed by every
  player sheet (vf-psheet, sl-scoremodal) and the standalone FA/Waivers sheets.
  References EXISTING tokens only — no new variables.
- REJECT (export omissions, NOT design intent — live app depends on them, nothing
  in the new screens replaces them):
  - `--kit-outline` (dark + light) — vsfield kit rendering (`vsFieldSkin.test.ts`)
  - P46 PlayerAvatar + `.flag-emoji` block (`.player-avatar.pos-*`, `.pa-flag*`,
    `.flag-emoji*`) — app-wide; guarded by `flagWiring.test.ts` +
    `playerAvatarWiring.test.ts`
  - P40 backstop `html, body { max-width:100%; overflow-x:hidden }`

No existing token VALUE changes. This is a pure ADDITION. No re-skin.

## Scope — do EXACTLY this
1. Append the `.pc-*` block (the `+`-side of the diff; the section in the incoming
   file from `/* ... SHARED player card ... */` through the final
   `.pc-ovr-row .t-label` rule) to the END of `apps/web/app/styles/ds.css`, after
   the existing P40 backstop.
2. Apply the IDENTICAL block, byte-for-byte, to all four per-route copies:
   `apps/web/app/draft/ds.css`, `apps/web/app/lineup/ds.css`,
   `apps/web/app/vsfield/ds.css`, `apps/web/app/_landing/ds.css`.
3. Canonical and all four copies stay byte-identical (each longer by the same block).

## Do NOT
- Do NOT overwrite any ds.css wholesale with the incoming export.
- Do NOT remove or alter `--kit-outline`, the PlayerAvatar/`.flag-emoji` block, or
  the P40 `html, body` backstop.
- Do NOT change any existing selector or token value. Only delta = the appended `.pc-*`.
- Do NOT add per-route copies for new routes — out of scope.

## Seams / invariants
- One canonical (`styles/ds.css`, imported in root `app/layout.tsx`) + four
  byte-identical per-route copies. `apps/web/src/shell/appShell.test.ts` enforces
  byte-identity — MUST stay green.
- `.pc-*` consume existing tokens only (`--surface-*`, `--hairline*`, `--win`,
  `--loss`, `--text-*`, `--font-display/-sans`, `--r-*`, `--fs-*`, `--fw-*`,
  `--e1/-3`, `--overlay`, `--dur-fast`). Confirm each exists in canonical; if any is
  missing, STOP and report — do not invent values.

## Tests / gates
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` all green.
- `appShell.test.ts` byte-identity green post-append.
- `flagWiring.test.ts` + `playerAvatarWiring.test.ts` green (proves nothing dropped).
- ADD a wiring test (mirror flagWiring pattern) asserting canonical contains the
  player-card classes — at minimum `.pc-seg`, `.pc-sheet`, `.pc-tiles` — so a future
  wholesale re-export can't silently drop them.

## Verification (CSS-discipline exception)
No rendered surface changes — `.pc-*` are dormant until a screen consumes them.
Green gates + byte-identity + the new wiring test are sufficient clearance here.
Live-Render visual proof transfers to the first screen that renders `.pc-*`.

## Brain-file updates (do in handoff)
- DECISIONS.md: 2026-06-13 batch reconciled ADDITIVELY; `.pc-*` promoted to the
  design system; export's drops (`--kit-outline`, P46 avatar/flag-emoji, P40
  backstop) rejected as omissions (no intent, no replacement, live dependencies);
  new wiring test guards `.pc-*` presence.
- ARCHITECTURE.md: `.pc-*` = shared player-card surface (Points/Stats tabs +
  standalone sheet chrome), consumed by vf-psheet, sl-scoremodal, standalone
  FA/Waivers sheets; canonical `styles/ds.css` + 4 byte-identical copies.
- PROJECT.md / SCORING.md: no change.

## Branch / model
- Branch `feat/ds-player-card-tokens` off main, isolated worktree.
- Opus 4.8, high effort — small change, global blast radius; resist adopting the
  export wholesale.
