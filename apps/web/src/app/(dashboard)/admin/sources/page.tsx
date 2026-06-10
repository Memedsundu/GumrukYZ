import { canManageTenant, getAuthenticatedUser } from '@/lib/auth'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { StatuteBookIllustration } from '@/components/illustrations'
import { prisma } from '@gumrukyz/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { CheckCircle, XCircle, AlertCircle, FileText, Globe } from 'lucide-react'
import { getLegalContextReadiness, isExpertReviewEnabled } from '@/lib/expert-review'

function VerificationBadge({ status }: { status: string }) {
  if (status === 'OFFICIAL_SNAPSHOT') {
    return (
      <Badge tone="success">
        <CheckCircle />
        Snapshot
      </Badge>
    )
  }
  if (status === 'OFFICIAL_FETCHED_NO_BLOB') {
    return (
      <Badge tone="info">
        <Globe />
        Fetched
      </Badge>
    )
  }
  if (status === 'FETCH_FAILED') {
    return (
      <Badge tone="danger">
        <XCircle />
        Erişilemiyor
      </Badge>
    )
  }
  return (
    <Badge tone="neutral">
      <AlertCircle />
      Yalnızca meta
    </Badge>
  )
}

export default async function AdminSourcesPage() {
  const user = await getAuthenticatedUser()

  if (!canManageTenant(user)) {
    redirect('/dashboard')
  }

  const [sources, legalContextReadiness] = await Promise.all([
    prisma.sourceDocument.findMany({
      orderBy: [{ verificationStatus: 'asc' }, { title: 'asc' }],
      include: {
        _count: { select: { regulationChunks: true } },
      },
    }),
    getLegalContextReadiness(),
  ])

  const snapshotCount = sources.filter((s) => s.verificationStatus === 'OFFICIAL_SNAPSHOT').length
  const failedCount = sources.filter((s) => s.verificationStatus === 'FETCH_FAILED').length
  const totalChunks = sources.reduce((sum, s) => sum + s._count.regulationChunks, 0)
  const expertReviewEnabled = isExpertReviewEnabled()

  return (
    <PageShell>
      <PageHeader
        title="Mevzuat Kaynakları"
        description="Sisteme yüklü mevzuat kaynaklarının durumu. Kurallar bu kaynaklara dayanmaktadır."
      />

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="text-xs text-ink-muted">Toplam Kaynak</p>
          <p className="text-2xl font-bold text-ink">{sources.length}</p>
        </div>
        <div className="rounded-lg border border-success-100 bg-success-50 p-4">
          <p className="text-xs text-ink-muted">Snapshot Alındı</p>
          <p className="text-2xl font-bold text-success-700">{snapshotCount}</p>
        </div>
        <div className="rounded-lg border border-danger-100 bg-danger-50 p-4">
          <p className="text-xs text-ink-muted">Erişilemiyor</p>
          <p className="text-2xl font-bold text-danger-700">{failedCount}</p>
        </div>
        <div className="rounded-lg border border-brand-100 bg-brand-50 p-4">
          <p className="text-xs text-ink-muted">Toplam Chunk</p>
          <p className="text-2xl font-bold text-brand-700">{totalChunks}</p>
        </div>
      </div>

      {failedCount > 0 && (
        <div className="mb-6 rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700">
          <span className="font-medium">{failedCount} kaynak erişilemiyor.</span>{' '}
          Ağ bağlantısı düzelince{' '}
          <code className="rounded bg-warning-100 px-1 text-xs">pnpm --filter @gumrukyz/db ingest-regulations</code>{' '}
          komutunu yeniden çalıştırın.
        </div>
      )}

      {expertReviewEnabled && legalContextReadiness.missingRequiredSources.length > 0 && (
        <div className="mb-6 rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
          <span className="font-medium">Yapay zeka uzman incelemesi mevzuat bağlamı eksik.</span>{' '}
          Eksik veya embedding olmayan kaynaklar: {legalContextReadiness.missingRequiredSources.join(', ')}.{' '}
          <code className="rounded bg-danger-100 px-1 text-xs">pnpm db:bootstrap-regulations</code>{' '}
          komutunu çalıştırın.
        </div>
      )}

      {/* Sources table */}
      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <table className="min-w-full divide-y divide-line">
          <thead className="bg-surface-muted">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                Kaynak
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                Durum
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                Chunk
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                Son Doğrulama
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                Blob
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sources.map((source) => (
              <tr key={source.id} className="hover:bg-surface-muted">
                <td className="px-6 py-4">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-subtle" />
                    <div>
                      <p className="text-sm font-medium text-ink">{source.title}</p>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block truncate text-xs text-brand-600 hover:text-brand-700"
                        style={{ maxWidth: '400px' }}
                      >
                        {source.url}
                      </a>
                      <div className="mt-1 flex gap-2">
                        <span className="text-xs text-ink-subtle">{source.jurisdiction}</span>
                        <span className="text-xs text-ink-subtle">·</span>
                        <span className="text-xs text-ink-subtle">{source.language.toUpperCase()}</span>
                        {source.effectiveDate && (
                          <>
                            <span className="text-xs text-ink-subtle">·</span>
                            <span className="text-xs text-ink-subtle">
                              {new Date(source.effectiveDate).getFullYear()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <VerificationBadge status={source.verificationStatus ?? 'SOURCE_METADATA_ONLY'} />
                </td>
                <td className="px-6 py-4 text-sm text-ink">
                  {source._count.regulationChunks > 0 ? (
                    <span className="font-medium">{source._count.regulationChunks}</span>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-ink-muted">
                  {source.lastVerifiedAt ? formatDateTime(source.lastVerifiedAt) : '—'}
                </td>
                <td className="px-6 py-4">
                  {source.snapshotBlobUrl ? (
                    <CheckCircle className="h-4 w-4 text-success-500" />
                  ) : (
                    <span className="text-xs text-ink-subtle">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sources.length === 0 && (
          <EmptyState
            illustration={<StatuteBookIllustration />}
            title="Henüz kaynak içeri aktarılmadı."
            description={
              <>
                <code className="font-mono text-xs">pnpm --filter @gumrukyz/db ingest-regulations</code>{' '}
                komutunu çalıştırın.
              </>
            }
            className="py-12"
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Link href="/admin/rules" className="text-sm text-ink-muted hover:text-ink-muted">
          ← Kural Yönetimi
        </Link>
        <p className="text-xs text-ink-subtle">
          Kaynaklar yalnızca okuma amaçlıdır. Güncellemek için ingest scriptini çalıştırın.
        </p>
      </div>
    </PageShell>
  )
}
