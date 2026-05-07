import { getAuthenticatedUser } from '@/lib/auth'
import { prisma } from '@gumrukyz/db'
import { redirect } from 'next/navigation'
import { formatDateTime } from '@/lib/utils'
import { CheckCircle, Clock, XCircle, BookOpen } from 'lucide-react'

export default async function AdminRulesPage() {
  const user = await getAuthenticatedUser()

  if (!['TENANT_MANAGER', 'PLATFORM_ADMIN'].includes(user.role)) {
    redirect('/dashboard')
  }

  const rules = await prisma.rule.findMany({
    orderBy: [{ lifecycleStatus: 'asc' }, { ruleCode: 'asc' }],
    include: {
      sourceDocument: true,
      _count: { select: { results: true } },
    },
  })

  const candidateRules = await prisma.candidateRule.findMany({
    orderBy: { createdAt: 'desc' },
    include: { sourceDocument: true },
  })

  const activeRules = rules.filter((r) => r.lifecycleStatus === 'ACTIVE')
  const deprecatedRules = rules.filter((r) => r.lifecycleStatus === 'DEPRECATED')

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Kural Yönetimi</h1>
        <p className="mt-1 text-sm text-gray-500">
          Aktif kurallar, aday kurallar ve kural yaşam döngüsü yönetimi
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Aktif Kural</p>
          <p className="text-2xl font-bold text-green-600">{activeRules.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Aday Kural</p>
          <p className="text-2xl font-bold text-yellow-600">{candidateRules.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Devre Dışı</p>
          <p className="text-2xl font-bold text-gray-400">{deprecatedRules.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Toplam Çalışma</p>
          <p className="text-2xl font-bold text-blue-600">
            {rules.reduce((sum, r) => sum + r._count.results, 0)}
          </p>
        </div>
      </div>

      {/* Active rules */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Aktif Kurallar ({activeRules.length})</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Kod</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Ad</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Şiddet</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Belge Türleri</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Kaynak</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Çalışma</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Fixtures</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {activeRules.map((rule) => (
              <tr key={rule.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <span className="font-mono text-sm text-gray-700">{rule.ruleCode}</span>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">{rule.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{rule.description}</p>
                </td>
                <td className="px-6 py-4">
                  <SeverityBadge severity={rule.severity} />
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {rule.appliesToDocTypes.map((t) => (
                      <span key={t} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4">
                  {rule.sourceDocument ? (
                    <a
                      href={rule.sourceDocument.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                    >
                      <BookOpen className="h-3 w-3" />
                      {rule.sourceDocument.jurisdiction}
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-gray-600">{rule._count.results}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-1">
                    {rule.fixturePassRef ? (
                      <CheckCircle className="h-4 w-4 text-green-500" title="Pass fixture" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400" title="Missing pass fixture" />
                    )}
                    {rule.fixtureFailRef ? (
                      <CheckCircle className="h-4 w-4 text-green-500" title="Fail fixture" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400" title="Missing fail fixture" />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Candidate rules */}
      {candidateRules.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50">
          <div className="border-b border-yellow-200 px-6 py-4">
            <h2 className="text-base font-semibold text-yellow-900">
              Aday Kurallar ({candidateRules.length})
            </h2>
            <p className="mt-1 text-xs text-yellow-700">
              Bu kurallar aktif değildir. Kaynak bağlandıktan ve fixture'lar eklendikten sonra onaylanabilir.
            </p>
          </div>
          <div className="divide-y divide-yellow-100">
            {candidateRules.map((rule) => (
              <div key={rule.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-gray-600">{rule.ruleCodeDraft}</span>
                      <CandidateStatusBadge status={rule.status} />
                    </div>
                    <p className="mt-1 text-sm text-gray-700">{rule.description}</p>
                    {rule.extractedRationale && (
                      <p className="mt-1 text-xs text-gray-500">{rule.extractedRationale}</p>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatDateTime(rule.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    ERROR: 'bg-red-100 text-red-700',
    WARNING: 'bg-yellow-100 text-yellow-700',
    INFO: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[severity] ?? 'bg-gray-100 text-gray-600'}`}>
      {severity}
    </span>
  )
}

function CandidateStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    DRAFT: { label: 'Taslak', className: 'bg-gray-100 text-gray-600' },
    IN_REVIEW: { label: 'İncelemede', className: 'bg-yellow-100 text-yellow-700' },
    APPROVED: { label: 'Onaylandı', className: 'bg-green-100 text-green-700' },
    REJECTED: { label: 'Reddedildi', className: 'bg-red-100 text-red-700' },
  }
  const cfg = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
