import { canManageTenant, getAuthenticatedUser } from '@/lib/auth'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { prisma } from '@gumrukyz/db'
import { redirect } from 'next/navigation'
import { ScrollText } from 'lucide-react'

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Oluşturuldu',
  UPDATE: 'Güncellendi',
  DELETE: 'Silindi',
  OVERRIDE: 'Geçersiz Kılındı',
  'submission.created': 'Dosya Oluşturuldu',
  'rule.override': 'Kural Geçersiz Kılındı',
}

const ACTION_TONES: Record<string, BadgeProps['tone']> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  OVERRIDE: 'accent',
  'submission.created': 'success',
  'rule.override': 'accent',
}

interface PageProps {
  searchParams: Promise<{ action?: string; resource?: string; page?: string }>
}

export default async function AuditPage({ searchParams }: PageProps) {
  const user = await getAuthenticatedUser()

  if (!canManageTenant(user)) {
    redirect('/dashboard')
  }

  const sp = await searchParams
  const filterAction = sp.action ?? ''
  const filterResource = sp.resource ?? ''
  const page = Math.max(1, parseInt(sp.page ?? '1', 10))
  const pageSize = 50

  const where = {
    tenantId: user.tenantId,
    ...(filterAction && { action: filterAction }),
    ...(filterResource && { entityType: filterResource }),
  }

  const [logs, total, resourceTypes] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({
      by: ['entityType'],
      where: { tenantId: user.tenantId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
  ])

  // Fetch user emails for actors
  const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean) as string[])]
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true },
      })
    : []
  const userEmailMap = new Map(users.map((u) => [u.id, u.email]))

  const totalPages = Math.ceil(total / pageSize)

  return (
    <PageShell>
      <PageHeader
        title="Denetim Günlüğü"
        description="Tüm değişikliklerin kayıtları. Müşteri ve kural değişikliklerini takip edin."
      />

      {/* Filters */}
      <form method="GET" className="mb-6 flex flex-wrap gap-3">
        <select
          name="action"
          defaultValue={filterAction}
          className="rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="">Tüm İşlemler</option>
          {Object.entries(ACTION_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <select
          name="resource"
          defaultValue={filterResource}
          className="rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="">Tüm Kaynaklar</option>
          {resourceTypes.map((rt) => (
            <option key={rt.entityType} value={rt.entityType}>{rt.entityType}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink"
        >
          Filtrele
        </button>
        {(filterAction || filterResource) && (
          <a
            href="/admin/audit"
            className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-muted"
          >
            Temizle
          </a>
        )}
        <span className="ml-auto flex items-center text-sm text-ink-muted">
          {total.toLocaleString('tr')} kayıt
        </span>
      </form>

      {/* Log table */}
      <div className="overflow-hidden rounded-lg border border-line bg-white">
        {logs.length === 0 ? (
          <EmptyState icon={ScrollText} title="Denetim kaydı bulunamadı." className="py-12" />
        ) : (
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-surface-muted">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                  Tarih
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                  İşlem
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                  Kaynak
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                  Kimlik
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                  Kullanıcı
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-surface-muted">
                  <td className="px-6 py-3 text-xs text-ink-muted whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('tr-TR', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-6 py-3">
                    <Badge tone={ACTION_TONES[log.action] ?? 'neutral'}>
                      {ACTION_LABELS[log.action] ?? log.action}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-sm text-ink-muted">{log.entityType}</td>
                  <td className="px-6 py-3 text-xs font-mono text-ink-muted">
                    {log.entityId.slice(0, 8)}…
                  </td>
                  <td className="px-6 py-3 text-sm text-ink-muted">
                    {log.userId
                      ? (userEmailMap.get(log.userId) ?? log.userId.slice(0, 8))
                      : <span className="text-ink-subtle">Sistem</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-ink-muted">
            Sayfa {page} / {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/admin/audit?action=${filterAction}&resource=${filterResource}&page=${page - 1}`}
                className="rounded border border-line-strong px-3 py-1 text-sm text-ink-muted hover:bg-surface-muted"
              >
                ← Önceki
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/admin/audit?action=${filterAction}&resource=${filterResource}&page=${page + 1}`}
                className="rounded border border-line-strong px-3 py-1 text-sm text-ink-muted hover:bg-surface-muted"
              >
                Sonraki →
              </a>
            )}
          </div>
        </div>
      )}
    </PageShell>
  )
}
