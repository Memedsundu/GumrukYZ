-- Ensure only one active processing job can own a submission at a time.
WITH ranked_active_jobs AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "submission_id"
      ORDER BY "started_at" DESC NULLS LAST, "updated_at" DESC, "id" DESC
    ) AS "rank"
  FROM "processing_jobs"
  WHERE "status" IN (
    'PENDING',
    'CLASSIFYING',
    'EXTRACTING',
    'NORMALIZING',
    'RUNNING_RULES',
    'AI_RULE_VALIDATING',
    'EXPERT_REVIEWING',
    'GENERATING_REPORT'
  )
)
UPDATE "processing_jobs" AS "job"
SET
  "status" = 'FAILED',
  "current_step" = 'FAILED',
  "error_message" = COALESCE("job"."error_message", 'Superseded by active processing job lock migration.'),
  "completed_at" = COALESCE("job"."completed_at", NOW())
FROM "ranked_active_jobs"
WHERE "job"."id" = "ranked_active_jobs"."id"
  AND "ranked_active_jobs"."rank" > 1;

CREATE UNIQUE INDEX "processing_jobs_one_active_per_submission"
ON "processing_jobs"("submission_id")
WHERE "status" IN (
  'PENDING',
  'CLASSIFYING',
  'EXTRACTING',
  'NORMALIZING',
  'RUNNING_RULES',
  'AI_RULE_VALIDATING',
  'EXPERT_REVIEWING',
  'GENERATING_REPORT'
);
