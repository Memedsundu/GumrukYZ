import { canManageTenant, getAuthenticatedUser } from '@/lib/auth'
import { PageShell } from '@/components/ui/page-shell'
import { prisma } from '@gumrukyz/db'
import { redirect } from 'next/navigation'
import { Activity, TrendingUp, AlertCircle, DollarSign } from 'lucide-react'

interface ProviderStats {
  provider: string
  total: number
  errors: number
  totalCostUsd: number | null
  avgDurationMs: number | null
}

interface DailyRun {
  day: Date
  count: number
  errors: number
}

interface RawProviderStats {
  provider: string
  total: unknown
  errors: unknown
  totalCostUsd?: unknown
  totalcostusd?: unknown
  avgDurationMs?: unknown
  avgdurationms?: unknown
}

interface RawDailyRun {
  day: Date | string
  count: unknown
  errors: unknown
}

function formatCost(usd: number | null): string {
  if (usd == null) return '—'
  if (usd < 0.01) return `$${(usd * 100).toFixed(2)}¢`
  return `$${usd.toFixed(4)}`
}

function formatMs(ms: number | null): string {
  if (ms == null) return '—'
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
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
    if (typeof decimalLike.toNumber === 'function') {
      const parsed = decimalLike.toNumber()
      return Number.isFinite(parsed) ? parsed : 0
    }
    if (typeof decimalLike.toString === 'function') {
      const parsed = Number(decimalLike.toString())
      return Number.isFinite(parsed) ? parsed : 0
    }
  }
  return 0
}

function toNullableNumber(value: unknown): number | null {
  if (value == null) return null
  return toNumber(value)
}

function normalizeProviderStats(rows: RawProviderStats[]): ProviderStats[] {
  return rows.map((row) => ({
    provider: row.provider,
    total: toNumber(row.total),
    errors: toNumber(row.errors),
    totalCostUsd: toNullableNumber(row.totalCostUsd ?? row.totalcostusd),
    avgDurationMs: toNullableNumber(row.avgDurationMs ?? row.avgdurationms),
  }))
}

function normalizeDailyRuns(rows: RawDailyRun[]): DailyRun[] {
  return rows.map((row) => ({
    day: row.day instanceof Date ? row.day : new Date(row.day),
    count: toNumber(row.count),
    errors: toNumber(row.errors),
  }))
}

