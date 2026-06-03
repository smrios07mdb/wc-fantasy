-- CreateEnum
CREATE TYPE "Position" AS ENUM ('GK', 'DEF', 'MID', 'FWD');

-- CreateEnum
CREATE TYPE "LeagueStatus" AS ENUM ('draft', 'group', 'playoff', 'complete');

-- CreateEnum
CREATE TYPE "PeriodKind" AS ENUM ('group_md', 'knockout_round');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('pending', 'open', 'closed');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('pending', 'active', 'paused', 'complete');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('pending', 'won', 'lost', 'voided_refunded');

-- CreateEnum
CREATE TYPE "FaabBatchStatus" AS ENUM ('pending', 'processing', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "RatingSource" AS ENUM ('balldontlie', 'scrape', 'manual');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'postponed', 'abandoned');

-- CreateEnum
CREATE TYPE "StandingScope" AS ENUM ('group_stage', 'playoff', 'overall');

-- CreateEnum
CREATE TYPE "RecomputeScope" AS ENUM ('player_match', 'manager_period', 'standing');

-- CreateTable
CREATE TABLE "league" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "season_year" INTEGER NOT NULL DEFAULT 2026,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "faab_batch_local_time" TEXT NOT NULL DEFAULT '06:00',
    "result_freeze_hours" INTEGER NOT NULL DEFAULT 6,
    "draft_pick_seconds" INTEGER NOT NULL DEFAULT 90,
    "status" "LeagueStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "league_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "user_id" TEXT,
    "display_name" TEXT NOT NULL,
    "is_commissioner" BOOLEAN NOT NULL DEFAULT false,
    "draft_slot" INTEGER,
    "faab_budget" INTEGER NOT NULL DEFAULT 100,
    "waiver_order_position" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "manager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allowlist_email" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invited_by_user_id" TEXT,
    "claimed_by_user_id" TEXT,
    "claimed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allowlist_email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fifa_stage" (
    "id" TEXT NOT NULL,
    "balldontlie_stage_id" INTEGER,
    "name" TEXT NOT NULL,
    "ordering" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fifa_stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fifa_group" (
    "id" TEXT NOT NULL,
    "balldontlie_group_id" INTEGER,
    "name" TEXT NOT NULL,
    "stage_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fifa_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fifa_team" (
    "id" TEXT NOT NULL,
    "balldontlie_team_id" INTEGER,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,
    "country" TEXT,
    "group_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fifa_team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player" (
    "id" TEXT NOT NULL,
    "balldontlie_player_id" INTEGER NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "display_name" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "team_id" TEXT,
    "country" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fifa_match" (
    "id" TEXT NOT NULL,
    "balldontlie_match_id" INTEGER NOT NULL,
    "kickoff_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'scheduled',
    "stage_id" TEXT,
    "group_id" TEXT,
    "round" TEXT,
    "home_team_id" TEXT,
    "away_team_id" TEXT,
    "home_score" INTEGER,
    "away_score" INTEGER,
    "home_score_et" INTEGER,
    "away_score_et" INTEGER,
    "home_score_pens" INTEGER,
    "away_score_pens" INTEGER,
    "home_formation" TEXT,
    "away_formation" TEXT,
    "referee" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fifa_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_player" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "acquired_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dropped_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roster_player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineup_slot" (
    "id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "role" "Position" NOT NULL,
    "is_starter" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lineup_slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "kind" "PeriodKind" NOT NULL,
    "label" TEXT NOT NULL,
    "opens_at" TIMESTAMPTZ(6),
    "closes_at" TIMESTAMPTZ(6),
    "cut_count" INTEGER,
    "frozen_at" TIMESTAMPTZ(6),
    "status" "PeriodStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'pending',
    "current_pick_no" INTEGER,
    "current_manager_id" TEXT,
    "pick_deadline_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_pick" (
    "id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "pick_no" INTEGER NOT NULL,
    "manager_id" TEXT NOT NULL,
    "player_id" TEXT,
    "made_at" TIMESTAMPTZ(6),
    "is_auto" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_pick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_queue" (
    "id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "draft_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faab_batch" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "run_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "FaabBatchStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "faab_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faab_bid" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "player_add_id" TEXT NOT NULL,
    "player_drop_id" TEXT,
    "amount" INTEGER NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batch_id" TEXT,
    "status" "BidStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "faab_bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stat_player_match" (
    "match_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "minutes_played" INTEGER,
    "goals" INTEGER,
    "assists" INTEGER,
    "key_passes" INTEGER,
    "dribbles_attempted" INTEGER,
    "dribbles_completed" INTEGER,
    "duels_won" INTEGER,
    "duels_lost" INTEGER,
    "passes_total" INTEGER,
    "passes_accurate" INTEGER,
    "long_balls_total" INTEGER,
    "long_balls_accurate" INTEGER,
    "was_fouled" INTEGER,
    "clearances" INTEGER,
    "interceptions" INTEGER,
    "tackles_won" INTEGER,
    "blocked_shots" INTEGER,
    "saves" INTEGER,
    "saves_inside_box" INTEGER,
    "punches" INTEGER,
    "high_claims" INTEGER,
    "possession_lost" INTEGER,
    "extra" JSONB,
    "dirty" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stat_player_match_pkey" PRIMARY KEY ("match_id","player_id")
);

-- CreateTable
CREATE TABLE "event_match" (
    "id" TEXT NOT NULL,
    "balldontlie_event_id" INTEGER NOT NULL,
    "match_id" TEXT NOT NULL,
    "incident_type" TEXT NOT NULL,
    "incident_class" TEXT,
    "time_minute" INTEGER,
    "added_time" INTEGER,
    "period" TEXT,
    "player_id" TEXT,
    "assist_player_id" TEXT,
    "player_in_id" TEXT,
    "player_out_id" TEXT,
    "rescinded" BOOLEAN NOT NULL DEFAULT false,
    "extra" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shot_match" (
    "id" TEXT NOT NULL,
    "balldontlie_shot_id" INTEGER NOT NULL,
    "match_id" TEXT NOT NULL,
    "player_id" TEXT,
    "shot_type" TEXT,
    "situation" TEXT,
    "is_penalty" BOOLEAN NOT NULL DEFAULT false,
    "minute" INTEGER,
    "extra" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shot_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stat_team_match" (
    "match_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "offsides" INTEGER,
    "shots_blocked" INTEGER,
    "possession" DOUBLE PRECISION,
    "extra" JSONB,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stat_team_match_pkey" PRIMARY KEY ("match_id","team_id")
);

-- CreateTable
CREATE TABLE "rating_player_match" (
    "match_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "source" "RatingSource" NOT NULL,
    "rating" DOUBLE PRECISION,
    "dirty" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rating_player_match_pkey" PRIMARY KEY ("match_id","player_id","source")
);

-- CreateTable
CREATE TABLE "manual_stat_player_match" (
    "match_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "penalty_won" INTEGER NOT NULL DEFAULT 0,
    "penalty_committed" INTEGER NOT NULL DEFAULT 0,
    "extra" JSONB,
    "reason" TEXT,
    "entered_by_user_id" TEXT,
    "dirty" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "manual_stat_player_match_pkey" PRIMARY KEY ("match_id","player_id")
);

-- CreateTable
CREATE TABLE "score_player_match" (
    "match_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "breakdown_json" JSONB NOT NULL,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_player_match_pkey" PRIMARY KEY ("match_id","player_id")
);

-- CreateTable
CREATE TABLE "score_manager_period" (
    "manager_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "breakdown_json" JSONB,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_manager_period_pkey" PRIMARY KEY ("manager_id","period_id")
);

-- CreateTable
CREATE TABLE "standing" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "scope" "StandingScope" NOT NULL,
    "all_play_all_w" INTEGER NOT NULL DEFAULT 0,
    "all_play_all_l" INTEGER NOT NULL DEFAULT 0,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "seed" INTEGER,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "standing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recompute_dirty" (
    "id" TEXT NOT NULL,
    "scope" "RecomputeScope" NOT NULL,
    "match_id" TEXT,
    "player_id" TEXT,
    "manager_id" TEXT,
    "period_id" TEXT,
    "league_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "recompute_dirty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manager_league_id_idx" ON "manager"("league_id");

-- CreateIndex
CREATE UNIQUE INDEX "manager_league_id_user_id_key" ON "manager"("league_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "manager_league_id_draft_slot_key" ON "manager"("league_id", "draft_slot");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "allowlist_email_claimed_by_user_id_key" ON "allowlist_email"("claimed_by_user_id");

-- CreateIndex
CREATE INDEX "allowlist_email_email_idx" ON "allowlist_email"("email");

-- CreateIndex
CREATE UNIQUE INDEX "allowlist_email_league_id_email_key" ON "allowlist_email"("league_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "fifa_stage_balldontlie_stage_id_key" ON "fifa_stage"("balldontlie_stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "fifa_group_balldontlie_group_id_key" ON "fifa_group"("balldontlie_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "fifa_team_balldontlie_team_id_key" ON "fifa_team"("balldontlie_team_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_balldontlie_player_id_key" ON "player"("balldontlie_player_id");

-- CreateIndex
CREATE INDEX "player_team_id_idx" ON "player"("team_id");

-- CreateIndex
CREATE INDEX "player_position_idx" ON "player"("position");

-- CreateIndex
CREATE UNIQUE INDEX "fifa_match_balldontlie_match_id_key" ON "fifa_match"("balldontlie_match_id");

-- CreateIndex
CREATE INDEX "fifa_match_kickoff_at_idx" ON "fifa_match"("kickoff_at");

-- CreateIndex
CREATE INDEX "fifa_match_status_idx" ON "fifa_match"("status");

-- CreateIndex
CREATE INDEX "roster_player_league_id_player_id_idx" ON "roster_player"("league_id", "player_id");

-- CreateIndex
CREATE INDEX "roster_player_manager_id_idx" ON "roster_player"("manager_id");

-- CreateIndex
CREATE INDEX "lineup_slot_period_id_idx" ON "lineup_slot"("period_id");

-- CreateIndex
CREATE INDEX "lineup_slot_player_id_idx" ON "lineup_slot"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "lineup_slot_manager_id_period_id_player_id_key" ON "lineup_slot"("manager_id", "period_id", "player_id");

-- CreateIndex
CREATE INDEX "period_league_id_idx" ON "period"("league_id");

-- CreateIndex
CREATE UNIQUE INDEX "period_league_id_label_key" ON "period"("league_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "draft_league_id_key" ON "draft"("league_id");

-- CreateIndex
CREATE INDEX "draft_pick_manager_id_idx" ON "draft_pick"("manager_id");

-- CreateIndex
CREATE UNIQUE INDEX "draft_pick_draft_id_pick_no_key" ON "draft_pick"("draft_id", "pick_no");

-- CreateIndex
CREATE UNIQUE INDEX "draft_queue_manager_id_position_key" ON "draft_queue"("manager_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "draft_queue_manager_id_player_id_key" ON "draft_queue"("manager_id", "player_id");

-- CreateIndex
CREATE INDEX "faab_batch_league_id_run_at_idx" ON "faab_batch"("league_id", "run_at");

-- CreateIndex
CREATE INDEX "faab_bid_league_id_status_idx" ON "faab_bid"("league_id", "status");

-- CreateIndex
CREATE INDEX "faab_bid_manager_id_idx" ON "faab_bid"("manager_id");

-- CreateIndex
CREATE INDEX "faab_bid_batch_id_idx" ON "faab_bid"("batch_id");

-- CreateIndex
CREATE INDEX "stat_player_match_dirty_idx" ON "stat_player_match"("dirty");

-- CreateIndex
CREATE UNIQUE INDEX "event_match_balldontlie_event_id_key" ON "event_match"("balldontlie_event_id");

-- CreateIndex
CREATE INDEX "event_match_match_id_idx" ON "event_match"("match_id");

-- CreateIndex
CREATE INDEX "event_match_incident_type_idx" ON "event_match"("incident_type");

-- CreateIndex
CREATE UNIQUE INDEX "shot_match_balldontlie_shot_id_key" ON "shot_match"("balldontlie_shot_id");

-- CreateIndex
CREATE INDEX "shot_match_match_id_idx" ON "shot_match"("match_id");

-- CreateIndex
CREATE INDEX "rating_player_match_dirty_idx" ON "rating_player_match"("dirty");

-- CreateIndex
CREATE INDEX "manual_stat_player_match_dirty_idx" ON "manual_stat_player_match"("dirty");

-- CreateIndex
CREATE INDEX "score_manager_period_period_id_idx" ON "score_manager_period"("period_id");

-- CreateIndex
CREATE INDEX "standing_league_id_scope_idx" ON "standing"("league_id", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "standing_league_id_manager_id_scope_key" ON "standing"("league_id", "manager_id", "scope");

-- CreateIndex
CREATE INDEX "recompute_dirty_scope_processed_at_idx" ON "recompute_dirty"("scope", "processed_at");

-- AddForeignKey
ALTER TABLE "manager" ADD CONSTRAINT "manager_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager" ADD CONSTRAINT "manager_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowlist_email" ADD CONSTRAINT "allowlist_email_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowlist_email" ADD CONSTRAINT "allowlist_email_claimed_by_user_id_fkey" FOREIGN KEY ("claimed_by_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fifa_group" ADD CONSTRAINT "fifa_group_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "fifa_stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fifa_team" ADD CONSTRAINT "fifa_team_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "fifa_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player" ADD CONSTRAINT "player_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "fifa_team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fifa_match" ADD CONSTRAINT "fifa_match_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "fifa_stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fifa_match" ADD CONSTRAINT "fifa_match_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "fifa_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fifa_match" ADD CONSTRAINT "fifa_match_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "fifa_team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fifa_match" ADD CONSTRAINT "fifa_match_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "fifa_team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_player" ADD CONSTRAINT "roster_player_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_player" ADD CONSTRAINT "roster_player_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_player" ADD CONSTRAINT "roster_player_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineup_slot" ADD CONSTRAINT "lineup_slot_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineup_slot" ADD CONSTRAINT "lineup_slot_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "period"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineup_slot" ADD CONSTRAINT "lineup_slot_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period" ADD CONSTRAINT "period_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft" ADD CONSTRAINT "draft_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft" ADD CONSTRAINT "draft_current_manager_id_fkey" FOREIGN KEY ("current_manager_id") REFERENCES "manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_pick" ADD CONSTRAINT "draft_pick_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_pick" ADD CONSTRAINT "draft_pick_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_pick" ADD CONSTRAINT "draft_pick_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_queue" ADD CONSTRAINT "draft_queue_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_queue" ADD CONSTRAINT "draft_queue_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faab_batch" ADD CONSTRAINT "faab_batch_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faab_bid" ADD CONSTRAINT "faab_bid_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faab_bid" ADD CONSTRAINT "faab_bid_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faab_bid" ADD CONSTRAINT "faab_bid_player_add_id_fkey" FOREIGN KEY ("player_add_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faab_bid" ADD CONSTRAINT "faab_bid_player_drop_id_fkey" FOREIGN KEY ("player_drop_id") REFERENCES "player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faab_bid" ADD CONSTRAINT "faab_bid_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "faab_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stat_player_match" ADD CONSTRAINT "stat_player_match_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "fifa_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stat_player_match" ADD CONSTRAINT "stat_player_match_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_match" ADD CONSTRAINT "event_match_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "fifa_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_match" ADD CONSTRAINT "event_match_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_match" ADD CONSTRAINT "event_match_assist_player_id_fkey" FOREIGN KEY ("assist_player_id") REFERENCES "player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_match" ADD CONSTRAINT "event_match_player_in_id_fkey" FOREIGN KEY ("player_in_id") REFERENCES "player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_match" ADD CONSTRAINT "event_match_player_out_id_fkey" FOREIGN KEY ("player_out_id") REFERENCES "player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shot_match" ADD CONSTRAINT "shot_match_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "fifa_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shot_match" ADD CONSTRAINT "shot_match_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stat_team_match" ADD CONSTRAINT "stat_team_match_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "fifa_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stat_team_match" ADD CONSTRAINT "stat_team_match_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "fifa_team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_player_match" ADD CONSTRAINT "rating_player_match_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "fifa_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_player_match" ADD CONSTRAINT "rating_player_match_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_stat_player_match" ADD CONSTRAINT "manual_stat_player_match_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "fifa_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_stat_player_match" ADD CONSTRAINT "manual_stat_player_match_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_stat_player_match" ADD CONSTRAINT "manual_stat_player_match_entered_by_user_id_fkey" FOREIGN KEY ("entered_by_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_player_match" ADD CONSTRAINT "score_player_match_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "fifa_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_player_match" ADD CONSTRAINT "score_player_match_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_manager_period" ADD CONSTRAINT "score_manager_period_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_manager_period" ADD CONSTRAINT "score_manager_period_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "period"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standing" ADD CONSTRAINT "standing_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "league"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standing" ADD CONSTRAINT "standing_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;
