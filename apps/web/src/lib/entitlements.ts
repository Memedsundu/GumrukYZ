import { prisma } from '@gumrukyz/db'
import type { TenantSubscription } from '@gumrukyz/db'
import {
  isPurchasablePlan,
  planLimits,
  PLAN_CATALOG,
  TenantSubscriptionStatus,
  TRIAL_POLICY,
  UsageMetric,
  type PlanLimits,
} from '@gumrukyz/domain'

const DAY_MS = 24 * 60 * 60 * 1000

export type BlockCode = 'TRIAL_EXPIRED' | 'TRIAL_LIMIT_REACHED' | 'SUBSCRIPTION_INACTIVE'

export class EntitlementExhaustedError extends Error {
  code = 'ENTITLEMENT_EXHAUSTED' as const
  constructor(public metric: string) {
    super('Kullanım hakkınız doldu')
    this.name = 'EntitlementExhaustedError'
  }
}

export interface MetricState {
  limit: number
  used: number
  reserved: number
  remaining: number
}

export interface EntitlementsState {
  planCode: string
  publicName: string
  status: string
  isTrial: boolean
  trial: {
    endsAt: string
    daysLeft: number
    analysisCap: number
    analysisUsed: number
    expertReviewsUsed: number
    expertReviewsCap: number
  } | null
  periodStart: string | null
  periodEnd: string | null
  resetDate: string | null
  metrics: {
    analysis: MetricState
    expertReview: MetricState
    users: MetricState
  }
  /** Total completed analysis runs this period (incl. free reanalyses), for display. */
  analysisRunsThisPeriod: number
  documentsPerSubmission: number
  readOnly: boolean
  blockReason: BlockCode | null
  warnings: Array<{ metric: 'analysis' | 'expertReview' | 'users'; level: 70 | 90 | 100 }>
}

export interface EntitlementBlock {
  code: BlockCode
  message: string
  entitlement: EntitlementsState
}

// ── Istanbul date helpers (mirrors expert-review-quota.ts conventions) ────────

function istanbulYmd(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const byType = new Map(parts.map((part) => [part.type, part.value]))
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`
}

function ymdToDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`)
}

