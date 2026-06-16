import { NextResponse } from 'next/server'
import type { EntitlementBlock } from '@/lib/entitlements'

/**
 * Build a backward-compatible entitlement error response. Keeps the existing
 * `{ error }` shape and adds `code` + `entitlement` for clients that can render
 * precise upgrade/trial messaging. Defaults to 403 (read-only/blocked state).
 */
export function entitlementError(block: EntitlementBlock, status = 403): NextResponse {
  return NextResponse.json(
    { error: block.message, code: block.code, entitlement: block.entitlement },
    { status },
  )
}
