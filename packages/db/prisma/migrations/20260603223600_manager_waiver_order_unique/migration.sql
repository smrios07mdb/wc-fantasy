-- Uniqueness half of the rolling waiver order: no two managers in a league share a position.
-- Plain (non-deferrable) unique index — Prisma-managed, round-trips cleanly through migrate dev.
-- Multiple NULLs allowed (unseeded managers). Contiguity (1..N, no gaps) stays a batch-transaction
-- invariant; move-to-bottom uses a two-phase reassignment (temp range, then final 1..N) to avoid
-- transient collisions. See schema.prisma Manager.waiverOrderPosition.
CREATE UNIQUE INDEX "manager_waiver_order_uq" ON "manager"("league_id", "waiver_order_position");
