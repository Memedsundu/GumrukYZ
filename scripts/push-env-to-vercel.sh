#!/usr/bin/env bash
# Push environment variables to Vercel (non-interactive).
# Values are read from apps/web/.env.local — never committed to git.
#
# Usage: bash scripts/push-env-to-vercel.sh
set -euo pipefail

ENV_FILE="apps/web/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found. Create it from apps/web/.env.example first."
  exit 1
fi

PREVIEW_BRANCH="${VERCEL_PREVIEW_GIT_BRANCH:-}"

add_var() {
  local KEY=$1 VAL=$2
  if [[ -z "$VAL" ]]; then
    echo "Skipping $KEY (empty)"
    return
  fi

  for E in production development; do
    vercel env add "$KEY" "$E" --value "$VAL" --yes --force </dev/null 2>&1 \
      | grep -E "(Saved|Override|Error|Added)" || true
  done

  vercel env add "$KEY" preview "$PREVIEW_BRANCH" --value "$VAL" --yes --force </dev/null 2>&1 \
    | grep -E "(Saved|Override|Error|Added)" || true
}

echo "Reading $ENV_FILE…"

# Source the .env.local values
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "Pushing to Vercel production + preview + development…"
if [[ -n "$PREVIEW_BRANCH" ]]; then
  echo "Preview variables will target branch: $PREVIEW_BRANCH"
else
  echo "Preview variables will target all Preview branches."
fi

add_var DATABASE_URL                         "${DATABASE_URL:-}"
add_var DATABASE_URL_UNPOOLED                "${DATABASE_URL_UNPOOLED:-}"
add_var OPENAI_API_KEY                       "${OPENAI_API_KEY:-}"
add_var OPENAI_DOCUMENT_READER_ENABLED       "${OPENAI_DOCUMENT_READER_ENABLED:-true}"
add_var OPENAI_DOCUMENT_READER_MODE          "${OPENAI_DOCUMENT_READER_MODE:-fallback}"
add_var OPENAI_DOCUMENT_READER_MODEL         "${OPENAI_DOCUMENT_READER_MODEL:-gpt-5.4-mini}"
add_var OPENAI_DOCUMENT_READER_MIN_CONFIDENCE "${OPENAI_DOCUMENT_READER_MIN_CONFIDENCE:-0.65}"
add_var OPENAI_DOCUMENT_READER_TIMEOUT_MS    "${OPENAI_DOCUMENT_READER_TIMEOUT_MS:-90000}"
add_var OPENAI_DOCUMENT_READER_MAX_PAGES     "${OPENAI_DOCUMENT_READER_MAX_PAGES:-20}"
add_var OPENAI_EXPERT_REVIEW_ENABLED         "${OPENAI_EXPERT_REVIEW_ENABLED:-true}"
add_var OPENAI_EXPERT_REVIEW_MODEL           "${OPENAI_EXPERT_REVIEW_MODEL:-gpt-5.4}"
add_var OPENAI_EXPERT_REVIEW_REASONING_EFFORT "${OPENAI_EXPERT_REVIEW_REASONING_EFFORT:-medium}"
add_var OPENAI_EXPERT_REVIEW_TIMEOUT_MS      "${OPENAI_EXPERT_REVIEW_TIMEOUT_MS:-120000}"
add_var OPENAI_EXPERT_REVIEW_MAX_FINDINGS    "${OPENAI_EXPERT_REVIEW_MAX_FINDINGS:-8}"
add_var OPENAI_RULE_VALIDATION_ENABLED       "${OPENAI_RULE_VALIDATION_ENABLED:-true}"
add_var OPENAI_RULE_VALIDATION_MODEL         "${OPENAI_RULE_VALIDATION_MODEL:-gpt-5.4-mini}"
add_var OPENAI_RULE_VALIDATION_TIMEOUT_MS    "${OPENAI_RULE_VALIDATION_TIMEOUT_MS:-60000}"
add_var OPENAI_RULE_VALIDATION_MAX_FINDINGS  "${OPENAI_RULE_VALIDATION_MAX_FINDINGS:-10}"
add_var NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY    "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}"
add_var CLERK_SECRET_KEY                     "${CLERK_SECRET_KEY:-}"
add_var BLOB_READ_WRITE_TOKEN                "${BLOB_READ_WRITE_TOKEN:-}"
add_var NEXT_PUBLIC_CLERK_SIGN_IN_URL        "${NEXT_PUBLIC_CLERK_SIGN_IN_URL:-/sign-in}"
add_var NEXT_PUBLIC_CLERK_SIGN_UP_URL        "${NEXT_PUBLIC_CLERK_SIGN_UP_URL:-/sign-up}"
add_var NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL  "${NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL:-/dashboard}"
add_var NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL  "${NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL:-/dashboard}"
add_var INTERNAL_TENANT_CLERK_ORG_ID         "${INTERNAL_TENANT_CLERK_ORG_ID:-internal_dev}"
add_var DOCUMENT_READER_MODE                 "${DOCUMENT_READER_MODE:-managed}"
add_var AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT "${AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT:-}"
add_var AZURE_DOCUMENT_INTELLIGENCE_KEY      "${AZURE_DOCUMENT_INTELLIGENCE_KEY:-}"
add_var AZURE_DOCUMENT_INTELLIGENCE_API_VERSION "${AZURE_DOCUMENT_INTELLIGENCE_API_VERSION:-2024-11-30}"
add_var AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID "${AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID:-prebuilt-layout}"
add_var AZURE_DOCUMENT_INTELLIGENCE_FEATURES "${AZURE_DOCUMENT_INTELLIGENCE_FEATURES:-keyValuePairs}"
add_var AZURE_DOCUMENT_INTELLIGENCE_TIMEOUT_MS "${AZURE_DOCUMENT_INTELLIGENCE_TIMEOUT_MS:-90000}"
add_var AZURE_DOCUMENT_INTELLIGENCE_POLL_INTERVAL_MS "${AZURE_DOCUMENT_INTELLIGENCE_POLL_INTERVAL_MS:-1000}"
add_var AZURE_DOCUMENT_INTELLIGENCE_COST_PER_1000_PAGES "${AZURE_DOCUMENT_INTELLIGENCE_COST_PER_1000_PAGES:-10}"
add_var OCR_SERVICE_SECRET                   "${OCR_SERVICE_SECRET:-change-me}"
add_var TRIGGER_SECRET_KEY                   "${TRIGGER_SECRET_KEY:-}"
add_var TRIGGER_PROJECT_ID                   "${TRIGGER_PROJECT_ID:-}"
add_var CRON_SECRET                          "${CRON_SECRET:-}"
add_var HEALTH_STRICT                        "${HEALTH_STRICT:-}"

echo ""
echo "Done. Verify with: vercel env ls"
