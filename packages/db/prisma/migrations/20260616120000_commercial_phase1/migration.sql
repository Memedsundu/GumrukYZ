-- Commercial Phase 1: subscriptions, lazy usage counters, sales leads, trial
-- anti-abuse ledger. Plus an idempotent backfill that renames the legacy
-- `starter` plan to `plus` and seeds one subscription row per existing tenant.

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE "tenant_subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "plan_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trialing',
    "billing_interval" TEXT NOT NULL DEFAULT 'none',
    "trial_started_at" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "trial_analysis_cap" INTEGER,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "price_snapshot_json" JSONB,
    "limits_override_json" JSONB,
    "custom_notes" TEXT,
    "grace_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_usage_counters" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "reserved_count" INTEGER NOT NULL DEFAULT 0,
    "limit_snapshot" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_usage_counters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_usage_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "processing_job_id" TEXT,
    "expert_review_id" TEXT,
    "submission_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_leads" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_domain" TEXT NOT NULL,
    "normalized_org" TEXT,
    "requested_plan" TEXT,
    "clerk_user_id" TEXT,
    "tenant_id" TEXT,
    "message" TEXT,
    "metadata_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_leads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trial_claims" (
    "id" TEXT NOT NULL,
    "claim_key" TEXT NOT NULL,
    "email_domain" TEXT NOT NULL,
    "owner_email" TEXT,
    "normalized_org" TEXT,
    "tenant_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_claims_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "tenant_subscriptions_tenant_id_key" ON "tenant_subscriptions"("tenant_id");
CREATE INDEX "tenant_subscriptions_status_idx" ON "tenant_subscriptions"("status");
CREATE INDEX "tenant_subscriptions_trial_ends_at_idx" ON "tenant_subscriptions"("trial_ends_at");

CREATE UNIQUE INDEX "tenant_usage_counters_tenant_id_metric_period_start_key"
ON "tenant_usage_counters"("tenant_id", "metric", "period_start");
CREATE INDEX "tenant_usage_counters_tenant_id_metric_idx" ON "tenant_usage_counters"("tenant_id", "metric");

CREATE INDEX "tenant_usage_events_tenant_id_metric_period_start_idx"
ON "tenant_usage_events"("tenant_id", "metric", "period_start");
CREATE INDEX "tenant_usage_events_processing_job_id_idx" ON "tenant_usage_events"("processing_job_id");
CREATE INDEX "tenant_usage_events_expert_review_id_idx" ON "tenant_usage_events"("expert_review_id");

CREATE INDEX "sales_leads_email_domain_idx" ON "sales_leads"("email_domain");
CREATE INDEX "sales_leads_status_idx" ON "sales_leads"("status");

CREATE UNIQUE INDEX "trial_claims_claim_key_key" ON "trial_claims"("claim_key");
CREATE INDEX "trial_claims_email_domain_idx" ON "trial_claims"("email_domain");

-- ── Foreign keys ────────────────────────────────────────────────────────────

ALTER TABLE "tenant_subscriptions"
ADD CONSTRAINT "tenant_subscriptions_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_usage_counters"
ADD CONSTRAINT "tenant_usage_counters_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_usage_events"
ADD CONSTRAINT "tenant_usage_events_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales_leads"
ADD CONSTRAINT "sales_leads_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Backfill (idempotent) ───────────────────────────────────────────────────

-- Rename legacy entry-tier code.
UPDATE "tenants" SET "plan" = 'plus' WHERE "plan" = 'starter';

-- One subscription per existing tenant. internal → active, pilot → grace(+30d),
-- everything else → active. Skips tenants that already have a subscription so
-- re-running never overwrites manually-set grace/extended access.
INSERT INTO "tenant_subscriptions" (
    "id", "tenant_id", "plan_code", "status", "billing_interval", "grace_until",
    "created_at", "updated_at"
)
SELECT
    gen_random_uuid()::text,
    t."id",
    t."plan",
    CASE WHEN t."plan" = 'pilot' THEN 'grace' ELSE 'active' END,
    'none',
    CASE WHEN t."plan" = 'pilot' THEN (CURRENT_TIMESTAMP + INTERVAL '30 days') ELSE NULL END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "tenants" t
WHERE NOT EXISTS (
    SELECT 1 FROM "tenant_subscriptions" s WHERE s."tenant_id" = t."id"
);
