# T15-BACKFILL — `manager.display_name` PII backfill plan

**Status:** PROPOSAL. This thread designs; it writes nothing to the DB and does not
build the runnable script/migration. Chat + Sergio clear this plan before any
BUILD/APPLY thread opens.

**Origin:** T15-14R §3a — two `manager.display_name` values are raw email addresses
(config-borne via the provision upsert). The write-path guard (T15-15 / PII-GUARD,
`c2b0150`) closed the *recurrence* vector; this backfill closes the *existing data*
exposure that predates the guard.

**Predicate (shipped guard, `packages/shared/src/email.ts`):**
`trim(display_name) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'` — full-string anchored,
trimmed, case-sensitive. The backfill acts on exactly the rows this predicate matches,
so the write-guard and the backfill agree byte-for-byte on what "email-shaped" means.

---

## 1. Inputs — prod runbook outputs (read-only, pre-image)

Captured from prod via the §3a runbook (`psql "$DIRECT_URL"`, session
`default_transaction_read_only = on`):

| Query | Result |
|-------|--------|
| Q1 `email_shaped_rows` | **2** |
| Q4 `manager_label_rows` (case-insensitive `^manager [0-9]+$`) | **0** — no collisions |
| Q5 `audit_email_rows` (commish_audit residual, upper bound) | **0** |

**Q2 — map worksheet / rollback pre-image** (id · draft_slot · display_name, NULLS LAST):

| id | draft_slot | display_name (PII, pre-image) |
|----|-----------|-------------------------------|
| `e9f30e58-3a50-4bea-a51c-0039de3178d9` | 7 | `yader.rosales@gmail.com` |
| `3a3f75b1-2bd6-4a2c-8ae5-8691e7fec6de` | 8 | `ahitaon@gmail.com` |

**Q3 — self-email flags** (informational only; see §2):

| id | is_own_email |
|----|--------------|
| `e9f30e58-3a50-4bea-a51c-0039de3178d9` | t |
| `3a3f75b1-2bd6-4a2c-8ae5-8691e7fec6de` | t |

Both leaked values are the member's **own** sign-in email (not an invite alias).

---

## 2. Replacement-label policy

**Default rule:** each email-shaped row is relabeled **`Manager {draft_slot}`**
(capital `M`, single space, slot number verbatim). `draft_slot` is immutable and
unique per league, so the assigned labels are themselves unique and stable.

