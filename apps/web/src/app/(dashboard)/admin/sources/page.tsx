import { getAuthenticatedUser } from '@/lib/auth'
import { prisma } from '@gumrukyz/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { CheckCircle, XCircle, AlertCircle, FileText, Globe } from 'lucide-react'

function VerificationBadge({ status }: { status: string }) {
  if (status === 'OFFICIAL_SNAPSHOT') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle className="h-3 w-3" />
        Snapshot
      </span>
    )
  }
  if (status === 'OFFICIAL_FETCHED_NO_BLOB') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
        <Globe className="h-3 w-3" />
        Fetched
      </span>
    )
  }
  if (status === 'FETCH_FAILED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        <XCircle className="h-3 w-3" />
        Erişilemiyor
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
      <AlertCircle className="h-3 w-3" />
      Yalnızca meta
    </span>
  )
}

export default async function AdminSourcesPage() {
  const user = await getAuthenticatedUser()

  if (!['TENANT_MANAGER', 'PLATFORM_ADMIN'].includes(user.role)) {
    redirect('/dashboard')
  }

  const sources = await prisma.sourceDocument.findMany({
    orderBy: [{ verificationStatus: 'asc' }, { title: 'asc' }],
    include: {
      _count: { select: { regulationChunks: true } },
    },
  })

  const snapshotCount = sources.filter((s) => s.verificationStatus === 'OFFICIAL_SNAPSHOT').length
  const failedCount = sources.filter((s) => s.verificationStatus === 'FETCH_FAILED').length
  const totalChunks = sources.reduce((sum, s) => sum + s._count.regulationChunks, 0)

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Mevzuat Kaynakları</h1>
        <p className="mt-1 text-sm text-gray-500">
          Sisteme yüklü mevzuat kaynaklarının durumu. Kurallar bu kaynaklara dayanmaktadır.
        </p>
      </div>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Toplam Kaynak</p>
          <p className="text-2xl font-bold text-gray-900">{sources.length}</p>
        </div>
        <div className="rounded-lg border border-green-100 bg-green-50 p-4">
          <p className="text-xs text-gray-500">Snapshot Alındı</p>
          <p className="text-2xl font-bold text-green-700">{snapshotCount}</p>
        </div>
        <div className="rounded-lg border border-red-100 bg-red-50 p-4">
          <p className="text-xs text-gray-500">Erişilemiyor</p>
          <p className="text-2xl font-bold text-red-700">{failedCount}</p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs text-gray-500">Toplam Chunk</p>
          <p className="text-2xl font-bold text-blue-700">{totalChunks}</p>
        </div>
      </div>

      {failedCount > 0 && (
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <span className="font-medium">{failedCount} kaynak erişilemiyor.</span>{' '}
          Ağ bağlantısı düzelince{' '}
          <code className="rounded bg-yellow-100 px-1 text-xs">pnpm --filter @gumrukyz/db ingest-regulations</code>{' '}
          komutunu yeniden çalıştırın.
        </div>
      )}

      {/* Sources table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Kaynak
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Durum
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Chunk
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Son Doğrulama
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Blob
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sources.map((source) => (
              <tr key={source.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{source.title}</p>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block truncate text-xs text-blue-600 hover:text-blue-800"
                        style={{ maxWidth: '400px' }}
                      >
                        {source.url}
                      </a>
                      <div className="mt-1 flex gap-2">
                        <span className="text-xs text-gray-400">{source.jurisdiction}</span>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-xs text-gray-400">{source.language.toUpperCase()}</span>
                        {source.effectiveDate && (
                          <>
                            <span className="text-xs text-gray-400">·</span>
                            <span className="text-xs text-gray-400">
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
                <td className="px-6 py-4 text-sm text-gray-900">
                  {source._count.regulationChunks > 0 ? (
                    <span className="font-medium">{source._count.regulationChunks}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {source.lastVerifiedAt ? formatDateTime(source.lastVerifiedAt) : '—'}
                </td>
                <td className="px-6 py-4">
                  {source.snapshotBlobUrl ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sources.length === 0 && (
          <div className="px-6 py-12 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500">
              Henüz kaynak içeri aktarılmadı.
            </p>
            <p className="mt-1 text-xs text-gray-400">
              <code>pnpm --filter @gumrukyz/db ingest-regulations</code> komutunu çalıştırın.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Link href="/admin/rules" className="text-sm text-gray-500 hover:text-gray-700">
          ← Kural Yönetimi
        </Link>
        <p className="text-xs text-gray-400">
          Kaynaklar yalnızca okuma amaçlıdır. Güncellemek için ingest scriptini çalıştırın.
        </p>
      </div>
    </div>
  )
}
