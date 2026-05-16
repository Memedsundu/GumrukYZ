-- Auto-classification state, broker-client registry, and deterministic legal citations.

ALTER TABLE "submissions" ALTER COLUMN "trade_flow" SET DEFAULT 'UNKNOWN';
ALTER TABLE "submissions" ADD COLUMN "broker_client_id" TEXT;
ALTER TABLE "submissions" ADD COLUMN "classification_status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "submissions" ADD COLUMN "suggested_trade_flow" TEXT;
ALTER TABLE "submissions" ADD COLUMN "suggested_trade_flow_confidence" DOUBLE PRECISION;
ALTER TABLE "submissions" ADD COLUMN "classification_validated_at" TIMESTAMP(3);
ALTER TABLE "submissions" ADD COLUMN "classification_validated_by" TEXT;

UPDATE "submissions"
SET "classification_status" = 'VALIDATED',
    "classification_validated_at" = "created_at"
WHERE "trade_flow" IN ('IMPORT', 'EXPORT');

CREATE TABLE "broker_clients" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "tax_id" TEXT,
    "address" TEXT,
    "country" TEXT,
    "source_submission_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broker_clients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "broker_clients_tenant_id_tax_id_key" ON "broker_clients"("tenant_id", "tax_id");
CREATE INDEX "broker_clients_tenant_id_normalized_name_idx" ON "broker_clients"("tenant_id", "normalized_name");

ALTER TABLE "broker_clients"
ADD CONSTRAINT "broker_clients_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "submissions"
ADD CONSTRAINT "submissions_broker_client_id_fkey"
FOREIGN KEY ("broker_client_id") REFERENCES "broker_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "submissions_tenant_id_classification_status_idx" ON "submissions"("tenant_id", "classification_status");
CREATE INDEX "submissions_broker_client_id_idx" ON "submissions"("broker_client_id");

ALTER TABLE "documents" ADD COLUMN "suggested_doc_type" TEXT;
ALTER TABLE "documents" ADD COLUMN "suggested_doc_type_confidence" DOUBLE PRECISION;
ALTER TABLE "documents" ADD COLUMN "classification_reasoning" TEXT;
ALTER TABLE "documents" ADD COLUMN "classification_source_refs_json" JSONB;
ALTER TABLE "documents" ADD COLUMN "classification_validated_at" TIMESTAMP(3);
ALTER TABLE "documents" ADD COLUMN "classification_validated_by" TEXT;
ALTER TABLE "documents" ADD COLUMN "is_ignored" BOOLEAN NOT NULL DEFAULT false;

UPDATE "documents"
SET "suggested_doc_type" = "doc_type",
    "suggested_doc_type_confidence" = 1,
    "classification_validated_at" = "created_at"
WHERE "doc_type" <> 'UNCLASSIFIED';

CREATE TABLE "document_classification_suggestions" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_run_id" TEXT,
    "suggested_doc_type" TEXT NOT NULL,
    "doc_type_confidence" DOUBLE PRECISION NOT NULL,
    "suggested_trade_flow" TEXT,
    "trade_flow_confidence" DOUBLE PRECISION,
    "reasoning" TEXT,
    "source_refs_json" JSONB,
    "extracted_parties_json" JSONB,
    "client_match_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_classification_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_classification_suggestions_submission_id_idx" ON "document_classification_suggestions"("submission_id");
CREATE INDEX "document_classification_suggestions_document_id_idx" ON "document_classification_suggestions"("document_id");
CREATE INDEX "document_classification_suggestions_tenant_id_idx" ON "document_classification_suggestions"("tenant_id");

ALTER TABLE "document_classification_suggestions"
ADD CONSTRAINT "document_classification_suggestions_submission_id_fkey"
FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_classification_suggestions"
ADD CONSTRAINT "document_classification_suggestions_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_classification_suggestions"
ADD CONSTRAINT "document_classification_suggestions_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_classification_suggestions"
ADD CONSTRAINT "document_classification_suggestions_provider_run_id_fkey"
FOREIGN KEY ("provider_run_id") REFERENCES "provider_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "source_documents" ADD COLUMN "snapshot_blob_url" TEXT;
ALTER TABLE "source_documents" ADD COLUMN "snapshot_sha256" TEXT;
ALTER TABLE "source_documents" ADD COLUMN "snapshot_fetched_at" TIMESTAMP(3);
ALTER TABLE "source_documents" ADD COLUMN "verification_status" TEXT NOT NULL DEFAULT 'SEEDED_EXCERPT';

ALTER TABLE "regulation_chunks" ADD COLUMN "article_label" TEXT;
ALTER TABLE "regulation_chunks" ADD COLUMN "source_url" TEXT;
ALTER TABLE "regulation_chunks" ADD COLUMN "verified_at" TIMESTAMP(3);

CREATE TABLE "rule_legal_citations" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "source_document_id" TEXT NOT NULL,
    "regulation_chunk_id" TEXT,
    "article_label" TEXT,
    "excerpt" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_legal_citations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rule_legal_citations_rule_id_article_label_url_key"
ON "rule_legal_citations"("rule_id", "article_label", "url");
CREATE INDEX "rule_legal_citations_rule_id_idx" ON "rule_legal_citations"("rule_id");
CREATE INDEX "rule_legal_citations_source_document_id_idx" ON "rule_legal_citations"("source_document_id");

ALTER TABLE "rule_legal_citations"
ADD CONSTRAINT "rule_legal_citations_rule_id_fkey"
FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rule_legal_citations"
ADD CONSTRAINT "rule_legal_citations_source_document_id_fkey"
FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rule_legal_citations"
ADD CONSTRAINT "rule_legal_citations_regulation_chunk_id_fkey"
FOREIGN KEY ("regulation_chunk_id") REFERENCES "regulation_chunks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "rule_result_citations" (
    "id" TEXT NOT NULL,
    "rule_result_id" TEXT NOT NULL,
    "rule_legal_citation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_result_citations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rule_result_citations_rule_result_id_rule_legal_citation_id_key"
ON "rule_result_citations"("rule_result_id", "rule_legal_citation_id");
CREATE INDEX "rule_result_citations_rule_result_id_idx" ON "rule_result_citations"("rule_result_id");

ALTER TABLE "rule_result_citations"
ADD CONSTRAINT "rule_result_citations_rule_result_id_fkey"
FOREIGN KEY ("rule_result_id") REFERENCES "rule_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rule_result_citations"
ADD CONSTRAINT "rule_result_citations_rule_legal_citation_id_fkey"
FOREIGN KEY ("rule_legal_citation_id") REFERENCES "rule_legal_citations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
