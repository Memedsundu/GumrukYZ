import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/platform-admin'
import { reconcileStuckReservations } from '@/lib/entitlements'

export async function POST() {
  try {
    const guard = await requirePlatformAdmin()
    if (guard.response) return guard.response

    const reconciled = await reconcileStuckReservations()
    return NextResponse.json({ reconciled })
  } catch (err) {
    console.error('POST /api/platform/reconcile error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
