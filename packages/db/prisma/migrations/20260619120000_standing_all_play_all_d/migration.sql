-- Informational Draws in the all-play-all power record (DECISIONS.md → Theme C amendment).
-- A tied matchday matchup is now recorded as a Draw; W+L+D = opponents compared. Seeding is UNCHANGED
-- (W desc → total_points desc); draws are informational. DEFAULT 0 is load-bearing: app code reading
-- this column before the post-deploy restate must read 0, not error.
ALTER TABLE "standing" ADD COLUMN "all_play_all_d" INTEGER NOT NULL DEFAULT 0;
