ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "expert_review_limit" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "expert_review_used" INTEGER NOT NULL DEFAULT 0;

UPDATE "tenants"
SET
  "expert_review_limit" = COALESCE("expert_review_limit", 20),
  "expert_review_used" = GREATEST(COALESCE("expert_review_used", 0), 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_expert_review_quota_nonnegative'
  ) THEN
    ALTER TABLE "tenants"
      ADD CONSTRAINT "tenants_expert_review_quota_nonnegative"
      CHECK ("expert_review_limit" >= 0 AND "expert_review_used" >= 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "expert_reviews_one_running_per_submission"
  ON "expert_reviews" ("submission_id")
  WHERE "status" = 'RUNNING';
