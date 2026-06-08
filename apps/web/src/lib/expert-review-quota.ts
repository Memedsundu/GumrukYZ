import { prisma, Prisma } from '@gumrukyz/db'

export type ExpertReviewQuota = {
  limit: number
  used: number
  remaining: number
  usedOn: string
  period: 'DAILY'
}

export type ExpertReviewReservation =
  | { kind: 'existing'; reviewId: string; quotaDay: string }
  | { kind: 'reserved'; reviewId: string; quotaDay: string }

export class ExpertReviewQuotaExhaustedError extends Error {
  constructor() {
    super('Uzman yapay zeka inceleme hakkı kalmadı')
    this.name = 'ExpertReviewQuotaExhaustedError'
  }
}

export class ExpertReviewAlreadyRunningError extends Error {
  constructor() {
    super('Bu dosya için uzman yapay zeka incelemesi zaten devam ediyor')
    this.name = 'ExpertReviewAlreadyRunningError'
  }
}

type QuotaRow = {
  expert_review_limit: number
  expert_review_used: number
  expert_review_used_on: Date | string | null
}

export async function getExpertReviewQuota(tenantId: string): Promise<ExpertReviewQuota> {
  const quotaDay = getCurrentQuotaDay()
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      expertReviewLimit: true,
      expertReviewUsed: true,
      expertReviewUsedOn: true,
    },
  })

  return normalizeQuota({
    limit: tenant?.expertReviewLimit ?? 0,
    used: dateOnly(tenant?.expertReviewUsedOn) === quotaDay ? tenant?.expertReviewUsed ?? 0 : 0,
    usedOn: quotaDay,
  })
}

export async function reserveExpertReviewSlot(params: {
  tenantId: string
  submissionId: string
  forceNew?: boolean
}): Promise<ExpertReviewReservation> {
  const quotaDay = getCurrentQuotaDay()
  try {
    return await prisma.$transaction(async (tx) => {
      if (!params.forceNew) {
        const existingReview = await tx.expertReview.findFirst({
          where: {
            tenantId: params.tenantId,
            submissionId: params.submissionId,
            status: 'COMPLETED',
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })

        if (existingReview) {
          return { kind: 'existing', reviewId: existingReview.id, quotaDay }
        }
      }

      const reservedRows = await tx.$queryRaw<QuotaRow[]>`
        UPDATE "tenants"
        SET
          "expert_review_used" = CASE
            WHEN "expert_review_used_on" = CAST(${quotaDay} AS date)
              THEN "expert_review_used" + 1
            ELSE 1
          END,
          "expert_review_used_on" = CAST(${quotaDay} AS date),
          "updated_at" = NOW()
        WHERE
          "id" = ${params.tenantId}
          AND (
            "expert_review_used_on" IS DISTINCT FROM CAST(${quotaDay} AS date)
            OR "expert_review_used" < "expert_review_limit"
          )
        RETURNING "expert_review_limit", "expert_review_used", "expert_review_used_on"
      `

      if (!reservedRows[0]) {
        throw new ExpertReviewQuotaExhaustedError()
      }

      const review = await tx.expertReview.create({
        data: {
          tenantId: params.tenantId,
          submissionId: params.submissionId,
          status: 'RUNNING',
          legalContextStatus: 'NOT_RUN',
          summary: 'Uzman yapay zeka incelemesi hazırlanıyor.',
        },
        select: { id: true },
      })

      return { kind: 'reserved', reviewId: review.id, quotaDay }
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ExpertReviewAlreadyRunningError()
    }
    throw error
  }
}

export async function refundExpertReviewSlot(tenantId: string, quotaDay = getCurrentQuotaDay()): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "tenants"
    SET
      "expert_review_used" = GREATEST("expert_review_used" - 1, 0),
      "updated_at" = NOW()
    WHERE
      "id" = ${tenantId}
      AND "expert_review_used_on" = CAST(${quotaDay} AS date)
      AND "expert_review_used" > 0
  `
}

function normalizeQuota(input: { limit: number; used: number; usedOn: string }): ExpertReviewQuota {
  const limit = Math.max(0, input.limit)
  const used = Math.max(0, input.used)
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    usedOn: input.usedOn,
    period: 'DAILY',
  }
}

export function getCurrentQuotaDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const byType = new Map(parts.map((part) => [part.type, part.value]))
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`
}

function dateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}
