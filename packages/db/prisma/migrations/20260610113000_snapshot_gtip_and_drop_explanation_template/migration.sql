-- Wire the previously dead DeclarationSnapshotData.gtipCode field: persist the
-- declaration-level GTİP read during normalization so GTIP-001 can consume it.
ALTER TABLE "declaration_snapshots"
  ADD COLUMN IF NOT EXISTS "gtip_code" TEXT;

-- Drop the write-only rules.explanation_template column. Nothing reads it;
-- rule descriptions live in rules.description (seeded from RULE_SEED_METADATA).
ALTER TABLE "rules"
  DROP COLUMN IF EXISTS "explanation_template";
