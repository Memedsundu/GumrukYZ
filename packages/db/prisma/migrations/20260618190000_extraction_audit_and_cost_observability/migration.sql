-- Extraction audit trail + provider usage detail.
-- Additive migration: existing document_extractions remain the operational
-- source while field-level rows and canonical reads improve auditability.

ALTER TABLE "provider_runs"
  ADD COLUMN IF NOT EXISTS "submission_id" TEXT,
  ADD COLUMN IF NOT EXISTS "document_id" TEXT,
  ADD COLUMN IF NOT EXISTS "document_version_id" TEXT,
  ADD COLUMN IF NOT EXISTS "page_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "billable_units" DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS "billable_unit_type" TEXT,
  ADD COLUMN IF NOT EXISTS "unit_price_usd" DECIMAL(12,8),
  ADD COLUMN IF NOT EXISTS "usage_metadata_json" JSONB;

CREATE INDEX IF NOT EXISTS "provider_runs_submission_id_idx" ON "provider_runs"("submission_id");
CREATE INDEX IF NOT EXISTS "provider_runs_document_id_idx" ON "provider_runs"("document_id");
CREATE INDEX IF NOT EXISTS "provider_runs_document_version_id_idx" ON "provider_runs"("document_version_id");

ALTER TABLE "provider_runs"
  ADD CONSTRAINT "provider_runs_submission_id_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "submissions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "provider_runs"
  ADD CONSTRAINT "provider_runs_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "provider_runs"
  ADD CONSTRAINT "provider_runs_document_version_id_fkey"
  FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "document_reads" (
  "id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "document_version_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "provider_run_id" TEXT,
  "method" TEXT NOT NULL,
  "raw_text" TEXT,
  "markdown_text" TEXT,
  "tables_json" JSONB,
  "page_count" INTEGER,
  "confidence" DOUBLE PRECISION,
  "content_hash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OK',
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_reads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "extracted_fields" (
  "id" TEXT NOT NULL,
  "extraction_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "document_version_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "provider_run_id" TEXT,
  "field_path" TEXT NOT NULL,
  "value_json" JSONB,
  "normalized_value_text" TEXT,
  "confidence" DOUBLE PRECISION,
  "extraction_method" TEXT,
  "source_quote" TEXT,
  "page_number" INTEGER,
  "verification_status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "extracted_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "extraction_verifications" (
  "id" TEXT NOT NULL,
  "extraction_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "document_version_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "provider_run_id" TEXT,
  "field_path" TEXT NOT NULL,
  "current_value_json" JSONB,
  "suggested_value_json" JSONB,
  "source_quote" TEXT,
  "confidence" DOUBLE PRECISION,
  "severity" TEXT NOT NULL DEFAULT 'REVIEW_NEEDED',
  "reason" TEXT,
  "action" TEXT NOT NULL,
  "prompt_version" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "extraction_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_reads_document_version_id_method_key"
  ON "document_reads"("document_version_id", "method");
CREATE INDEX IF NOT EXISTS "document_reads_document_id_idx" ON "document_reads"("document_id");
CREATE INDEX IF NOT EXISTS "document_reads_tenant_id_idx" ON "document_reads"("tenant_id");
CREATE INDEX IF NOT EXISTS "document_reads_provider_run_id_idx" ON "document_reads"("provider_run_id");

CREATE UNIQUE INDEX IF NOT EXISTS "extracted_fields_extraction_id_field_path_key"
  ON "extracted_fields"("extraction_id", "field_path");
CREATE INDEX IF NOT EXISTS "extracted_fields_document_id_idx" ON "extracted_fields"("document_id");
CREATE INDEX IF NOT EXISTS "extracted_fields_document_version_id_idx" ON "extracted_fields"("document_version_id");
CREATE INDEX IF NOT EXISTS "extracted_fields_tenant_id_idx" ON "extracted_fields"("tenant_id");
CREATE INDEX IF NOT EXISTS "extracted_fields_verification_status_idx" ON "extracted_fields"("verification_status");
CREATE INDEX IF NOT EXISTS "extracted_fields_provider_run_id_idx" ON "extracted_fields"("provider_run_id");

CREATE INDEX IF NOT EXISTS "extraction_verifications_extraction_id_idx" ON "extraction_verifications"("extraction_id");
CREATE INDEX IF NOT EXISTS "extraction_verifications_document_id_idx" ON "extraction_verifications"("document_id");
CREATE INDEX IF NOT EXISTS "extraction_verifications_document_version_id_idx" ON "extraction_verifications"("document_version_id");
CREATE INDEX IF NOT EXISTS "extraction_verifications_tenant_id_idx" ON "extraction_verifications"("tenant_id");
CREATE INDEX IF NOT EXISTS "extraction_verifications_provider_run_id_idx" ON "extraction_verifications"("provider_run_id");

ALTER TABLE "document_reads"
  ADD CONSTRAINT "document_reads_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_reads"
  ADD CONSTRAINT "document_reads_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_reads"
  ADD CONSTRAINT "document_reads_document_version_id_fkey"
  FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_reads"
  ADD CONSTRAINT "document_reads_provider_run_id_fkey"
  FOREIGN KEY ("provider_run_id") REFERENCES "provider_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "extracted_fields"
  ADD CONSTRAINT "extracted_fields_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "extracted_fields"
  ADD CONSTRAINT "extracted_fields_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "extracted_fields"
  ADD CONSTRAINT "extracted_fields_document_version_id_fkey"
  FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "extracted_fields"
  ADD CONSTRAINT "extracted_fields_extraction_id_fkey"
  FOREIGN KEY ("extraction_id") REFERENCES "document_extractions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extracted_fields"
  ADD CONSTRAINT "extracted_fields_provider_run_id_fkey"
  FOREIGN KEY ("provider_run_id") REFERENCES "provider_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "extraction_verifications"
  ADD CONSTRAINT "extraction_verifications_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "extraction_verifications"
  ADD CONSTRAINT "extraction_verifications_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "extraction_verifications"
  ADD CONSTRAINT "extraction_verifications_document_version_id_fkey"
  FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "extraction_verifications"
  ADD CONSTRAINT "extraction_verifications_extraction_id_fkey"
  FOREIGN KEY ("extraction_id") REFERENCES "document_extractions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extraction_verifications"
  ADD CONSTRAINT "extraction_verifications_provider_run_id_fkey"
  FOREIGN KEY ("provider_run_id") REFERENCES "provider_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill canonical reads from existing extraction text rows.
INSERT INTO "document_reads" (
  "id",
  "document_id",
  "document_version_id",
  "tenant_id",
  "provider_run_id",
  "method",
  "raw_text",
  "confidence",
  "content_hash",
  "status",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  dv."document_id",
  de."document_version_id",
  de."tenant_id",
  de."provider_run_id",
  COALESCE(de."extraction_method", 'TEXT_PDF'),
  de."raw_text",
  de."confidence",
  md5(COALESCE(de."raw_text", '')),
  'OK',
  de."created_at",
  CURRENT_TIMESTAMP
FROM "document_extractions" de
JOIN "document_versions" dv ON dv."id" = de."document_version_id"
WHERE de."raw_text" IS NOT NULL
  AND length(trim(de."raw_text")) > 0
ON CONFLICT ("document_version_id", "method") DO NOTHING;

-- Backfill field records from existing structured JSON. This captures only
-- top-level fields; nested/array fields are written by application code on the
-- next processing run.
INSERT INTO "extracted_fields" (
  "id",
  "extraction_id",
  "document_id",
  "document_version_id",
  "tenant_id",
  "provider_run_id",
  "field_path",
  "value_json",
  "normalized_value_text",
  "confidence",
  "extraction_method",
  "verification_status",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  de."id",
  dv."document_id",
  de."document_version_id",
  de."tenant_id",
  de."provider_run_id",
  fields."key",
  fields."value",
  left(fields."value" #>> '{}', 1000),
  de."confidence",
  de."extraction_method",
  'UNVERIFIED',
  de."created_at",
  CURRENT_TIMESTAMP
FROM "document_extractions" de
JOIN "document_versions" dv ON dv."id" = de."document_version_id"
CROSS JOIN LATERAL jsonb_each(
  CASE
    WHEN de."structured_json" IS NOT NULL
      AND jsonb_typeof(de."structured_json"::jsonb) = 'object'
    THEN de."structured_json"::jsonb
    ELSE '{}'::jsonb
  END
) AS fields("key", "value")
WHERE de."structured_json" IS NOT NULL
  AND jsonb_typeof(de."structured_json"::jsonb) = 'object'
  AND fields."key" NOT LIKE '\_%' ESCAPE '\'
ON CONFLICT ("extraction_id", "field_path") DO NOTHING;

-- Backfill Azure page billing where page count can be approximately recovered
-- from the existing cost setting. New rows store actual page_count directly.
UPDATE "provider_runs"
SET
  "billable_unit_type" = COALESCE("billable_unit_type", 'page'),
  "billable_units" = COALESCE(
    "billable_units",
    CASE
      WHEN "estimated_cost_usd" IS NOT NULL AND "estimated_cost_usd" > 0
      THEN GREATEST(1, ROUND(("estimated_cost_usd" / 10.0) * 1000.0))::numeric(12,3)
      ELSE NULL
    END
  ),
  "page_count" = COALESCE(
    "page_count",
    CASE
      WHEN "estimated_cost_usd" IS NOT NULL AND "estimated_cost_usd" > 0
      THEN GREATEST(1, ROUND(("estimated_cost_usd" / 10.0) * 1000.0))::integer
      ELSE NULL
    END
  ),
  "unit_price_usd" = COALESCE("unit_price_usd", 0.01000000)
WHERE "provider" = 'azure_doc_intel';

-- Backfill case/document links where existing relational tables already point
-- from a provider run to a submission or document.
UPDATE "provider_runs" pr
SET
  "submission_id" = COALESCE(pr."submission_id", d."submission_id"),
  "document_id" = COALESCE(pr."document_id", d."id"),
  "document_version_id" = COALESCE(pr."document_version_id", de."document_version_id")
FROM "document_extractions" de
JOIN "document_versions" dv ON dv."id" = de."document_version_id"
JOIN "documents" d ON d."id" = dv."document_id"
WHERE pr."id" = de."provider_run_id";

UPDATE "provider_runs" pr
SET
  "submission_id" = COALESCE(pr."submission_id", dcs."submission_id"),
  "document_id" = COALESCE(pr."document_id", dcs."document_id")
FROM "document_classification_suggestions" dcs
WHERE pr."id" = dcs."provider_run_id";

UPDATE "provider_runs" pr
SET "submission_id" = COALESCE(pr."submission_id", rr."submission_id")
FROM "risk_reports" rr
WHERE pr."id" = rr."provider_run_id";

UPDATE "provider_runs" pr
SET "submission_id" = COALESCE(pr."submission_id", er."submission_id")
FROM "expert_reviews" er
WHERE pr."id" = er."provider_run_id";

UPDATE "provider_runs" pr
SET "submission_id" = COALESCE(pr."submission_id", arv."submission_id")
FROM "ai_rule_validations" arv
WHERE pr."id" = arv."provider_run_id";
