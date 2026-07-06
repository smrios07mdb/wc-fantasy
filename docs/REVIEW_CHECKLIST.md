# Review Checklist

Greppable, one-line review rules. Keep each rule terse so `grep`-ing this file at review time
surfaces the invariant fast. Each rule links to the authoritative DECISIONS entry / fence.

## Raw SQL

- **Raw-SQL id/FK binds are always bare `$n`, never `::uuid`.** In any `$queryRaw*` / `$executeRaw*`,
  bind id/FK params bare — `WHERE id = $n`, `WHERE "fooId" = $n`; for arrays use `= ANY($n::text[])`,
  **never** `::uuid` / `::uuid[]`. Every uuid-shaped column in the schema is Postgres **TEXT** (zero
  `@db.Uuid`), so a `::uuid` cast mismatches the text column and raises `42883 operator does not
exist: text = uuid`. See the DECISIONS entry "Schema-wide: EVERY uuid-shaped id/FK column is TEXT"
  and `audit/SCHEMA_UUID_INVENTORY.md`. Enforced in CI by `apps/web/src/fences/uuidBindFence.test.ts`
  (the `auth.uid()` `::uuid::text` RLS shim in integration tests is the sole deliberate exception).
