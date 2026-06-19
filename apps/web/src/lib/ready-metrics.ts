import { prisma } from '@gumrukyz/db'
import { getHourlySpend, getSpendLimits, isSpendGuardEnabled } from './spend-guard'

const ACTIVE_PROCESSING_STATUSES = [
  'CLASSIFYING',
  'EXTRACTING',
  'NORMALIZING',
  'RUNNING_RULES',
  'AI_RULE_VALIDATING',
  'GENERATING_REPORT',
] as const

export type ReadyMetrics = {
  queueDepth: number
  stuckJobs: number
  reconcilerBacklog: number
  providerRunsLastHour: number
  providerErrorsLastHour: number
  providerErrorRate: number | null
  providerP95DurationMs: number | null
  globalSpendLastHourUsd: number | null
  dbLatencyMs: number
  thresholds: {
    maxQueueDepth: number
    maxStuckJobs: number
    maxReconcilerBacklog: number
    maxProviderErrorRate: number
    maxProviderP95DurationMs: number
    maxGlobalSpendUsdPerHour: number
    maxDbLatencyMs: number
  }
  alerts: string[]
  ready: boolean
}

function parseEnvInt(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

function parseEnvFloat(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

export function getReadyThresholds() {
  return {
    maxQueueDepth: parseEnvInt('READY_MAX_QUEUE_DEPTH', 50),
    maxStuckJobs: parseEnvInt('READY_MAX_STUCK_JOBS', 5),
    maxReconcilerBacklog: parseEnvInt('READY_MAX_RECONCILER_BACKLOG', 10),
    maxProviderErrorRate: parseEnvFloat('READY_MAX_PROVIDER_ERROR_RATE', 0.25),
    maxProviderP95DurationMs: parseEnvInt('READY_MAX_PROVIDER_P95_MS', 120_000),
    maxGlobalSpendUsdPerHour: parseEnvFloat('SPEND_LIMIT_GLOBAL_USD_PER_HOUR', 500),
    maxDbLatencyMs: parseEnvInt('READY_MAX_DB_LATENCY_MS', 500),
    stuckJobMinutes: parseEnvInt('READY_STUCK_JOB_MINUTES', 30),
    metricsWindowMinutes: parseEnvInt('READY_METRICS_WINDOW_MINUTES', 60),
  }
}

async function countReconcilerBacklog(olderThanMs: number): Promise<number> {
  // Stranded reservations = a 'reserve' event older than the cutoff whose job is
  // already terminal (FAILED/COMPLETED) but which has no matching consume/refund.
  // Single aggregate query — avoids the prior per-event N+1 that hammered the DB
  // on this (publicly reachable) readiness probe.
  const cutoff = new Date(Date.now() - olderThanMs)
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number | null }>>`
    SELECT COUNT(*)::int AS count
    FROM tenant_usage_events r
    JOIN processing_jobs j ON j.id = r.processing_job_id
    WHERE r.action = 'reserve'
      AND r.processing_job_id IS NOT NULL
      AND r.created_at < ${cutoff}
      AND j.status IN ('FAILED', 'COMPLETED')
      AND NOT EXISTS (
        SELECT 1 FROM tenant_usage_events s
        WHERE s.processing_job_id = r.processing_job_id
          AND s.metric = r.metric
          AND s.action IN ('consume', 'refund')
      )
  `
  return Number(rows[0]?.count ?? 0)
}

export async function collectReadyMetrics(): Promise<ReadyMetrics> {
  const thresholds = getReadyThresholds()
  const stuckCutoff = new Date(Date.now() - thresholds.stuckJobMinutes * 60 * 1000)
  const metricsSince = new Date(Date.now() - thresholds.metricsWindowMinutes * 60 * 1000)
  const reconcilerCutoffMs = thresholds.stuckJobMinutes * 60 * 1000

  const dbStartedAt = Date.now()
  await prisma.$queryRaw`SELECT 1`
  const dbLatencyMs = Date.now() - dbStartedAt

  const [
    queueDepth,
    stuckJobs,
    reconcilerBacklog,
    providerRunsLastHour,
    providerErrorsLastHour,
    p95Rows,
  ] = await Promise.all([
    prisma.processingJob.count({
      where: { status: { in: [...ACTIVE_PROCESSING_STATUSES] } },
    }),
    prisma.processingJob.count({
      where: {
        status: { in: [...ACTIVE_PROCESSING_STATUSES] },
        startedAt: { lt: stuckCutoff },
      },
    }),
    countReconcilerBacklog(reconcilerCutoffMs),
    prisma.providerRun.count({ where: { createdAt: { gte: metricsSince } } }),
    prisma.providerRun.count({
      where: { createdAt: { gte: metricsSince }, status: 'ERROR' },
    }),
    prisma.$queryRaw<Array<{ p95: number | null }>>`
      SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95
      FROM provider_runs
      WHERE created_at >= ${metricsSince}
        AND duration_ms IS NOT NULL
    `,
  ])

  const providerP95DurationMs =
    p95Rows[0]?.p95 != null && Number.isFinite(Number(p95Rows[0].p95))
      ? Math.round(Number(p95Rows[0].p95))
      : null

  const providerErrorRate =
    providerRunsLastHour > 0 ? providerErrorsLastHour / providerRunsLastHour : null

  const globalSpendLastHourUsd = isSpendGuardEnabled()
    ? (await getHourlySpend()).globalSpendUsd
    : null

  const alerts: string[] = []
  if (queueDepth > thresholds.maxQueueDepth) {
    alerts.push(`queue_depth=${queueDepth} exceeds ${thresholds.maxQueueDepth}`)
  }
  if (stuckJobs > thresholds.maxStuckJobs) {
    alerts.push(`stuck_jobs=${stuckJobs} exceeds ${thresholds.maxStuckJobs}`)
  }
  if (reconcilerBacklog > thresholds.maxReconcilerBacklog) {
    alerts.push(`reconciler_backlog=${reconcilerBacklog} exceeds ${thresholds.maxReconcilerBacklog}`)
  }
  if (
    providerErrorRate != null &&
    providerErrorRate > thresholds.maxProviderErrorRate
  ) {
    alerts.push(
      `provider_error_rate=${providerErrorRate.toFixed(3)} exceeds ${thresholds.maxProviderErrorRate}`,
    )
  }
  if (
    providerP95DurationMs != null &&
    providerP95DurationMs > thresholds.maxProviderP95DurationMs
  ) {
    alerts.push(
      `provider_p95_ms=${providerP95DurationMs} exceeds ${thresholds.maxProviderP95DurationMs}`,
    )
  }
  if (dbLatencyMs > thresholds.maxDbLatencyMs) {
    alerts.push(`db_latency_ms=${dbLatencyMs} exceeds ${thresholds.maxDbLatencyMs}`)
  }
  if (
    globalSpendLastHourUsd != null &&
    thresholds.maxGlobalSpendUsdPerHour > 0 &&
    globalSpendLastHourUsd >= thresholds.maxGlobalSpendUsdPerHour
  ) {
    alerts.push(
      `global_spend_usd=${globalSpendLastHourUsd.toFixed(2)} exceeds ${thresholds.maxGlobalSpendUsdPerHour}`,
    )
  }

  return {
    queueDepth,
    stuckJobs,
    reconcilerBacklog,
    providerRunsLastHour,
    providerErrorsLastHour,
    providerErrorRate,
    providerP95DurationMs,
    globalSpendLastHourUsd,
    dbLatencyMs,
    thresholds: {
      maxQueueDepth: thresholds.maxQueueDepth,
      maxStuckJobs: thresholds.maxStuckJobs,
      maxReconcilerBacklog: thresholds.maxReconcilerBacklog,
      maxProviderErrorRate: thresholds.maxProviderErrorRate,
      maxProviderP95DurationMs: thresholds.maxProviderP95DurationMs,
      maxGlobalSpendUsdPerHour: thresholds.maxGlobalSpendUsdPerHour,
      maxDbLatencyMs: thresholds.maxDbLatencyMs,
    },
    alerts,
    ready: alerts.length === 0,
  }
}