function ymdOf(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function monthBounds(now: Date): { startYmd: string; endYmd: string } {
  const [yStr, mStr] = istanbulYmd(now).split('-')
  const year = Number(yStr)
  const month = Number(mStr)
  const startYmd = `${yStr}-${mStr}-01`
  const endYmd =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  return { startYmd, endYmd }
}

interface ResolvedPeriod {
  startDate: Date
  endDate: Date
  startYmd: string
  endYmd: string
  resetIso: string
}

function resolvePeriod(sub: TenantSubscription | null, now: Date): ResolvedPeriod {
  if (
    sub?.status === TenantSubscriptionStatus.TRIALING &&
    sub.trialStartedAt &&
    sub.trialEndsAt
  ) {
    const startYmd = istanbulYmd(sub.trialStartedAt)
    const endYmd = istanbulYmd(sub.trialEndsAt)
    return {
      startDate: ymdToDate(startYmd),
      endDate: ymdToDate(endYmd),
      startYmd,
      endYmd,
      resetIso: sub.trialEndsAt.toISOString(),
    }
  }
  const { startYmd, endYmd } = monthBounds(now)
  return {
    startDate: ymdToDate(startYmd),
    endDate: ymdToDate(endYmd),
    startYmd,
    endYmd,
    resetIso: endYmd,
  }
}

// ── Limits & metering scope ───────────────────────────────────────────────────

interface EffectiveLimits {
  analysis: number
  expertReview: number
  documents: number
  users: number
}

function effectiveLimits(sub: TenantSubscription | null): EffectiveLimits {
  const planCode = sub?.planCode ?? 'internal'
  const limits = planLimits(planCode, (sub?.limitsOverrideJson as Partial<PlanLimits> | null) ?? null)
  const isTrial = sub?.status === TenantSubscriptionStatus.TRIALING
  return {
    analysis: isTrial ? sub?.trialAnalysisCap ?? TRIAL_POLICY.analysisCap : limits.analysesPerMonth,
    expertReview: isTrial ? TRIAL_POLICY.caps.expertReviews : limits.expertReviewsPerMonth,
    documents: limits.documentsPerSubmission,
    users: limits.users,
  }
}

function metricLimitFor(sub: TenantSubscription | null, metric: string): number {
  const l = effectiveLimits(sub)
  if (metric === UsageMetric.ANALYSIS) return l.analysis
  if (metric === UsageMetric.EXPERT_REVIEW) return l.expertReview
  if (metric === UsageMetric.DOCUMENTS) return l.documents
  return l.users
}

/** Whether usage limits are hard-enforced for this subscription (Phase 2). */
function isMetered(sub: TenantSubscription | null): boolean {
  if (!sub) return false
  if (sub.status === TenantSubscriptionStatus.TRIALING) return true
  if (sub.status === TenantSubscriptionStatus.ACTIVE && isPurchasablePlan(sub.planCode)) return true
  return false
}

// ── Counter access ────────────────────────────────────────────────────────────

async function readCounter(
  tenantId: string,
  metric: string,
  periodStart: Date,
): Promise<{ used: number; reserved: number }> {
  const row = await prisma.tenantUsageCounter.findUnique({
    where: { tenantId_metric_periodStart: { tenantId, metric, periodStart } },
    select: { usedCount: true, reservedCount: true },
  })
  return { used: row?.usedCount ?? 0, reserved: row?.reservedCount ?? 0 }
}

function refWhere(ref: { processingJobId?: string | null; expertReviewId?: string | null }) {
  if (ref.processingJobId) return { processingJobId: ref.processingJobId }
  if (ref.expertReviewId) return { expertReviewId: ref.expertReviewId }
  return {}
}

// ── Presentation helpers ──────────────────────────────────────────────────────

function planPublicName(code: string): string {
  if (isPurchasablePlan(code)) return PLAN_CATALOG[code].publicName
  if (code === 'internal') return 'Dahili'
  if (code === 'pilot') return 'Pilot'
  return code
}

function metricState(limit: number, used: number, reserved: number): MetricState {
  const safeUsed = Math.max(0, used)
  const safeReserved = Math.max(0, reserved)
  return {
    limit,
    used: safeUsed,
    reserved: safeReserved,
    remaining: Math.max(0, limit - safeUsed - safeReserved),
  }
}

function warningLevel(limit: number, used: number): 70 | 90 | 100 | null {
  if (limit <= 0) return null
  const pct = (used / limit) * 100
  if (pct >= 100) return 100
  if (pct >= 90) return 90
  if (pct >= 70) return 70
  return null
}

function computeBlock(
  sub: TenantSubscription | null,
  now: Date,
  analysisUsed: number,
  analysisCap: number,
): BlockCode | null {
  if (!sub) return null
  switch (sub.status) {
    case TenantSubscriptionStatus.SUSPENDED:
    case TenantSubscriptionStatus.CANCELED:
      return 'SUBSCRIPTION_INACTIVE'
    case TenantSubscriptionStatus.TRIAL_EXPIRED:
      return 'TRIAL_EXPIRED'
    case TenantSubscriptionStatus.GRACE:
      return sub.graceUntil && now > sub.graceUntil ? 'SUBSCRIPTION_INACTIVE' : null
    case TenantSubscriptionStatus.TRIALING:
      if (sub.trialEndsAt && now > sub.trialEndsAt) return 'TRIAL_EXPIRED'
      if (analysisUsed >= analysisCap) return 'TRIAL_LIMIT_REACHED'
      return null
    default:
      return null
  }
}

function blockMessage(code: BlockCode): string {
  switch (code) {
    case 'TRIAL_EXPIRED':
      return 'Deneme süreniz doldu. Devam etmek için bir paket seçin.'
    case 'TRIAL_LIMIT_REACHED':
      return 'Deneme analiz hakkınız doldu. Devam etmek için bir paket seçin.'
    case 'SUBSCRIPTION_INACTIVE':
      return 'Aboneliğiniz aktif değil. Lütfen bizimle iletişime geçin.'
  }
}

// ── Public read API ───────────────────────────────────────────────────────────

export async function getTenantEntitlements(tenantId: string): Promise<EntitlementsState> {
  const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId } })
  const planCode =
    sub?.planCode ??
    (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } }))?.plan ??
    'internal'

  const now = new Date()
  const period = resolvePeriod(sub, now)
  const limits = effectiveLimits(sub)
  const isTrial = sub?.status === TenantSubscriptionStatus.TRIALING

  const [analysis, expert, userCount, runsThisPeriod] = await Promise.all([
    readCounter(tenantId, UsageMetric.ANALYSIS, period.startDate),
    readCounter(tenantId, UsageMetric.EXPERT_REVIEW, period.startDate),
    prisma.user.count({ where: { tenantId } }),
    prisma.riskReport.count({ where: { tenantId, generatedAt: { gte: period.startDate } } }),
  ])

  const blockReason = computeBlock(sub, now, analysis.used, limits.analysis)

  const warnings: EntitlementsState['warnings'] = []
  const analysisWarn = warningLevel(limits.analysis, analysis.used)
  if (analysisWarn) warnings.push({ metric: 'analysis', level: analysisWarn })
  const expertWarn = warningLevel(limits.expertReview, expert.used)
  if (expertWarn) warnings.push({ metric: 'expertReview', level: expertWarn })
  const usersWarn = warningLevel(limits.users, userCount)
  if (usersWarn) warnings.push({ metric: 'users', level: usersWarn })

  const trial =
    isTrial && sub?.trialEndsAt
      ? {
          endsAt: sub.trialEndsAt.toISOString(),
          daysLeft: Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / DAY_MS)),
          analysisCap: limits.analysis,
          analysisUsed: analysis.used,
          expertReviewsUsed: expert.used,
          expertReviewsCap: limits.expertReview,
        }
      : null

  return {
    planCode,
    publicName: planPublicName(planCode),
    status: sub?.status ?? TenantSubscriptionStatus.ACTIVE,
    isTrial,
    trial,
    periodStart: period.startYmd,
    periodEnd: period.endYmd,
    resetDate: period.resetIso,
    metrics: {
      analysis: metricState(limits.analysis, analysis.used, analysis.reserved),
      expertReview: metricState(limits.expertReview, expert.used, expert.reserved),
      users: metricState(limits.users, userCount, 0),
    },
    analysisRunsThisPeriod: runsThisPeriod,
    documentsPerSubmission: limits.documents,
    readOnly: blockReason !== null,
    blockReason,
    warnings,
  }
}

