import { getAuthenticatedUser } from '@/lib/auth'
import { prisma } from '@gumrukyz/db'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { Plus, FileText, AlertCircle, CheckCircle, Clock, Sparkles } from 'lucide-react'
import { getExpertReviewQuota } from '@/lib/expert-review-quota'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { submissionStatusConfig, tradeFlowConfig } from '@/lib/status'

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
      <PageHeader
        title="Kontrol paneli"
        description={`${user.tenant.name} — Aktif dosyalar ve son analizler`}
        actions={
          <Button asChild>
            <Link href="/submissions/new">
              <Plus />
              Yeni dosya
            </Link>
          </Button>
        }
      />

      {/* Stats */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={FileText} label="Toplam dosya" value={stats.total} tone="brand" />
        <StatCard icon={CheckCircle} label="Tamamlandı" value={stats.completed} tone="success" />
        <StatCard icon={Clock} label="İşleniyor" value={stats.pending} tone="warning" />
        <StatCard icon={AlertCircle} label="Hatalı" value={stats.failed} tone="danger" />
        <StatCard
          icon={Sparkles}
          label="Uzman yapay zeka hakkı"
          value={expertQuota.remaining}
          sub={`Bugün ${expertQuota.used}/${expertQuota.limit} kullanıldı`}
          tone="ai"
        />
      </div>

      {/* Submissions list */}
      <Card className="overflow-hidden">
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Son dosyalar</h2>
        </div>
        {submissions.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Henüz dosya yüklenmedi."
            action={
              <Button asChild variant="outline">
                <Link href="/submissions/new">İlk dosyayı oluştur →</Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Referans</TH>
                <TH>Tür</TH>
                <TH>Belgeler</TH>
                <TH>Durum</TH>
                <TH>Risk</TH>
                <TH>Tarih</TH>
              </TR>
            </THead>
            <TBody>
              {submissions.map((sub) => {
                const report = sub.riskReports[0]
                const status = submissionStatusConfig(sub.status)
                const flow = tradeFlowConfig(sub.tradeFlow)
                return (
                  <TR key={sub.id}>
                    <TD>
                      <Link
                        href={`/submissions/${sub.id}`}
                        className="font-medium text-brand-600 hover:text-brand-700"
                      >
                        {sub.title}
                      </Link>
                    </TD>
                    <TD>
                      <Badge tone={flow.tone}>{flow.label}</Badge>
                    </TD>
                    <TD className="text-ink-muted">{sub._count.documents} belge</TD>
                    <TD>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </TD>
                    <TD>
                      {report ? (
                        <div className="flex items-center gap-2 text-xs">
                          {report.totalErrors > 0 && (
                            <span className="font-medium text-danger-600">
                              {report.totalErrors} hata
                            </span>
                          )}
                          {report.totalWarnings > 0 && (
                            <span className="font-medium text-warning-600">
                              {report.totalWarnings} uyarı
                            </span>
                          )}
                          {report.totalErrors === 0 && report.totalWarnings === 0 && (
                            <span className="font-medium text-success-600">Temiz</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-ink-subtle">—</span>
                      )}
                    </TD>
                    <TD className="text-ink-muted">{formatDateTime(sub.createdAt)}</TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
