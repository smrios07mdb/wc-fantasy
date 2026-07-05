# T15-15 (PII-GUARD) — write-path guard for `manager.displayName`

Built on the T15-14R map (`audit/T15-14R_NOTES.md` §3b). Closes the **recurrence** vector for the
email-in-manager-name PII leak by rejecting an email-SHAPED `displayName` at BOTH — and only —
write paths. Pure validators + TDD. **No DB, no migration, no render site, no loader, no
`packages/scoring`, no fence verifier touched.** Existing polluted rows remain the backfill's job
(separate thread, gated on Sergio's prod counts + slot→name map — T15-14R §3a).

Branch `feat/t15-15-pii-guard`, committed, **un-pushed** — held for Sergio's merge gate. No visual
surface, so the gate is merge authorization + green suite, not a device inspection.

## What landed

1. **`looksLikeEmail(value)`** — `packages/shared/src/email.ts` (`@app/shared`, exported via index).
   Full-string email shape on the trimmed value: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Full-string only —
   a name merely *containing* `@` (e.g. `n@cho`) stays legal. Pinned by a 17-case table test
   (`email.test.ts`): real addresses + whitespace-padded → true; `n@cho`/`@handle`/`me@`/`a@b`/
   `Nacho @ Home`/`a b@c.co`/plain names/empty → false.

2. **Guard site 1 — provisioning** (`apps/worker/src/provision/plan.ts`, `validateConfig`): an
   email-shaped `displayName` now pushes a loud validation error
   (`manager <email> has an email-shaped displayName (<name>) — use a real name or "Manager <slot>"`),
   as an `else if` after the existing empty check. Rejecting (not normalizing) is right: the config
   is operator-authored + re-runnable. Provisioning is the SOLE creator of manager rows (T15-14R §1),
   so this is where the prod pollution entered verbatim.

3. **Guard site 2 — self-serve rename** (`apps/web/src/manager/displayName.ts`, `validateDisplayName`):
   result union gains `reason: "email_like"`; returned after the empty + length checks. The route
   (`app/api/manager/display-name/route.ts` → `handleDisplayNameRename` line 68) already surfaces
   `validated.reason` as the 400 body, so the reason maps through with no route change.

## Gate (green)

typecheck ✓ · lint ✓ · format:check ✓ · test **3382 passed / 104 skipped / 0 failed** ✓.
Fences unmodified + green: the-cut (43) · players (14) · playoffs-hero · pitch-layout (40) ·
page-fit (8, synthetic-email width fixture intact). RED→GREEN proven: 5 new guard tests fail with
guards reverted, pass with them.

Scope = 7 files (5 modified + 2 new), all validator/test/export — confirmed via `git diff --stat`.

---

## STAGED FOR MERGE-TIME — apply to DECISIONS.md + BACKLOG.md on merge (do NOT apply pre-merge)

**DECISIONS.md** — new entry:

> **T15-15 — email-shaped `manager.displayName` rejected at both write paths.** Shared pure
> `looksLikeEmail` (full-string match; `n@cho`-style names stay legal) gates `validateConfig`
> (provisioning, the sole row creator) and `validateDisplayName` (self-serve rename, the recurrence
> vector). Rejects loud rather than normalizing — provisioning config is operator-authored and
> re-runnable. Display-only column, nothing keys on the name (T15-14R §4), so live-safe. The
> **recurrence vector is closed**; existing polluted rows are still pending the backfill (T15-14R
> §3a, gated on prod counts + slot→name map). DB-level CHECK constraint deliberately NOT added —
> a mid-tournament migration for a display column is over-engineering when two app gates cover both
> writers.

**BACKLOG.md** — mark the guard half of the N2/N6 data-fix DONE; leave the backfill OPEN:

> - [x] T15-15 write-path PII guard — `looksLikeEmail` at `validateConfig` + `validateDisplayName`
>   (merged `<sha-on-merge>`). Recurrence vector closed.
> - [ ] T15-14R backfill — slot-keyed `display_name` scrub of existing email-shaped rows. Gated on
>   Sergio running T15-14R §3a queries 1–4 (target count + slot→real-name map) + query 5 (residual
>   `commish_audit` free-text count). Still OPEN.
