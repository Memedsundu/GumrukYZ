import type { ReadyMetrics } from './ready-metrics'
import {
  buildSlackReadyAlertPayload,
  isSlackWebhookUrl,
  resolveAlertWebhookUrl,
} from './slack-alert'

export async function sendReadyAlert(metrics: ReadyMetrics): Promise<boolean> {
  const webhookUrl = resolveAlertWebhookUrl()
  if (!webhookUrl || metrics.alerts.length === 0) return false

  const payload = isSlackWebhookUrl(webhookUrl)
    ? buildSlackReadyAlertPayload(metrics)
    : {
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
          globalSpendLastHourUsd: metrics.globalSpendLastHourUsd,
          dbLatencyMs: metrics.dbLatencyMs,
        },
        notifyEmail: process.env['ALERT_NOTIFY_EMAIL']?.trim() || 'veysel.sundu@gmail.com',
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

/** Send a test alert (for Slack webhook verification). */
export async function sendTestAlert(metrics: ReadyMetrics): Promise<boolean> {
  const webhookUrl = resolveAlertWebhookUrl()
  if (!webhookUrl) return false

  const payload = isSlackWebhookUrl(webhookUrl)
    ? buildSlackReadyAlertPayload(metrics)
    : {
        source: 'gumrukyz-ready-test',
        ready: metrics.ready,
        alerts: metrics.alerts,
        message: 'Test alert from GümrükYZ — webhook configured correctly.',
        timestamp: new Date().toISOString(),
      }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  })

  return response.ok
}
