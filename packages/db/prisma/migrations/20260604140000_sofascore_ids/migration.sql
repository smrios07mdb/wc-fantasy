-- Prompt 05b: stored Sofascore ids for the scraper's stored-id-only identity resolution (additive).
-- Populated by the verified one-time keyMatch pass; the scrape path resolves a target ONLY by stored id.
ALTER TABLE "fifa_match" ADD COLUMN "sofascore_match_id" INTEGER;
ALTER TABLE "player" ADD COLUMN "sofascore_player_id" INTEGER;
CREATE UNIQUE INDEX "fifa_match_sofascore_match_id_key" ON "fifa_match"("sofascore_match_id");
CREATE UNIQUE INDEX "player_sofascore_player_id_key" ON "player"("sofascore_player_id");
