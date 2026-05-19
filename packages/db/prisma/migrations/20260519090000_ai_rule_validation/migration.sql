-- Store advisory AI validation for deterministic rule results.
CREATE TABLE "ai_rule_validations" (
    "id" TEXT NOT NULL,
    "rule_result_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_run_id" TEXT,
    "status" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "evidence_refs_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_rule_validations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_rule_validations_rule_result_id_idx" ON "ai_rule_validations"("rule_result_id");
CREATE INDEX "ai_rule_validations_submission_id_idx" ON "ai_rule_validations"("submission_id");
CREATE INDEX "ai_rule_validations_tenant_id_idx" ON "ai_rule_validations"("tenant_id");
CREATE INDEX "ai_rule_validations_provider_run_id_idx" ON "ai_rule_validations"("provider_run_id");

ALTER TABLE "ai_rule_validations"
  ADD CONSTRAINT "ai_rule_validations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_rule_validations"
  ADD CONSTRAINT "ai_rule_validations_submission_id_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "submissions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_rule_validations"
  ADD CONSTRAINT "ai_rule_validations_rule_result_id_fkey"
  FOREIGN KEY ("rule_result_id") REFERENCES "rule_results"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_rule_validations"
  ADD CONSTRAINT "ai_rule_validations_provider_run_id_fkey"
  FOREIGN KEY ("provider_run_id") REFERENCES "provider_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
