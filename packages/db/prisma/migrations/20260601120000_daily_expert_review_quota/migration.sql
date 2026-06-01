ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "expert_review_used_on" DATE;

UPDATE "tenants"
SET
  "expert_review_used" = 0,
  "expert_review_used_on" = CURRENT_DATE
WHERE "expert_review_used_on" IS NULL;
