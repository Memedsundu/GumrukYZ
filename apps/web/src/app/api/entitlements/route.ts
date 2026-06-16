import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { getEntitlementsState } from '@/lib/entitlements'

export async function GET() {
  try {
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    const entitlement = await getEntitlementsState(user.tenantId)
    return NextResponse.json(entitlement)
  } catch (err) {
    console.error('GET /api/entitlements error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
