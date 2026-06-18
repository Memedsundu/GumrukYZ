import { prisma } from '@gumrukyz/db'

export type ProviderCostRollup = {
  provider: string
  operation: string
  runs: number
  errors: number
  totalInputTokens: number
  totalOutputTokens: number
  totalPageCount: number
  totalBillableUnits: number
  totalCostUsd: number
}

export type DailyCostRollup = ProviderCostRollup & {
  day: Date
}

type RawCostRollup = {
  provider: string
  operation: string
  runs: unknown
  errors: unknown
  totalInputTokens: unknown
  totalinputtokens?: unknown
  totalOutputTokens: unknown
  totaloutputtokens?: unknown
  totalPageCount: unknown
  totalpagecount?: unknown
  totalBillableUnits: unknown
  totalbillableunits?: unknown
  totalCostUsd: unknown
  totalcostusd?: unknown
}

type RawDailyCostRollup = RawCostRollup & {
  day: Date | string
}

export async function getDailyProviderCostRollups(params: {
  tenantId: string
  days?: number
}): Promise<DailyCostRollup[]> {
  const days = Math.max(1, Math.min(params.days ?? 30, 365))
  const rows = await prisma.$queryRaw<RawDailyCostRollup[]>`
    SELECT
      date_trunc('day', created_at) AS day,
      provider,
      operation,
      COUNT(*)::integer AS runs,
      SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END)::integer AS errors,
      COALESCE(SUM(input_tokens), 0)::integer AS "totalInputTokens",
      COALESCE(SUM(output_tokens), 0)::integer AS "totalOutputTokens",
      COALESCE(SUM(page_count), 0)::integer AS "totalPageCount",
      COALESCE(SUM(billable_units), 0)::double precision AS "totalBillableUnits",
      COALESCE(SUM(estimated_cost_usd), 0)::double precision AS "totalCostUsd"
    FROM provider_runs
    WHERE tenant_id = ${params.tenantId}
      AND created_at >= NOW() - (${days} * INTERVAL '1 day')
    GROUP BY date_trunc('day', created_at), provider, operation
    ORDER BY day ASC, provider ASC, operation ASC
  `
  return rows.map((row) => ({
    day: row.day instanceof Date ? row.day : new Date(row.day),
    ...normalizeCostRollup(row),
  }))
}

export async function getSubmissionProviderCostRollups(params: {
  tenantId: string
  submissionId: string
}): Promise<ProviderCostRollup[]> {
  const rows = await prisma.$queryRaw<RawCostRollup[]>`
    SELECT
      provider,
      operation,
      COUNT(*)::integer AS runs,
      SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END)::integer AS errors,
      COALESCE(SUM(input_tokens), 0)::integer AS "totalInputTokens",
      COALESCE(SUM(output_tokens), 0)::integer AS "totalOutputTokens",
      COALESCE(SUM(page_count), 0)::integer AS "totalPageCount",
      COALESCE(SUM(billable_units), 0)::double precision AS "totalBillableUnits",
      COALESCE(SUM(estimated_cost_usd), 0)::double precision AS "totalCostUsd"
    FROM provider_runs
    WHERE tenant_id = ${params.tenantId}
      AND submission_id = ${params.submissionId}
    GROUP BY provider, operation
    ORDER BY provider ASC, operation ASC
  `
  return rows.map(normalizeCostRollup)
}

export async function getCreatorProviderCostRollups(params: {
  tenantId: string
  createdBy: string
  days?: number
}): Promise<ProviderCostRollup[]> {
  const days = Math.max(1, Math.min(params.days ?? 30, 365))
  const rows = await prisma.$queryRaw<RawCostRollup[]>`
    SELECT
      pr.provider,
      pr.operation,
      COUNT(*)::integer AS runs,
      SUM(CASE WHEN pr.status = 'ERROR' THEN 1 ELSE 0 END)::integer AS errors,
      COALESCE(SUM(pr.input_tokens), 0)::integer AS "totalInputTokens",
      COALESCE(SUM(pr.output_tokens), 0)::integer AS "totalOutputTokens",
      COALESCE(SUM(pr.page_count), 0)::integer AS "totalPageCount",
      COALESCE(SUM(pr.billable_units), 0)::double precision AS "totalBillableUnits",
      COALESCE(SUM(pr.estimated_cost_usd), 0)::double precision AS "totalCostUsd"
    FROM provider_runs pr
    JOIN submissions s ON s.id = pr.submission_id
    WHERE pr.tenant_id = ${params.tenantId}
      AND s.created_by = ${params.createdBy}
      AND pr.created_at >= NOW() - (${days} * INTERVAL '1 day')
    GROUP BY pr.provider, pr.operation
    ORDER BY pr.provider ASC, pr.operation ASC
  `
  return rows.map(normalizeCostRollup)
}

function normalizeCostRollup(row: RawCostRollup): ProviderCostRollup {
  return {
    provider: row.provider,
    operation: row.operation,
    runs: toNumber(row.runs),
    errors: toNumber(row.errors),
    totalInputTokens: toNumber(row.totalInputTokens ?? row.totalinputtokens),
    totalOutputTokens: toNumber(row.totalOutputTokens ?? row.totaloutputtokens),
    totalPageCount: toNumber(row.totalPageCount ?? row.totalpagecount),
    totalBillableUnits: toNumber(row.totalBillableUnits ?? row.totalbillableunits),
    totalCostUsd: toNumber(row.totalCostUsd ?? row.totalcostusd),
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (value && typeof value === 'object') {
    const decimalLike = value as { toNumber?: () => number; toString?: () => string }
    if (typeof decimalLike.toNumber === 'function') return decimalLike.toNumber()
    if (typeof decimalLike.toString === 'function') {
      const parsed = Number(decimalLike.toString())
      return Number.isFinite(parsed) ? parsed : 0
    }
  }
  return 0
}
