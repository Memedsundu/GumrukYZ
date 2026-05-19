-- Pilot consent + per-tenant user identity (Clerk Organizations)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pilot_consent_at" TIMESTAMP(3);

DROP INDEX IF EXISTS "users_clerk_user_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "users_clerk_user_id_tenant_id_key"
  ON "users"("clerk_user_id", "tenant_id");
