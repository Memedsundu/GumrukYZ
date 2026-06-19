import { NextRequest, NextResponse } from 'next/server'
import { collectReadyMetrics } from '@/lib/ready-metrics'
import { sendReadyAlert } from '@/lib/ready-alerts'

export const dynamic = 'force-dynamic'

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  try {
    const metrics = await collectReadyMetrics()

    if (!metrics.ready && isCronAuthorized(req)) {
      await sendReadyAlert(metrics).catch((err) => {
        console.error('ready alert dispatch failed:', err)
      })
    }

    return NextResponse.json(
      {
        ready: metrics.ready,
        metrics: {
          queueDepth: metrics.queueDepth,
          stuckJobs: metrics.stuckJobs,
          reconcilerBacklog: metrics.reconcilerBacklog,
          providerRunsLastHour: metrics.providerRunsLastHour,
          providerErrorsLastHour: metrics.providerErrorsLastHour,
          providerErrorRate: metrics.providerErrorRate,
          providerP95DurationMs: metrics.providerP95DurationMs,
          dbLatencyMs: metrics.dbLatencyMs,
        },
        thresholds: metrics.thresholds,
        alerts: metrics.alerts,
        timestamp: new Date().toISOString(),
      },
      { status: metrics.ready ? 200 : 503 },
    )
  } catch (err) {
    console.error('GET /api/ready error:', err)
    return NextResponse.json(
      { ready: false, error: 'Sunucu hatası', timestamp: new Date().toISOString() },
      { status: 500 },
    )
  }
}
