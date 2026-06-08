import { getAuthenticatedUser } from '@/lib/auth'
import { prisma } from '@gumrukyz/db'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { Plus, FileText, AlertCircle, CheckCircle, Clock, Sparkles } from 'lucide-react'
import { getExpertReviewQuota } from '@/lib/expert-review-quota'

export default async function DashboardPage() {
  const user = await getAuthenticatedUser()

  const submissions = await prisma.submission.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      _count: { select: { documents: true } },
      riskReports: { orderBy: { generatedAt: 'desc' }, take: 1 },
    },
  })

  const stats = {
    total: submissions.length,
    completed: submissions.filter((s) => s.status === 'COMPLETED').length,
    failed: submissions.filter((s) => s.status === 'FAILED').length,
    pending: submissions.filter((s) =>
      [
        'PENDING',
        'UPLOADED',
        'CLASSIFYING',
        'AWAITING_VALIDATION',
        'EXTRACTING',
        'NORMALIZING',
        'RUNNING_RULES',
        'AI_RULE_VALIDATING',
        'GENERATING_REPORT',
      ].includes(s.status),
    ).length,
  }
  const expertQuota = await getExpertReviewQuota(user.tenantId)

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kontrol paneli</h1>
          <p className="mt-1 text-sm text-gray-500">
            {user.tenant.name} — Aktif dosyalar ve son analizler
          </p>
        </div>
        <Link
          href="/submissions/new"
          className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Yeni dosya
        </Link>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center">
            <FileText className="h-8 w-8 text-blue-500" />
            <div className="ml-4">
              <p className="text-sm text-gray-500">Toplam dosya</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div className="ml-4">
              <p className="text-sm text-gray-500">Tamamlandı</p>
              <p className="text-2xl font-bold text-gray-900">{stats.completed}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-yellow-500" />
            <div className="ml-4">
              <p className="text-sm text-gray-500">İşleniyor</p>
              <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <div className="ml-4">
              <p className="text-sm text-gray-500">Hatalı</p>
              <p className="text-2xl font-bold text-gray-900">{stats.failed}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-indigo-100 bg-white p-5">
          <div className="flex items-center">
            <Sparkles className="h-8 w-8 text-indigo-500" />
            <div className="ml-4">
              <p className="text-sm text-gray-500">Uzman yapay zeka hakkı</p>
              <p className="text-2xl font-bold text-gray-900">{expertQuota.remaining}</p>
              <p className="text-xs text-gray-500">Bugün {expertQuota.used}/{expertQuota.limit} kullanıldı</p>
            </div>
          </div>
        </div>
      </div>

      {/* Submissions list */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Son dosyalar</h2>
        </div>
        {submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-gray-300" />
            <p className="mt-4 text-sm text-gray-500">Henüz dosya yüklenmedi.</p>
            <Link
              href="/submissions/new"
              className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              İlk dosyayı oluştur →
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Referans
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Tür
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Belgeler
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Durum
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Risk
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Tarih
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {submissions.map((sub) => {
                const report = sub.riskReports[0]
                return (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link
                        href={`/submissions/${sub.id}`}
                        className="font-medium text-blue-600 hover:text-blue-700"
                      >
                        {sub.title}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        sub.tradeFlow === 'IMPORT'
                          ? 'bg-purple-100 text-purple-700'
                          : sub.tradeFlow === 'EXPORT'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}>
                        {sub.tradeFlow === 'IMPORT' ? 'İthalat' : sub.tradeFlow === 'EXPORT' ? 'İhracat' : 'Doğrulanmadı'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {sub._count.documents} belge
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-6 py-4">
                      {report ? (
                        <div className="flex items-center gap-2 text-xs">
                          {report.totalErrors > 0 && (
                            <span className="font-medium text-red-600">{report.totalErrors} hata</span>
                          )}
                          {report.totalWarnings > 0 && (
                            <span className="font-medium text-yellow-600">{report.totalWarnings} uyarı</span>
                          )}
                          {report.totalErrors === 0 && report.totalWarnings === 0 && (
                            <span className="font-medium text-green-600">Temiz</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {formatDateTime(sub.createdAt)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    PENDING: { label: 'Bekliyor', className: 'bg-gray-100 text-gray-600' },
    UPLOADED: { label: 'Yüklendi', className: 'bg-blue-100 text-blue-600' },
    CLASSIFYING: { label: 'Sınıflandırılıyor', className: 'bg-blue-100 text-blue-600' },
    AWAITING_VALIDATION: { label: 'Doğrulama Bekliyor', className: 'bg-slate-100 text-slate-700' },
    EXTRACTING: { label: 'Çıkarılıyor', className: 'bg-blue-100 text-blue-600' },
    NORMALIZING: { label: 'Normalleştiriliyor', className: 'bg-blue-100 text-blue-600' },
    RUNNING_RULES: { label: 'Kural Çalışıyor', className: 'bg-yellow-100 text-yellow-600' },
    AI_RULE_VALIDATING: { label: 'Yapay zeka kural kontrolü', className: 'bg-purple-100 text-purple-700' },
    EXPERT_REVIEWING: { label: 'Uzman yapay zeka incelemesi', className: 'bg-indigo-100 text-indigo-700' },
    GENERATING_REPORT: { label: 'Rapor Üretiliyor', className: 'bg-yellow-100 text-yellow-600' },
    COMPLETED: { label: 'Tamamlandı', className: 'bg-green-100 text-green-600' },
    FAILED: { label: 'Başarısız', className: 'bg-red-100 text-red-600' },
  }
  const cfg = config[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