export async function getEntitlementsState(tenantId: string): Promise<EntitlementsState> {
  return getTenantEntitlements(tenantId)
}

export function toEntitlementBlock(entitlement: EntitlementsState): EntitlementBlock | null {
  if (!entitlement.readOnly || !entitlement.blockReason) return null
  return {
    code: entitlement.blockReason,
    message: blockMessage(entitlement.blockReason),
    entitlement,
  }
}

export async function getEntitlementBlock(tenantId: string): Promise<EntitlementBlock | null> {
  return toEntitlementBlock(await getTenantEntitlements(tenantId))
}

// ── Phase 2: atomic reserve / consume / refund ────────────────────────────────

/**
 * Atomically reserve one unit of a metric for the current period. Throws
 * EntitlementExhaustedError when no quota remains. Idempotency/settlement is
 * tracked per processing job / expert review via TenantUsageEvent.
 */
export async function reserveMetric(params: {
  tenantId: string
  metric: string
  processingJobId?: string | null
  expertReviewId?: string | null
  submissionId?: string | null
}): Promise<{ periodStart: Date }> {
  const { tenantId, metric } = params
  const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId } })
  const period = resolvePeriod(sub, new Date())
  const limit = metricLimitFor(sub, metric)

  return prisma.$transaction(async (tx) => {
    await tx.tenantUsageCounter.upsert({
      where: { tenantId_metric_periodStart: { tenantId, metric, periodStart: period.startDate } },
      update: {},
      create: {
        tenantId,
        metric,
        periodStart: period.startDate,
        periodEnd: period.endDate,
        usedCount: 0,
        reservedCount: 0,
        limitSnapshot: limit,
      },
    })

    const rows = await tx.$queryRaw<{ reserved_count: number }[]>`
      UPDATE "tenant_usage_counters"
      SET "reserved_count" = "reserved_count" + 1, "updated_at" = NOW()
      WHERE "tenant_id" = ${tenantId}
        AND "metric" = ${metric}
        AND "period_start" = CAST(${period.startYmd} AS date)
        AND ("used_count" + "reserved_count") < ${limit}
      RETURNING "reserved_count"
    `
    if (!rows[0]) throw new EntitlementExhaustedError(metric)

    await tx.tenantUsageEvent.create({
      data: {
        tenantId,
        metric,
        action: 'reserve',
        periodStart: period.startDate,
        processingJobId: params.processingJobId ?? null,
        expertReviewId: params.expertReviewId ?? null,
        submissionId: params.submissionId ?? null,
      },
    })

    return { periodStart: period.startDate }
  })
}

