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

add_var() {
  local KEY=$1 VAL=$2
  for E in production development; do
    vercel env add "$KEY" "$E" --value "$VAL" --yes --force </dev/null 2>&1 \
      | grep -E "(Saved|Override|Error|Added)" || true
  done
}

echo "Reading $ENV_FILE…"

# Source the .env.local values
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "Pushing to Vercel production + development…"

add_var DATABASE_URL                         "${DATABASE_URL:-}"
add_var DATABASE_URL_UNPOOLED                "${DATABASE_URL_UNPOOLED:-}"
add_var OPENAI_API_KEY                       "${OPENAI_API_KEY:-}"
add_var NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY    "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}"
add_var CLERK_SECRET_KEY                     "${CLERK_SECRET_KEY:-}"
add_var BLOB_READ_WRITE_TOKEN                "${BLOB_READ_WRITE_TOKEN:-}"
add_var NEXT_PUBLIC_CLERK_SIGN_IN_URL        "${NEXT_PUBLIC_CLERK_SIGN_IN_URL:-/sign-in}"
add_var NEXT_PUBLIC_CLERK_SIGN_UP_URL        "${NEXT_PUBLIC_CLERK_SIGN_UP_URL:-/sign-up}"
add_var NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL  "${NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL:-/dashboard}"
add_var NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL  "${NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL:-/dashboard}"
add_var INTERNAL_TENANT_CLERK_ORG_ID         "${INTERNAL_TENANT_CLERK_ORG_ID:-internal_dev}"
add_var OCR_SERVICE_SECRET                   "${OCR_SERVICE_SECRET:-change-me}"

echo ""
echo "Done. Verify with: vercel env ls"
