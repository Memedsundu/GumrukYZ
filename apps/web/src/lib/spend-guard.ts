import { prisma } from '@gumrukyz/db'

export class SpendLimitExceededError extends Error {
  readonly code = 'SPEND_LIMIT_EXCEEDED' as const

  constructor(
    readonly scope: 'tenant' | 'global',
    readonly spendUsd: number,
    readonly limitUsd: number,
  ) {
    super(
      scope === 'tenant'
        ? 'Saatlik AI kullanım limitine ulaşıldı. Lütfen bir süre sonra tekrar deneyin.'
        : 'Platform AI kullanım limitine ulaşıldı. Lütfen daha sonra tekrar deneyin.',
    )
    this.name = 'SpendLimitExceededError'
  }
}

export type SpendGuardResult =
  | { ok: true; tenantSpendUsd: number; globalSpendUsd: number }
  | {
      ok: false
      status: 429
      code: 'SPEND_LIMIT_EXCEEDED'
      error: string
      scope: 'tenant' | 'global'
      spendUsd: number
      limitUsd: number
    }

type SpendSnapshot = {
  tenantSpendUsd: number
  globalSpendUsd: number
}

const CACHE_MS = 30_000
const spendCache = new Map<string, { at: number; snapshot: SpendSnapshot }>()
let globalCache: { at: number; globalSpendUsd: number } | null = null

function parseEnvFloat(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

export function isSpendGuardEnabled(): boolean {
  return process.env.SPEND_CIRCUIT_BREAKER_ENABLED === 'true'
}

export function getSpendLimits() {
  return {
    tenantUsdPerHour: parseEnvFloat('SPEND_LIMIT_TENANT_USD_PER_HOUR', 25),
    globalUsdPerHour: parseEnvFloat('SPEND_LIMIT_GLOBAL_USD_PER_HOUR', 500),
  }
}

async function queryGlobalSpendLastHour(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: number | null }>>`
    SELECT COALESCE(SUM(estimated_cost_usd), 0)::double precision AS total
    FROM provider_runs
    WHERE created_at >= NOW() - INTERVAL '1 hour'
  `
  return toNumber(rows[0]?.total)
}

async function queryTenantSpendLastHour(tenantId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: number | null }>>`
    SELECT COALESCE(SUM(estimated_cost_usd), 0)::double precision AS total
    FROM provider_runs
    WHERE tenant_id = ${tenantId}
      AND created_at >= NOW() - INTERVAL '1 hour'
  `
  return toNumber(rows[0]?.total)
}

export async function getHourlySpend(tenantId?: string): Promise<SpendSnapshot> {
  const now = Date.now()

  if (tenantId) {
    const cached = spendCache.get(tenantId)
    if (cached && now - cached.at < CACHE_MS) return cached.snapshot
  } else if (globalCache && now - globalCache.at < CACHE_MS) {
    return { tenantSpendUsd: 0, globalSpendUsd: globalCache.globalSpendUsd }
  }

  const globalWasFresh = Boolean(globalCache && now - globalCache.at < CACHE_MS)
  const [globalSpendUsd, tenantSpendUsd] = await Promise.all([
    globalWasFresh ? Promise.resolve(globalCache!.globalSpendUsd) : queryGlobalSpendLastHour(),
    tenantId ? queryTenantSpendLastHour(tenantId) : Promise.resolve(0),
  ])

  // Only refresh the global cache timestamp when we actually re-queried. Resetting
  // `at` on reuse would let continuous per-tenant traffic keep the global figure
  // stale indefinitely (the breaker would lag well past the 30s window).
  if (!globalWasFresh) globalCache = { at: now, globalSpendUsd }
  const snapshot = { tenantSpendUsd, globalSpendUsd }
  if (tenantId) spendCache.set(tenantId, { at: now, snapshot })
  return snapshot
}

export async function checkSpendAllowed(tenantId: string): Promise<SpendGuardResult> {
  if (!isSpendGuardEnabled()) {
    return { ok: true, tenantSpendUsd: 0, globalSpendUsd: 0 }
  }

  const limits = getSpendLimits()
  const { tenantSpendUsd, globalSpendUsd } = await getHourlySpend(tenantId)

  if (limits.globalUsdPerHour > 0 && globalSpendUsd >= limits.globalUsdPerHour) {
    return {
      ok: false,
      status: 429,
      code: 'SPEND_LIMIT_EXCEEDED',
      error: 'Platform AI kullanım limitine ulaşıldı. Lütfen daha sonra tekrar deneyin.',
      scope: 'global',
      spendUsd: globalSpendUsd,
      limitUsd: limits.globalUsdPerHour,
    }
  }

  if (limits.tenantUsdPerHour > 0 && tenantSpendUsd >= limits.tenantUsdPerHour) {
    return {
      ok: false,
      status: 429,
      code: 'SPEND_LIMIT_EXCEEDED',
      error: 'Saatlik AI kullanım limitine ulaşıldı. Lütfen bir süre sonra tekrar deneyin.',
      scope: 'tenant',
      spendUsd: tenantSpendUsd,
      limitUsd: limits.tenantUsdPerHour,
    }
  }

  return { ok: true, tenantSpendUsd, globalSpendUsd }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}
