-- faab_bid.priority (DECISIONS §D amendment — the Prompt-25 deferral lifted): manager-set
-- processing priority among their OWN pending claims, honored by the batch resolver as the
-- intra-manager EQUAL-AMOUNT tiebreak only. Amount remains the primary ordering.
--
-- Additive only: one nullable column, no index. The comparator uses RELATIVE order (cancel leaves
-- gaps; null sorts last, falling to the pre-existing deterministic keys), so contiguity is a
-- convenience, not an invariant — deliberately NO unique index: a unique(manager_id, priority)
-- would turn the benign concurrent-submit append race (two bids computing the same MAX+1) into a
-- P2002 failure, where the no-index design degrades gracefully to the deterministic key beneath.
ALTER TABLE "faab_bid" ADD COLUMN "priority" INTEGER;

-- Backfill every still-PENDING bid per manager by created_at ASC (id ASC as the deterministic
-- same-instant tail), contiguous 1..N. Settled/void rows stay NULL — priority is a pending-claim
-- concept; results surfaces never render it and the resolver's null fallback covers re-reads.
UPDATE "faab_bid" b
SET "priority" = r.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "manager_id" ORDER BY "created_at" ASC, "id" ASC) AS rn
  FROM "faab_bid"
  WHERE "status" = 'pending'
) r
WHERE b."id" = r."id";
