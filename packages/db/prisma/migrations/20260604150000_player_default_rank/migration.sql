-- Draft go-live (Prompt 09 provisioning track): best-available draft ranking on `player`.
-- 1-based, lower = better; NULL = unranked (sorts last). Resolves the @app/draft autopick "best-available"
-- SEAM (getDefaultRanking) + orders the draft-room pool, so an expired-timer autopick takes the best legal
-- player, not the alphabetically-first. Populated by the provisioning ranking step (feed rating or manual).
ALTER TABLE "player" ADD COLUMN "default_rank" INTEGER;
CREATE INDEX "player_default_rank_idx" ON "player"("default_rank");
