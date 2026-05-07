-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'internal',
    "data_classification_allowed" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "trade_flow" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "data_classification" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_required_guess" BOOLEAN NOT NULL DEFAULT false,
    "latest_version_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "file_url" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size_bytes" INTEGER,
    "checksum_sha256" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "uploaded_by" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_extractions" (
    "id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "extraction_status" TEXT NOT NULL DEFAULT 'PENDING',
    "extraction_method" TEXT,
    "raw_text" TEXT,
    "structured_json" JSONB,
    "confidence" DOUBLE PRECISION,
    "provider_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaration_snapshots" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "source_document_version_id" TEXT NOT NULL,
    "declaration_number" TEXT,
    "declaration_date" TIMESTAMP(3),
    "regime_code" TEXT,
    "incoterm" TEXT,
    "total_value" DECIMAL(15,2),
    "currency" TEXT,
    "total_net_weight" DECIMAL(12,3),
    "total_gross_weight" DECIMAL(12,3),
    "package_count" INTEGER,
    "raw_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "declaration_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaration_items" (
    "id" TEXT NOT NULL,
    "declaration_snapshot_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "gtip_code" TEXT,
    "goods_description" TEXT,
    "quantity" DECIMAL(15,4),
    "unit" TEXT,
    "net_weight" DECIMAL(12,3),
    "gross_weight" DECIMAL(12,3),
    "value" DECIMAL(15,2),
    "currency" TEXT,

    CONSTRAINT "declaration_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'TR',
    "effective_date" TIMESTAMP(3),
    "last_verified_at" TIMESTAMP(3),
    "raw_excerpt" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_rules" (
    "id" TEXT NOT NULL,
    "rule_code_draft" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "applies_to_doc_types" TEXT[],
    "field_checks" TEXT[],
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source_document_id" TEXT,
    "extracted_rationale" TEXT,
    "ai_confidence" DOUBLE PRECISION,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "tenant_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rules" (
    "id" TEXT NOT NULL,
    "rule_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "applies_to_doc_types" TEXT[],
    "field_checks" TEXT[],
    "severity" TEXT NOT NULL,
    "explanation_template" TEXT NOT NULL,
    "source_document_id" TEXT,
    "effective_from" TIMESTAMP(3),
    "fixture_pass_ref" TEXT,
    "fixture_fail_ref" TEXT,
    "lifecycle_status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_results" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "rule_code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source_refs_json" JSONB,
    "rule_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_reports" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "total_errors" INTEGER NOT NULL DEFAULT 0,
    "total_warnings" INTEGER NOT NULL DEFAULT 0,
    "total_review_needed" INTEGER NOT NULL DEFAULT 0,
    "summary_text" TEXT,
    "snapshot_json" JSONB,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "override_actions" (
    "id" TEXT NOT NULL,
    "rule_result_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "overridden_by" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "original_result" TEXT NOT NULL,
    "new_result" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "override_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_runs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "operation" TEXT NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "estimated_cost_usd" DECIMAL(10,6),
    "duration_ms" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_jobs" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "trigger_job_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "current_step" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_clerk_org_id_key" ON "tenants"("clerk_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_user_id_key" ON "users"("clerk_user_id");

-- CreateIndex
CREATE INDEX "submissions_tenant_id_idx" ON "submissions"("tenant_id");

-- CreateIndex
CREATE INDEX "submissions_tenant_id_status_idx" ON "submissions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "documents_submission_id_idx" ON "documents"("submission_id");

-- CreateIndex
CREATE INDEX "documents_tenant_id_idx" ON "documents"("tenant_id");

-- CreateIndex
CREATE INDEX "document_versions_document_id_idx" ON "document_versions"("document_id");

-- CreateIndex
CREATE INDEX "document_versions_tenant_id_idx" ON "document_versions"("tenant_id");

-- CreateIndex
CREATE INDEX "document_extractions_document_version_id_idx" ON "document_extractions"("document_version_id");

-- CreateIndex
CREATE INDEX "document_extractions_tenant_id_idx" ON "document_extractions"("tenant_id");

-- CreateIndex
CREATE INDEX "declaration_snapshots_submission_id_idx" ON "declaration_snapshots"("submission_id");

-- CreateIndex
CREATE INDEX "declaration_snapshots_tenant_id_idx" ON "declaration_snapshots"("tenant_id");

-- CreateIndex
CREATE INDEX "declaration_items_declaration_snapshot_id_idx" ON "declaration_items"("declaration_snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "rules_rule_code_key" ON "rules"("rule_code");

-- CreateIndex
CREATE INDEX "rules_lifecycle_status_idx" ON "rules"("lifecycle_status");

-- CreateIndex
CREATE INDEX "rule_results_submission_id_idx" ON "rule_results"("submission_id");

-- CreateIndex
CREATE INDEX "rule_results_tenant_id_idx" ON "rule_results"("tenant_id");

-- CreateIndex
CREATE INDEX "risk_reports_submission_id_idx" ON "risk_reports"("submission_id");

-- CreateIndex
CREATE INDEX "risk_reports_tenant_id_idx" ON "risk_reports"("tenant_id");

-- CreateIndex
CREATE INDEX "override_actions_tenant_id_idx" ON "override_actions"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "provider_runs_tenant_id_idx" ON "provider_runs"("tenant_id");

-- CreateIndex
CREATE INDEX "provider_runs_provider_operation_idx" ON "provider_runs"("provider", "operation");

-- CreateIndex
CREATE INDEX "processing_jobs_submission_id_idx" ON "processing_jobs"("submission_id");

-- CreateIndex
CREATE INDEX "processing_jobs_tenant_id_status_idx" ON "processing_jobs"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_latest_version_id_fkey" FOREIGN KEY ("latest_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_provider_run_id_fkey" FOREIGN KEY ("provider_run_id") REFERENCES "provider_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_snapshots" ADD CONSTRAINT "declaration_snapshots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_snapshots" ADD CONSTRAINT "declaration_snapshots_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_snapshots" ADD CONSTRAINT "declaration_snapshots_source_document_version_id_fkey" FOREIGN KEY ("source_document_version_id") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_items" ADD CONSTRAINT "declaration_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_items" ADD CONSTRAINT "declaration_items_declaration_snapshot_id_fkey" FOREIGN KEY ("declaration_snapshot_id") REFERENCES "declaration_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_rules" ADD CONSTRAINT "candidate_rules_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_rules" ADD CONSTRAINT "candidate_rules_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_rules" ADD CONSTRAINT "candidate_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_results" ADD CONSTRAINT "rule_results_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_results" ADD CONSTRAINT "rule_results_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_results" ADD CONSTRAINT "rule_results_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_reports" ADD CONSTRAINT "risk_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_reports" ADD CONSTRAINT "risk_reports_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "override_actions" ADD CONSTRAINT "override_actions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "override_actions" ADD CONSTRAINT "override_actions_rule_result_id_fkey" FOREIGN KEY ("rule_result_id") REFERENCES "rule_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "override_actions" ADD CONSTRAINT "override_actions_overridden_by_fkey" FOREIGN KEY ("overridden_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_runs" ADD CONSTRAINT "provider_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