**Self-email vs. other-email (Q3):** treatment is **identical**. The PII exposure —
a raw email rendered as a public display name — is the same whether the address is the
member's own or someone else's. Q3 is recorded for completeness only; it does not
branch the policy. (Here both rows are self-email, so the point is moot but the rule
is stated so a future BUILD thread doesn't re-litigate it.)

### Concrete map (derived from Q2 — no placeholders)

| id | draft_slot | old (pre-image) | new_name |
|----|-----------|-----------------|----------|
| `e9f30e58-3a50-4bea-a51c-0039de3178d9` | 7 | `yader.rosales@gmail.com` | **`Manager 7`** |
| `3a3f75b1-2bd6-4a2c-8ae5-8691e7fec6de` | 8 | `ahitaon@gmail.com` | **`Manager 8`** |

Two rows, both with non-null slots, distinct slots → two distinct labels. Q4 = 0, so
neither `Manager 7` nor `Manager 8` already exists as a real name. **Every edge case
below resolves to this trivial default in the current data**; the fallback rules are
stated only so the BUILD thread is unambiguous if the data shifts before it runs.

### Fallback rules (unexercised here — stated for completeness)

1. **Null `draft_slot`** (the Q2 NULLS-LAST tail — empty in this snapshot). A null-slot
   row has no natural unique number. Fallback: label `Manager <short-id>`, where
   `<short-id>` is the first 8 hex chars of the row's `id` (e.g. `Manager e9f30e58`).
   The `id` is guaranteed present and unique, so uniqueness holds without a slot. Do
   **not** invent a sequential number for null-slot rows — a fabricated `Manager N`
   could collide with a real slot-N label.

2. **Collision** (an assigned `Manager {slot}` already exists as a real name — Q4 > 0).
   The collision check is **case-insensitive** (`~* '^manager [0-9]+$'`), matching the
   per-league case-insensitive unique index and catching an existing real `manager 7` /
   `Manager 7`. On collision for a given row, append the short-id disambiguator:
   `Manager {slot} ({short-id})`. Q4 = 0 here, so this never fires.

Both fallbacks preserve the invariant: **display-only, unique, no PII, no fabricated
collision.**

---

## 3. Mechanism shape (design only — not built here)

**Recommendation: a reviewed one-shot operator script**, run by Sergio in a Render
shell under `DIRECT_URL` — *not* a schema migration. Rationale:

- This is a pure **data** backfill, not a schema change. Following the T17/T18
  backfill-CLI precedent, a data fix belongs in an operator script, not the migration
  history — a migration would permanently encode two specific prod row-ids in the repo's
  schema lineage, which is noise for every future `migrate` on any environment.
- The script is idempotent and self-verifying (below), so a Render-shell run is as safe
  as a migration and leaves no schema-history residue.

**Per-row write — single idempotent, guarded UPDATE:**

```sql
UPDATE manager
SET display_name = <mapped_new_name>
WHERE id = <id>
  AND trim(display_name) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$';
```

The email-shape predicate **in the WHERE clause** is the idempotency + blast-radius
control:

- **Re-run safety:** after the first run the value is `Manager {slot}`, which no longer
  matches the predicate → the second run updates 0 rows. Fully idempotent.
- **Interim-rename safety:** if a user (or commish) renamed the row to a real,
  non-email name between the Q2 snapshot and the run, the predicate no longer matches →
  the script does **not** clobber the user's chosen name. The guard predicate, not the
  `id` alone, gates the write.

**Wrapping:** all per-row UPDATEs in one transaction (atomic — all rows relabel or
none). Precede with a **dry-run SELECT preview** (the same WHERE, `SELECT id,
draft_slot, display_name` — shows exactly which rows will change and confirms the
pre-image still matches). Follow with a **post-run verify**: re-run runbook Q1 →
**expect 0**. If Q1 ≠ 0 after the run, stop and investigate (a new email-shaped row
appeared, or a predicate mismatch).

---

## 4. Safety + rollback

- **Rollback record:** the **Q2 pre-image listing in §1** is the complete rollback
  source. To revert, re-`UPDATE` each `id` back to its pre-image `display_name` from
  that table. Two rows, both captured verbatim — rollback is trivial and lossless.
- **Blast-radius control:** the narrow guarded `WHERE id = … AND <email-shape>` limits
  each statement to a single known row *and* only if it still holds an email. No `WHERE`
  ranges over the whole table; no row outside the map is reachable.
- **Live-safe:** `display_name` is display-only. It does not pin lineups, seeding, or
  scoring (the render-layer fences don't key on it). Running mid-tournament changes only
  what the two managers are labeled, nothing competitive.

---

## 5. Ordering dependency (BUILD/APPLY gate)

The BUILD/APPLY thread must land **after** the T15-15 write-path guard is merged +
deployed, else provisioning-rerun or a self-rename could re-pollute a row mid-backfill.

- **Design-time check (this thread):**
  `git merge-base --is-ancestor c2b0150 origin/main` → **exit 0** (c2b0150 is an
  ancestor of origin/main `10177d2`). Dependency satisfied as of this writing.
- **This is not a permanent green light.** The BUILD thread must **re-verify** the guard
  is still merged + deployed at apply time (re-run the ancestor check against the then-current
  `origin/main`, and confirm the deploy is live) before running the UPDATE. The guard
  being an ancestor today does not prove it is deployed at the future apply moment.

---

## 6. Handoff — what the BUILD/APPLY thread does

1. Re-verify §5 ordering (guard merged **and** deployed) against current `origin/main`.
2. Re-run runbook Q1/Q2 against prod — confirm the two ids still match the pre-image
   (if a row self-corrected, the guarded WHERE simply skips it — no action needed).
3. Build the guarded UPDATE script per §3 (dry-run preview → atomic UPDATE → Q1 verify).
4. Sergio runs it in a Render shell under `DIRECT_URL`.
5. Post-run: Q1 = 0; spot-check the two managers render as `Manager 7` / `Manager 8`.

**STOP.** This plan is a proposal. No script built, no DB touched.
