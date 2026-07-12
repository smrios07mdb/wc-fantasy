-- 2026-07-13 SF FAAB batch override (commissioner ops; run by hand in Supabase SQL editor)
-- Supersedes the row's prior waiver_batch_at of 2026-07-14 16:00:00+00.
UPDATE period
SET waiver_batch_at = '2026-07-13 20:00:00+00'
WHERE kind = 'knockout_round' AND label = 'SF' AND batch_cleared_at IS NULL
RETURNING id, label, waiver_batch_at, batch_cleared_at;
