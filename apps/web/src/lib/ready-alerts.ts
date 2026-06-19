import type { ReadyMetrics } from './ready-metrics'

export async function sendReadyAlert(metrics: ReadyMetrics): Promise<boolean> {
  const webhookUrl = process.env['ALERT_WEBHOOK_URL']?.trim()
  if (!webhookUrl || metrics.alerts.length === 0) return false

  const payload = {
    source: 'gumrukyz-ready',
    ready: metrics.ready,
    alerts: metrics.alerts,
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
    timestamp: new Date().toISOString(),
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    console.error('ready alert webhook failed', response.status, await response.text().catch(() => ''))
    return false
  }

  return true
}
