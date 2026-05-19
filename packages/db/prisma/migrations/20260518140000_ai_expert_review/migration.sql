-- First-class AI expert review storage with deterministic regulation chunk citations.

CREATE TABLE "expert_reviews" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_run_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "legal_context_status" TEXT NOT NULL DEFAULT 'READY',
    "model" TEXT,
    "overall_risk" TEXT,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "expert_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expert_review_findings" (
    "id" TEXT NOT NULL,
    "expert_review_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "evidence_refs_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expert_review_findings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expert_review_finding_citations" (
    "id" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "regulation_chunk_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expert_review_finding_citations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expert_reviews_submission_id_idx" ON "expert_reviews"("submission_id");
CREATE INDEX "expert_reviews_tenant_id_idx" ON "expert_reviews"("tenant_id");
CREATE INDEX "expert_reviews_provider_run_id_idx" ON "expert_reviews"("provider_run_id");

CREATE INDEX "expert_review_findings_expert_review_id_idx" ON "expert_review_findings"("expert_review_id");
CREATE INDEX "expert_review_findings_tenant_id_idx" ON "expert_review_findings"("tenant_id");
CREATE INDEX "expert_review_findings_area_idx" ON "expert_review_findings"("area");

CREATE UNIQUE INDEX "expert_review_finding_citations_finding_id_regulation_chunk_id_key"
ON "expert_review_finding_citations"("finding_id", "regulation_chunk_id");
CREATE INDEX "expert_review_finding_citations_finding_id_idx" ON "expert_review_finding_citations"("finding_id");
CREATE INDEX "expert_review_finding_citations_regulation_chunk_id_idx" ON "expert_review_finding_citations"("regulation_chunk_id");

ALTER TABLE "expert_reviews"
ADD CONSTRAINT "expert_reviews_submission_id_fkey"
FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expert_reviews"
ADD CONSTRAINT "expert_reviews_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expert_reviews"
ADD CONSTRAINT "expert_reviews_provider_run_id_fkey"
FOREIGN KEY ("provider_run_id") REFERENCES "provider_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expert_review_findings"
ADD CONSTRAINT "expert_review_findings_expert_review_id_fkey"
FOREIGN KEY ("expert_review_id") REFERENCES "expert_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expert_review_findings"
ADD CONSTRAINT "expert_review_findings_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expert_review_finding_citations"
ADD CONSTRAINT "expert_review_finding_citations_finding_id_fkey"
FOREIGN KEY ("finding_id") REFERENCES "expert_review_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expert_review_finding_citations"
ADD CONSTRAINT "expert_review_finding_citations_regulation_chunk_id_fkey"
FOREIGN KEY ("regulation_chunk_id") REFERENCES "regulation_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
