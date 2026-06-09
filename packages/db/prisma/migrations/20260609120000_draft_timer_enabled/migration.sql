-- Prompt 29: runtime timer toggle. Default TRUE preserves the verified mock-draft behavior.
ALTER TABLE "draft" ADD COLUMN "timer_enabled" BOOLEAN NOT NULL DEFAULT TRUE;
