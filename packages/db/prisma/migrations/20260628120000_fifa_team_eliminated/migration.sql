-- Commissioner-set add-side FA elimination flag (DECISIONS §D "eliminated-team add gate").
-- A player whose WC national team is eliminated is removed from the FAAB pool and cannot be ADDED
-- (bid / $0 grant / grant-tx race belt / batch resolver). Drops + already-fielded scoring are unaffected.
--
-- Additive + NOT NULL DEFAULT false → existing rows back-fill to false automatically; no data migration.
-- The flag is sourced MANUALLY (raw SQL by the commissioner) — there is no worker/derivation that writes
-- it, and the @app/ingest team upsert writes `name` only, so a boot/daily roster sync never resets it.
ALTER TABLE "fifa_team" ADD COLUMN "eliminated" BOOLEAN NOT NULL DEFAULT false;
