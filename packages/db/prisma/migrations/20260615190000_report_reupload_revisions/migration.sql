ALTER TABLE "submissions"
    ADD COLUMN "current_report_job_id" TEXT,
    ADD COLUMN "report_stale_at" TIMESTAMP(3),
    ADD COLUMN "report_stale_reason" TEXT;

ALTER TABLE "declaration_snapshots"
    ADD COLUMN "processing_job_id" TEXT;

ALTER TABLE "rule_results"
    ADD COLUMN "processing_job_id" TEXT;

ALTER TABLE "ai_rule_validations"
    ADD COLUMN "processing_job_id" TEXT;

ALTER TABLE "risk_reports"
    ADD COLUMN "processing_job_id" TEXT;

ALTER TABLE "expert_reviews"
    ADD COLUMN "processing_job_id" TEXT;

ALTER TABLE "finding_checklist_states"
    ADD COLUMN "processing_job_id" TEXT,
    ADD COLUMN "finding_fingerprint" TEXT,
    ADD COLUMN "source_version_hash" TEXT;

CREATE INDEX "submissions_current_report_job_id_idx"
    ON "submissions"("current_report_job_id");

CREATE INDEX "declaration_snapshots_processing_job_id_idx"
    ON "declaration_snapshots"("processing_job_id");

CREATE INDEX "rule_results_processing_job_id_idx"
    ON "rule_results"("processing_job_id");

CREATE INDEX "ai_rule_validations_processing_job_id_idx"
    ON "ai_rule_validations"("processing_job_id");

CREATE INDEX "risk_reports_processing_job_id_idx"
    ON "risk_reports"("processing_job_id");

CREATE INDEX "expert_reviews_processing_job_id_idx"
    ON "expert_reviews"("processing_job_id");

CREATE INDEX "finding_checklist_states_processing_job_id_idx"
    ON "finding_checklist_states"("processing_job_id");

CREATE INDEX "finding_checklist_states_fingerprint_carryover_idx"
    ON "finding_checklist_states"("tenant_id", "submission_id", "finding_kind", "finding_fingerprint", "source_version_hash");

ALTER TABLE "submissions"
    ADD CONSTRAINT "submissions_current_report_job_id_fkey"
    FOREIGN KEY ("current_report_job_id") REFERENCES "processing_jobs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "declaration_snapshots"
    ADD CONSTRAINT "declaration_snapshots_processing_job_id_fkey"
    FOREIGN KEY ("processing_job_id") REFERENCES "processing_jobs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rule_results"
    ADD CONSTRAINT "rule_results_processing_job_id_fkey"
    FOREIGN KEY ("processing_job_id") REFERENCES "processing_jobs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_rule_validations"
    ADD CONSTRAINT "ai_rule_validations_processing_job_id_fkey"
    FOREIGN KEY ("processing_job_id") REFERENCES "processing_jobs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "risk_reports"
    ADD CONSTRAINT "risk_reports_processing_job_id_fkey"
    FOREIGN KEY ("processing_job_id") REFERENCES "processing_jobs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expert_reviews"
    ADD CONSTRAINT "expert_reviews_processing_job_id_fkey"
    FOREIGN KEY ("processing_job_id") REFERENCES "processing_jobs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finding_checklist_states"
    ADD CONSTRAINT "finding_checklist_states_processing_job_id_fkey"
    FOREIGN KEY ("processing_job_id") REFERENCES "processing_jobs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
