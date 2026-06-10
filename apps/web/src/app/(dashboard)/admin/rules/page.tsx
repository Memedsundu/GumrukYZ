import { canManageTenant, getAuthenticatedUser } from '@/lib/auth'
import { PageShell } from '@/components/ui/page-shell'
import { prisma } from '@gumrukyz/db'
import { redirect } from 'next/navigation'
import { formatDateTime } from '@/lib/utils'
import { CheckCircle, XCircle, BookOpen } from 'lucide-react'
import {
  CandidateRuleReviewActions,
  ExtractCandidateRulesForm,
} from './candidate-rule-actions'

export default async function AdminRulesPage() {
  const user = await getAuthenticatedUser()

  if (!canManageTenant(user)) {
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

  const sourceDocuments = await prisma.sourceDocument.findMany({
    orderBy: { title: 'asc' },
    select: { id: true, title: true },
  })

  const activeRules = rules.filter((r) => r.lifecycleStatus === 'ACTIVE')
  const deprecatedRules = rules.filter((r) => r.lifecycleStatus === 'DEPRECATED')

  return (
    <PageShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Kural Yönetimi</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Aktif kurallar, aday kurallar ve kural yaşam döngüsü yönetimi
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="text-xs text-ink-muted">Aktif Kural</p>
          <p className="text-2xl font-bold text-success-600">{activeRules.length}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="text-xs text-ink-muted">Aday Kural</p>
          <p className="text-2xl font-bold text-warning-600">{candidateRules.length}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="text-xs text-ink-muted">Devre Dışı</p>
          <p className="text-2xl font-bold text-ink-subtle">{deprecatedRules.length}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="text-xs text-ink-muted">Toplam Çalışma</p>
          <p className="text-2xl font-bold text-brand-600">
            {rules.reduce((sum, r) => sum + r._count.results, 0)}
          </p>
        </div>
      </div>

      {/* Active rules */}
      <div className="mb-6 rounded-lg border border-line bg-white">
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Aktif Kurallar ({activeRules.length})</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-ink-muted">Kod</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-ink-muted">Ad</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-ink-muted">Şiddet</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-ink-muted">Belge Türleri</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-ink-muted">Kaynak</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-ink-muted">Çalışma</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-ink-muted">Fixtures</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {activeRules.map((rule) => (
              <tr key={rule.id} className="hover:bg-surface-muted">
                <td className="px-6 py-4">
                  <span className="font-mono text-sm text-ink-muted">{rule.ruleCode}</span>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-ink">{rule.name}</p>
                  <p className="text-xs text-ink-muted mt-0.5 line-clamp-1">{rule.description}</p>
                </td>
                <td className="px-6 py-4">
                  <SeverityBadge severity={rule.severity} />
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {rule.appliesToDocTypes.map((t) => (
                      <span key={t} className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">
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
                      className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                    >
                      <BookOpen className="h-3 w-3" />
                      {rule.sourceDocument.jurisdiction}
                    </a>
                  ) : (
                    <span className="text-xs text-ink-subtle">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-ink-muted">{rule._count.results}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-1">
                    {rule.fixturePassRef ? (
                      <CheckCircle className="h-4 w-4 text-success-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-danger-500" />
                    )}
                    {rule.fixtureFailRef ? (
                      <CheckCircle className="h-4 w-4 text-success-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-danger-500" />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Candidate rule extraction */}
      <div className="mb-6">
        <ExtractCandidateRulesForm sources={sourceDocuments} />
      </div>

      {/* Candidate rules */}
      {candidateRules.length > 0 && (
        <div className="rounded-lg border border-warning-200 bg-warning-50">
          <div className="border-b border-warning-200 px-6 py-4">
            <h2 className="text-base font-semibold text-warning-700">
              Aday Kurallar ({candidateRules.length})
            </h2>
            <p className="mt-1 text-xs text-warning-700">
              Bu kurallar aktif değildir. Kaynak bağlandıktan ve fixture&apos;lar eklendikten sonra onaylanabilir.
            </p>
          </div>
          <div className="divide-y divide-warning-100">
            {candidateRules.map((rule) => (
              <div key={rule.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-ink-muted">{rule.ruleCodeDraft}</span>
                      <CandidateStatusBadge status={rule.status} />
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">{rule.description}</p>
                    {rule.extractedRationale && (
                      <p className="mt-1 text-xs text-ink-muted">{rule.extractedRationale}</p>
                    )}
                    {(rule.appliesToDocTypes.length > 0 || rule.aiConfidence != null) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {rule.appliesToDocTypes.map((t) => (
                          <span key={t} className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">
                            {t}
                          </span>
                        ))}
                        {rule.aiConfidence != null && (
                          <span className="text-xs text-ink-subtle">
                            Güven: %{Math.round(rule.aiConfidence * 100)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-xs text-ink-subtle">
                      {formatDateTime(rule.createdAt)}
                    </div>
                    {(rule.status === 'DRAFT' || rule.status === 'IN_REVIEW') && (
                      <CandidateRuleReviewActions candidateId={rule.id} />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    ERROR: 'bg-danger-100 text-danger-700',
    WARNING: 'bg-warning-100 text-warning-700',
    INFO: 'bg-surface-muted text-ink-muted',
  }
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[severity] ?? 'bg-surface-muted text-ink-muted'}`}>
      {severity}
    </span>
  )
}

function CandidateStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    DRAFT: { label: 'Taslak', className: 'bg-surface-muted text-ink-muted' },
    IN_REVIEW: { label: 'İncelemede', className: 'bg-warning-100 text-warning-700' },
    APPROVED: { label: 'Onaylandı', className: 'bg-success-100 text-success-700' },
    REJECTED: { label: 'Reddedildi', className: 'bg-danger-100 text-danger-700' },
  }
  const cfg = map[status] ?? { label: status, className: 'bg-surface-muted text-ink-muted' }
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
