-- AI observability + expert review robustness (additive, no data loss):
--  - risk_reports.provider_run_id      → trace the AI summary's model/cost
--  - risk_reports.finding_explanations_json → persisted per-finding AI explanations
--  - provider_runs.prompt_version      → tie findings to the prompt revision
--  - expert_reviews.superseded_at      → stale-mark instead of deleting on reprocess
--  - expert_review_findings.gtip_candidates_json → un-overload evidence_refs_json
--  - partial unique index              → at most one RUNNING expert review per submission

ALTER TABLE "risk_reports"
  ADD COLUMN IF NOT EXISTS "provider_run_id" TEXT,
  ADD COLUMN IF NOT EXISTS "finding_explanations_json" JSONB;

ALTER TABLE "risk_reports"
  ADD CONSTRAINT "risk_reports_provider_run_id_fkey"
  FOREIGN KEY ("provider_run_id") REFERENCES "provider_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "risk_reports_provider_run_id_idx"
  ON "risk_reports"("provider_run_id");

ALTER TABLE "provider_runs"
  ADD COLUMN IF NOT EXISTS "prompt_version" TEXT;

ALTER TABLE "expert_reviews"
  ADD COLUMN IF NOT EXISTS "superseded_at" TIMESTAMP(3);

ALTER TABLE "expert_review_findings"
  ADD COLUMN IF NOT EXISTS "gtip_candidates_json" JSONB;

-- Makes the P2002 → ExpertReviewAlreadyRunningError handler in
-- expert-review-quota.ts a real concurrency guard.
CREATE UNIQUE INDEX IF NOT EXISTS "expert_reviews_one_running_per_submission"
  ON "expert_reviews"("submission_id")
  WHERE "status" = 'RUNNING';
