# T15-BACKFILL — Prod count-query runbook

**Purpose:** size the `manager.display_name` PII backfill (T15-14R §3a) before any data fix is
built. Run these against **prod** and report the five results back.

## READ-ONLY guarantee

Every query below is a pure `SELECT`. Nothing here writes, updates, deletes, or opens a
transaction. Safe to run live mid-tournament, in any order, with no rollback needed. Do **not**
wrap them in a write transaction — no writes exist to wrap.

## Email-shape predicate (mirrors the shipped guard)

The shipped write-guard is `packages/shared/src/email.ts`:

```js
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
looksLikeEmail = (value) => EMAIL_SHAPE.test(value.trim());
```

Two properties the SQL must reproduce so the counts match exactly what the backfill will act on:

1. **Full-string, anchored** (`^…$`) — a name that merely *contains* `@` is legal.
2. **Trimmed, case-sensitive** — the guard trims before testing and uses no `i` flag.

SQL mirror: `trim(display_name) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'`
(Postgres POSIX ARE supports the `\s` shorthand, so this is byte-for-byte the JS pattern; `~`
not `~*` keeps it case-sensitive like the guard. `trim()` supplies the guard's `.trim()`.)

Sanity check against the guard's own table test (`email.test.ts`) — the SQL predicate agrees on
every boundary case:

| value          | guard | `trim(v) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'` |
|----------------|-------|------------------------------------------|
| `a@b.co`       | true  | true  ✓ |
| `yader.rosales@gmail.com` | true | true ✓ |
| `  a@b.co  `   | true  | true (trimmed) ✓ |
| `n@cho`        | false | false — no dot after `@` ✓ |
| `@handle`      | false | false — empty local part ✓ |
| `me@`          | false | false — empty domain ✓ |
| `a@b`          | false | false — no TLD dot ✓ |
| `Manager 3`    | false | false ✓ |
| `` (empty)     | false | false ✓ |

For the **residual audit scan (query 5 only)** the predicate is deliberately *un*anchored (email
shape appearing *anywhere* in free text), because those columns embed a name inside a sentence.
That is the intended difference, not a mismatch.

---

## The five queries

### 1 — Backfill target size
Answers: how many `manager` rows hold an email-shaped `display_name`? → sizes the whole backfill.

```sql
SELECT count(*) AS email_shaped_rows
FROM manager
WHERE trim(display_name) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$';
```

### 2 — The rows themselves (map-building input)
Answers: which rows, keyed by their immutable `draft_slot`? → the input for the slot→real-name
map the backfill will apply (`id` included so a row with a null `draft_slot` is still addressable).

```sql
SELECT id, draft_slot, display_name
FROM manager
WHERE trim(display_name) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
ORDER BY draft_slot NULLS LAST, id;
```

### 3 — Self-email flag
Answers: for how many of those, is the stored email the member's OWN sign-in email (vs. an invite
alias)? → tells us whether the leaked value is self-PII, informing how the real-name map is sourced.

```sql
SELECT count(*) AS own_email_rows
FROM manager m
JOIN app_user u ON u.id = m.user_id
WHERE lower(trim(m.display_name)) = lower(u.email);
```

### 4 — Fallback-label collision pre-check
Answers: does any existing `display_name` already equal a `Manager {slot}` label we'd assign? →
guards the case-insensitive per-league unique index before the `Manager {draft_slot}` fallback is used.

```sql
SELECT count(*) AS manager_label_rows
FROM manager
WHERE trim(display_name) ~* '^manager [0-9]+$';
```

### 5 — Residual: audit free-text (NOT fixed by the manager backfill)
Answers: how many `commish_audit` rows embedded an email-shaped token in free text at write time?
→ sizes the separate audit-scrub residual (T15-14R §4); un-anchored on purpose (email inside a
sentence).

```sql
SELECT count(*) AS audit_email_rows
FROM commish_audit
WHERE summary ~ '[^\s@]+@[^\s@]+\.[^\s@]+'
   OR detail  ~ '[^\s@]+@[^\s@]+\.[^\s@]+'
   OR reason  ~ '[^\s@]+@[^\s@]+\.[^\s@]+';
```

---

## What to report back
Five numbers (1, 3, 4, 5) plus the row listing (2). Query 2 becomes the map-building worksheet;
1/4/5 size the backfill, collision risk, and audit-scrub respectively; 3 flags self-PII.
