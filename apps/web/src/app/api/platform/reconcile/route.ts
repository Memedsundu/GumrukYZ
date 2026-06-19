import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/platform-admin'
import { reconcileStuckReservations } from '@/lib/entitlements'

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

async function runReconcile() {
  const reconciled = await reconcileStuckReservations()
  return NextResponse.json({ reconciled })
}

/** Vercel Cron — requires CRON_SECRET (sent as Authorization: Bearer). */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    return await runReconcile()
  } catch (err) {
    console.error('GET /api/platform/reconcile error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

/** Platform console manual trigger. */
export async function POST() {
  try {
    const guard = await requirePlatformAdmin()
    if (guard.response) return guard.response

    return await runReconcile()
  } catch (err) {
    console.error('POST /api/platform/reconcile error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
