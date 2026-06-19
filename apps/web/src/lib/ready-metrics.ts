import { prisma } from '@gumrukyz/db'

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
  dbLatencyMs: number
  thresholds: {
    maxQueueDepth: number
    maxStuckJobs: number
    maxReconcilerBacklog: number
    maxProviderErrorRate: number
    maxProviderP95DurationMs: number
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
    maxDbLatencyMs: parseEnvInt('READY_MAX_DB_LATENCY_MS', 500),
    stuckJobMinutes: parseEnvInt('READY_STUCK_JOB_MINUTES', 30),
    metricsWindowMinutes: parseEnvInt('READY_METRICS_WINDOW_MINUTES', 60),
  }
}

async function countReconcilerBacklog(olderThanMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs)
  const reserveEvents = await prisma.tenantUsageEvent.findMany({
    where: { action: 'reserve', createdAt: { lt: cutoff }, processingJobId: { not: null } },
    select: { processingJobId: true, metric: true },
    take: 500,
  })

  let backlog = 0
  for (const event of reserveEvents) {
    const jobId = event.processingJobId
    if (!jobId) continue

    const settled = await prisma.tenantUsageEvent.findFirst({
      where: { processingJobId: jobId, metric: event.metric, action: { in: ['consume', 'refund'] } },
    })
    if (settled) continue

    const job = await prisma.processingJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    })
    if (job && job.status !== 'FAILED' && job.status !== 'COMPLETED') continue
    backlog++
  }

  return backlog
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

  return {
    queueDepth,
    stuckJobs,
    reconcilerBacklog,
    providerRunsLastHour,
    providerErrorsLastHour,
    providerErrorRate,
    providerP95DurationMs,
    dbLatencyMs,
    thresholds: {
      maxQueueDepth: thresholds.maxQueueDepth,
      maxStuckJobs: thresholds.maxStuckJobs,
      maxReconcilerBacklog: thresholds.maxReconcilerBacklog,
      maxProviderErrorRate: thresholds.maxProviderErrorRate,
      maxProviderP95DurationMs: thresholds.maxProviderP95DurationMs,
      maxDbLatencyMs: thresholds.maxDbLatencyMs,
    },
    alerts,
    ready: alerts.length === 0,
  }
}
