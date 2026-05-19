UPDATE "tenants"
SET "data_classification_allowed" = "data_classification_allowed" || ARRAY['REAL']::text[]
WHERE NOT ('REAL' = ANY("data_classification_allowed"))
  AND (
    "plan" = 'internal'
    OR "clerk_org_id" = 'internal_dev'
    OR lower("name") LIKE '%demo%'
    OR lower("name") LIKE '%internal%'
  );