export default async function ObservabilityPage() {
  const user = await getAuthenticatedUser()

  if (!canManageTenant(user)) {
    redirect('/dashboard')
  }

  const [providerStatsRaw, last7DaysRaw, recentErrors, totalJobStats] = await Promise.all([
    // Provider-level aggregates
    prisma.$queryRaw<RawProviderStats[]>`
      SELECT
        provider,
        COUNT(*)::integer AS total,
        SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END)::integer AS errors,
        COALESCE(SUM(estimated_cost_usd), 0)::double precision AS "totalCostUsd",
        AVG(duration_ms)::double precision AS "avgDurationMs"
      FROM provider_runs
      WHERE tenant_id = ${user.tenantId}
      GROUP BY provider
      ORDER BY COUNT(*) DESC
    `,

    // Daily run counts for last 7 days
    prisma.$queryRaw<RawDailyRun[]>`
      SELECT
        date_trunc('day', created_at) AS day,
        COUNT(*)::integer AS count,
        SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END)::integer AS errors
      FROM provider_runs
      WHERE tenant_id = ${user.tenantId}
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY date_trunc('day', created_at)
      ORDER BY day ASC
    `,

    // Recent errors
    prisma.providerRun.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'ERROR',
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        provider: true,
        model: true,
        operation: true,
        errorMessage: true,
        createdAt: true,
        durationMs: true,
      },
    }),

    // Job stats
    prisma.processingJob.groupBy({
      by: ['status'],
      where: { tenantId: user.tenantId },
      _count: { id: true },
    }),
  ])

  const providerStats = normalizeProviderStats(providerStatsRaw)
  const last7Days = normalizeDailyRuns(last7DaysRaw)

  const totalCost = providerStats.reduce((sum, s) => sum + (s.totalCostUsd ?? 0), 0)
  const totalRuns = providerStats.reduce((sum, s) => sum + s.total, 0)
  const totalErrors = providerStats.reduce((sum, s) => sum + s.errors, 0)
  const errorRate = totalRuns > 0 ? ((totalErrors / totalRuns) * 100).toFixed(1) : '0'

  const jobCounts = Object.fromEntries(totalJobStats.map((s) => [s.status, s._count.id]))
  const totalJobs = totalJobStats.reduce((sum, s) => sum + s._count.id, 0)

  return (
    <PageShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Sağlayıcı Takibi</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Yapay zeka sağlayıcıları ve işlem maliyetleri. Gerçek zamanlı veriler.
        </p>
      </div>

      {/* Top-level stats */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-line bg-white p-4">
          <div className="flex items-center gap-2 text-ink-muted">
            <Activity className="h-4 w-4" />
            <span className="text-xs">Toplam İstek</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">{totalRuns.toLocaleString('tr')}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-4">
          <div className="flex items-center gap-2 text-ink-muted">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs">Tahmini Maliyet</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">${totalCost.toFixed(4)}</p>
        </div>
        <div className="rounded-lg border border-danger-100 bg-danger-50 p-4">
          <div className="flex items-center gap-2 text-danger-500">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs">Hata Oranı</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-danger-700">{errorRate}%</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-4">
          <div className="flex items-center gap-2 text-ink-muted">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs">Toplam İşlem</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">{totalJobs}</p>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {jobCounts['COMPLETED'] ?? 0} tamamlandı · {jobCounts['FAILED'] ?? 0} başarısız
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Provider breakdown */}
        <div className="rounded-lg border border-line bg-white">
          <div className="border-b border-line px-6 py-4">
            <h2 className="text-sm font-semibold text-ink">Sağlayıcı Bazında Kullanım</h2>
          </div>
          {providerStats.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-ink-subtle">
              Henüz veri yok. İlk işlemi başlatın.
            </div>
          ) : (
            <table className="min-w-full">
              <thead>
                <tr className="bg-surface-muted text-xs font-medium uppercase tracking-wider text-ink-muted">
                  <th className="px-6 py-3 text-left">Sağlayıcı</th>
                  <th className="px-6 py-3 text-right">İstek</th>
                  <th className="px-6 py-3 text-right">Hata</th>
                  <th className="px-6 py-3 text-right">Maliyet</th>
                  <th className="px-6 py-3 text-right">Ort. Süre</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {providerStats.map((stat) => (
                  <tr key={stat.provider} className="hover:bg-surface-muted">
                    <td className="px-6 py-3 text-sm font-medium text-ink capitalize">
                      {stat.provider}
                    </td>
                    <td className="px-6 py-3 text-right text-sm text-ink-muted">
                      {stat.total.toLocaleString('tr')}
                    </td>
                    <td className="px-6 py-3 text-right text-sm">
                      <span className={stat.errors > 0 ? 'text-danger-600 font-medium' : 'text-ink-subtle'}>
                        {stat.errors}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-sm text-ink-muted">
                      {formatCost(stat.totalCostUsd)}
                    </td>
                    <td className="px-6 py-3 text-right text-sm text-ink-muted">
                      {formatMs(stat.avgDurationMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent errors */}
        <div className="rounded-lg border border-line bg-white">
          <div className="border-b border-line px-6 py-4">
            <h2 className="text-sm font-semibold text-ink">Son Hatalar</h2>
          </div>
          {recentErrors.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-success-600">
              Son dönemde hata yok.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {recentErrors.map((run) => (
                <div key={run.id} className="px-6 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-ink capitalize">
                        {run.provider} · {run.operation}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-danger-600">
                        {run.errorMessage ?? 'Bilinmeyen hata'}
                      </p>
                    </div>
                    <time className="flex-shrink-0 text-xs text-ink-subtle">
                      {new Date(run.createdAt).toLocaleString('tr-TR', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 7-day trend */}
      {last7Days.length > 0 && (
        <div className="mt-6 rounded-lg border border-line bg-white">
          <div className="border-b border-line px-6 py-4">
            <h2 className="text-sm font-semibold text-ink">Son 7 Gün — Günlük İstek</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-surface-muted text-xs font-medium uppercase tracking-wider text-ink-muted">
                  <th className="px-6 py-3 text-left">Tarih</th>
                  <th className="px-6 py-3 text-right">İstek</th>
                  <th className="px-6 py-3 text-right">Hata</th>
                  <th className="px-6 py-3 text-right">Başarı Oranı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {last7Days.map((row) => {
                  const count = row.count
                  const errors = row.errors
                  const successRate = count > 0 ? (((count - errors) / count) * 100).toFixed(0) : '—'
                  return (
                    <tr key={row.day.toISOString()}>
                      <td className="px-6 py-3 text-sm text-ink">
                        {new Date(row.day).toLocaleDateString('tr-TR', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-3 text-right text-sm text-ink-muted">{count}</td>
                      <td className="px-6 py-3 text-right text-sm">
                        <span className={errors > 0 ? 'text-danger-600' : 'text-ink-subtle'}>{errors}</span>
                      </td>
                      <td className="px-6 py-3 text-right text-sm text-ink-muted">
                        {successRate !== '—' ? `%${successRate}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageShell>
  )
}
