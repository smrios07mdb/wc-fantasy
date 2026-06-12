# CODE PROMPT 44 — Lift draft positional caps  [PARALLEL with #43 Pool Realtime]

## Goal
Remove the per-position draft cap (2/5/5/3) so managers may draft ANY position mix up to
the 15-man total. Lineup/formation rules are intentionally UNCHANGED — a manager who
over-drafts one position must still self-assemble a fieldable XI later. This is a draft-
legality relaxation only.

## PARALLEL STAGING — strict file-disjointness (READ FIRST)
- Branch `feat/draft-uncap` off CURRENT `main` now. Runs alongside the in-flight #43
  (Pool Realtime) branch. Conventional commits. No force-push.
- Touch ONLY draft-owned paths: `packages/draft/src/**` (+ a possible client gate in
  `apps/web/**/draft/**`, see step 3). DO NOT touch anything pool/Realtime (#43 owns
  `apps/web/**/pool/**` + any shared Supabase Realtime client), no `schema.prisma`, no
  migration, no global `ds.css`/`shell.css`, no App Shell nav/layout.
- DO NOT edit brain files in-branch (DECISIONS/PROJECT/ARCHITECTURE/SCORING). Both this
  branch and #43 would collide on them — report a "docs delta" block instead (see below);
  Chat folds it into a single combined post-merge docs commit.
- If you find you NEED a shared/out-of-scope file, STOP and flag it — do not edit it.

## The change

### 1. `packages/draft/src/roster.ts` — relax the predicate (total-based)
- Keep the 2-arg signature `isPositionLegal(counts, position)` so call sites in
  `controller.ts` and `autopick.ts` don't churn; the `position` arg is now unused (prefix
  `_position` if lint flags it).
- New behavior:
  - `isPositionLegal` → legal iff squad total `< SQUAD_SIZE` (import `SQUAD_SIZE` from
    `@app/shared`; drop the now-unused `SQUAD_COMPOSITION` import from THIS file only).
  - `isSquadComplete` → true iff squad total `>= SQUAD_SIZE`, any shape.
  - Add a small `squadTotal(counts)` helper (`POSITIONS.reduce`).
- Update the file's top doc comment: caps lifted per the Theme B amendment; legality is now
  the 15-man total only.
- Do NOT change `SQUAD_COMPOSITION` in `@app/shared` — the lineup validator and the draft
  Summary display still consume it. Leave `PositionFullError` in `errors.ts` in place
  (now effectively unreachable in snake flow — that's fine; no signature churn).

### 2. Bring the draft-package tests in line
- `grep -rn "SQUAD_COMPOSITION\|isPositionLegal\|isSquadComplete\|PositionFull" packages/draft/src`
  and update EVERY cap-dependent assertion:
  - `roster.test.ts`: the "rejects a 6th MID / 3rd GK / etc." cases flip — a 6th MID is now
    LEGAL; the squad is full ONLY at 15 total; `isSquadComplete` true at 15 of any
    distribution, false at 14.
  - `autopick.test.ts`: "skips a queue entry whose position bucket is already full"
    (`counts: { FWD: 3 }`) — FWD is no longer full, so autopick now TAKES that entry; fix
    the expectation (and the analogous ranking-fallback legality case).
  - `controller.test.ts` (if present): any test asserting `PositionFullError` on a same-
    position over-draft now expects SUCCESS instead. Update accordingly.
- Report the exact test-count delta.

### 3. Client pick gate — grep, relax only if present
- `grep -rn "SQUAD_COMPOSITION" apps/web` (and the draft components): if a pick CONTROL is
  disabled / a player greyed when `counts[pos] >= SQUAD_COMPOSITION[pos]`, relax it to the
  total-based rule (or reuse `isPositionLegal`). Stay inside `apps/web/**/draft/**`.
- The position-counter LABEL (`n/5`) is display-only — LEAVE it; a `7/5` overflow is
  acceptable cosmetic. Do not restyle counters in this prompt.

## Explicitly OUT of scope
- `FORMATION_BOUNDS` / the lineup validator — UNCHANGED (deliberate).
- `SQUAD_COMPOSITION` constant, counter cosmetics, any pool/Realtime file (#43), schema,
  migrations, App Shell/CSS, brain files.

## Docs delta (REPORT only — do NOT commit; Chat batches post-merge)
- DECISIONS.md → Theme B amendment: "Draft positional caps LIFTED — the draft is shape-
  unconstrained up to the 15-man total. Lineup/formation bounds (exactly 1 GK, min 3 DEF /
  2 MID / 1 FWD) are unchanged, so managers must still self-assemble a fieldable XI; an
  over-drafted squad can be locked out of a legal lineup by choice."
- ARCHITECTURE.md: `isPositionLegal`/`isSquadComplete` are now total-based (15), not per-
  position; `PositionFullError` retained but defensive/unreachable in snake flow.
- PROJECT.md: Prompt 44 entry (what shipped, test-count delta, branch@sha; merged once
  Sergio merges).
- SCORING.md: no change.

## Definition of Done
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` all green.
- No brain-file edits in-branch; docs delta reported instead.
- No signature churn on `isPositionLegal` / `submitPick` / `selectAutopick`.
- Report: diffs, test-count delta, branch@sha. Do NOT merge — Chat holds merge until
  explicit clearance.

## Verify-live (after merge + deploy; draft is live, so this is directly testable)
- On the live Render draft: confirm a manager can take a player in an old-capped position
  (e.g. a 6th MID) and the pick records; confirm the draft still completes at 15 picks/
  manager. Label any non-observable (worker/Realtime) state as an inference to confirm.

## Commit discipline
- `git checkout main && git pull && git checkout -b feat/draft-uncap`
- Conventional commit, e.g. `feat(draft): lift positional caps — shape-unconstrained to 15`.
  No force-push. Push the branch. Hold the merge for Chat review.