/** Move a reservation to consumed (idempotent). No-op when nothing was reserved. */
export async function consumeMetric(params: {
  metric: string
  processingJobId?: string | null
  expertReviewId?: string | null
}): Promise<void> {
  const ref = refWhere(params)
  const reserveEvent = await prisma.tenantUsageEvent.findFirst({
    where: { ...ref, metric: params.metric, action: 'reserve' },
    orderBy: { createdAt: 'desc' },
  })
  if (!reserveEvent) return
  const settled = await prisma.tenantUsageEvent.findFirst({
    where: { ...ref, metric: params.metric, action: { in: ['consume', 'refund'] } },
  })
  if (settled) return

  const ymd = ymdOf(reserveEvent.periodStart)
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "tenant_usage_counters"
      SET "reserved_count" = GREATEST("reserved_count" - 1, 0),
          "used_count" = "used_count" + 1,
          "updated_at" = NOW()
      WHERE "tenant_id" = ${reserveEvent.tenantId}
        AND "metric" = ${params.metric}
        AND "period_start" = CAST(${ymd} AS date)
    `,
    prisma.tenantUsageEvent.create({
      data: {
        tenantId: reserveEvent.tenantId,
        metric: params.metric,
        action: 'consume',
        periodStart: reserveEvent.periodStart,
        processingJobId: params.processingJobId ?? null,
        expertReviewId: params.expertReviewId ?? null,
        submissionId: reserveEvent.submissionId,
      },
    }),
  ])
}

/** Release a reservation (idempotent). Use only for platform/system failures. */
export async function refundMetric(params: {
  metric: string
  processingJobId?: string | null
  expertReviewId?: string | null
  reason?: string
}): Promise<void> {
  const ref = refWhere(params)
  const reserveEvent = await prisma.tenantUsageEvent.findFirst({
    where: { ...ref, metric: params.metric, action: 'reserve' },
    orderBy: { createdAt: 'desc' },
  })
  if (!reserveEvent) return
  const settled = await prisma.tenantUsageEvent.findFirst({
    where: { ...ref, metric: params.metric, action: { in: ['consume', 'refund'] } },
  })
  if (settled) return

  const ymd = ymdOf(reserveEvent.periodStart)
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "tenant_usage_counters"
      SET "reserved_count" = GREATEST("reserved_count" - 1, 0), "updated_at" = NOW()
      WHERE "tenant_id" = ${reserveEvent.tenantId}
        AND "metric" = ${params.metric}
        AND "period_start" = CAST(${ymd} AS date)
    `,
    prisma.tenantUsageEvent.create({
      data: {
        tenantId: reserveEvent.tenantId,
        metric: params.metric,
        action: 'refund',
        periodStart: reserveEvent.periodStart,
        processingJobId: params.processingJobId ?? null,
        expertReviewId: params.expertReviewId ?? null,
        submissionId: reserveEvent.submissionId,
        reason: params.reason ?? null,
      },
    }),
  ])
}

