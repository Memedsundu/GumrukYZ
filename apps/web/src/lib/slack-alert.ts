import type { ReadyMetrics } from './ready-metrics'

const PRODUCTION_URL = process.env['PRODUCTION_URL'] ?? 'https://gumrukyz.vercel.app'

function alertNotifyEmail(): string {
  return process.env['ALERT_NOTIFY_EMAIL']?.trim() || 'veysel.sundu@gmail.com'
}

function formatPercent(value: number | null): string {
  if (value == null) return '—'
  return `${(value * 100).toFixed(1)}%`
}

function formatUsd(value: number | null): string {
  if (value == null) return '—'
  return `$${value.toFixed(2)}`
}

function formatMs(value: number | null): string {
  if (value == null) return '—'
  return `${value}ms`
}

export function buildSlackReadyAlertPayload(metrics: ReadyMetrics) {
  const alertLines = metrics.alerts.map((a) => `• ${a}`).join('\n')
  const onCall = alertNotifyEmail()
  const readyUrl = `${PRODUCTION_URL.replace(/\/$/, '')}/api/ready`

  return {
    text: `GümrükYZ production alert — ${metrics.alerts.length} threshold(s) exceeded`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: metrics.ready ? 'GümrükYZ readiness notice' : 'GümrükYZ production alert',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: metrics.ready
            ? '*Readiness check passed* — informational snapshot.'
            : `*Production is not ready* — ${metrics.alerts.length} threshold(s) exceeded.`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Alerts*\n${alertLines || '—'}`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Queue depth*\n${metrics.queueDepth}` },
          { type: 'mrkdwn', text: `*Stuck jobs*\n${metrics.stuckJobs}` },
          { type: 'mrkdwn', text: `*Reconciler backlog*\n${metrics.reconcilerBacklog}` },
          { type: 'mrkdwn', text: `*DB latency*\n${formatMs(metrics.dbLatencyMs)}` },
          { type: 'mrkdwn', text: `*Provider error rate*\n${formatPercent(metrics.providerErrorRate)}` },
          { type: 'mrkdwn', text: `*Provider p95*\n${formatMs(metrics.providerP95DurationMs)}` },
          { type: 'mrkdwn', text: `*AI spend (1h)*\n${formatUsd(metrics.globalSpendLastHourUsd)}` },
          { type: 'mrkdwn', text: `*Provider runs (1h)*\n${metrics.providerRunsLastHour}` },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `On-call: ${onCall} · <${readyUrl}|/api/ready> · ${new Date().toISOString()}`,
          },
        ],
      },
    ],
  }
}

export function isSlackWebhookUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'hooks.slack.com' || host.endsWith('.hooks.slack.com')
  } catch {
    return url.includes('hooks.slack.com')
  }
}

export function resolveAlertWebhookUrl(): string | null {
  const slack = process.env['SLACK_WEBHOOK_URL']?.trim()
  const generic = process.env['ALERT_WEBHOOK_URL']?.trim()
  return slack || generic || null
}
