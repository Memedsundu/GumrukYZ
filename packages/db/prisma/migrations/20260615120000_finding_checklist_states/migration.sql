CREATE TABLE "finding_checklist_states" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "finding_kind" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3),
    "completed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finding_checklist_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finding_checklist_states_tenant_id_submission_id_finding_kind_finding_id_key"
    ON "finding_checklist_states"("tenant_id", "submission_id", "finding_kind", "finding_id");

CREATE INDEX "finding_checklist_states_tenant_id_idx"
    ON "finding_checklist_states"("tenant_id");

CREATE INDEX "finding_checklist_states_submission_id_idx"
    ON "finding_checklist_states"("submission_id");

CREATE INDEX "finding_checklist_states_completed_by_id_idx"
    ON "finding_checklist_states"("completed_by_id");

ALTER TABLE "finding_checklist_states"
    ADD CONSTRAINT "finding_checklist_states_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finding_checklist_states"
    ADD CONSTRAINT "finding_checklist_states_submission_id_fkey"
    FOREIGN KEY ("submission_id") REFERENCES "submissions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "finding_checklist_states"
    ADD CONSTRAINT "finding_checklist_states_completed_by_id_fkey"
    FOREIGN KEY ("completed_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