/** Whether the next analysis run for this submission consumes a credit. */
export async function willChargeAnalysis(params: {
  tenantId: string
  submissionId: string
}): Promise<boolean> {
  const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId: params.tenantId } })
  if (!isMetered(sub)) return false
  const totalPriorRuns = await prisma.riskReport.count({
    where: { submissionId: params.submissionId },
  })
  if (totalPriorRuns === 0) return true
  if (sub?.status === TenantSubscriptionStatus.TRIALING) return false
  const period = resolvePeriod(sub, new Date())
  const freeUsed = await prisma.tenantUsageEvent.findFirst({
    where: {
      submissionId: params.submissionId,
      metric: UsageMetric.ANALYSIS,
      action: 'free_reanalysis',
      periodStart: period.startDate,
    },
  })
  return Boolean(freeUsed)
}

/**
 * Reserve an analysis credit for a run that is about to start. Applies the
 * billing rules: initial run always charges; trial reanalyses are free; the
 * first paid reanalysis per submission per period is free, later ones charge.
 * Throws EntitlementExhaustedError when the limit is reached.
 */
export async function reserveAnalysisCredit(params: {
  tenantId: string
  submissionId: string
  processingJobId: string
}): Promise<{ reserved: boolean }> {
  const { tenantId, submissionId, processingJobId } = params
  const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId } })
  if (!isMetered(sub)) return { reserved: false }

  const totalPriorRuns = await prisma.riskReport.count({ where: { submissionId } })
  const isTrial = sub?.status === TenantSubscriptionStatus.TRIALING

  if (totalPriorRuns > 0) {
    if (isTrial) return { reserved: false }
    const period = resolvePeriod(sub, new Date())
    const freeUsed = await prisma.tenantUsageEvent.findFirst({
      where: {
        submissionId,
        metric: UsageMetric.ANALYSIS,
        action: 'free_reanalysis',
        periodStart: period.startDate,
      },
    })
    if (!freeUsed) {
      await prisma.tenantUsageEvent.create({
        data: {
          tenantId,
          metric: UsageMetric.ANALYSIS,
          action: 'free_reanalysis',
          periodStart: period.startDate,
          submissionId,
          processingJobId,
        },
      })
      return { reserved: false }
    }
  }

  await reserveMetric({ tenantId, metric: UsageMetric.ANALYSIS, processingJobId, submissionId })
  return { reserved: true }
}

/**
 * Release reservations stranded by crashed/abandoned jobs. COMPLETED jobs whose
 * credit was never consumed are consumed; FAILED or missing jobs are refunded.
 * Returns the number of reservations reconciled.
 */
export async function reconcileStuckReservations(olderThanMs = 30 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs)
  const reserveEvents = await prisma.tenantUsageEvent.findMany({
    where: { action: 'reserve', createdAt: { lt: cutoff }, processingJobId: { not: null } },
    select: { processingJobId: true, metric: true },
    take: 500,
  })

  let reconciled = 0
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

    if (job?.status === 'COMPLETED') {
      await consumeMetric({ metric: event.metric, processingJobId: jobId })
    } else {
      await refundMetric({ metric: event.metric, processingJobId: jobId, reason: 'reconcile_stuck' })
    }
    reconciled++
  }
  return reconciled
}
