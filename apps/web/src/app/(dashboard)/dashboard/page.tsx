import { canManageTenant, getAuthenticatedUser } from '@/lib/auth'
import { prisma } from '@gumrukyz/db'
import Link from 'next/link'
import { cn, formatDateTime } from '@/lib/utils'
import {
  Plus,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  Sparkles,
  ArrowRight,
  Settings,
  Users,
} from 'lucide-react'
import { getExpertReviewQuota } from '@/lib/expert-review-quota'
import { getEntitlementsState } from '@/lib/entitlements'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { PageShell } from '@/components/ui/page-shell'
import { EmptyDossierIllustration } from '@/components/illustrations'
import { submissionStatusConfig, tradeFlowConfig } from '@/lib/status'
import { submissionResumeHref } from '@/lib/submission-status'

export default async function DashboardPage() {
  const user = await getAuthenticatedUser()
  const isAdmin = canManageTenant(user)

  const submissions = await prisma.submission.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      _count: { select: { documents: true } },
      riskReports: { orderBy: { generatedAt: 'desc' }, take: 1 },
    },
  })

  const pendingStatuses = [
    'PENDING',
    'UPLOADED',
    'CLASSIFYING',
    'AWAITING_VALIDATION',
    'EXTRACTING',
    'NORMALIZING',
    'RUNNING_RULES',
    'AI_RULE_VALIDATING',
    'GENERATING_REPORT',
  ]
  const stats = {
    total: submissions.length,
    completed: submissions.filter((s) => s.status === 'COMPLETED').length,
    failed: submissions.filter((s) => s.status === 'FAILED').length,
    pending: submissions.filter((s) => pendingStatuses.includes(s.status)).length,
  }
  const openErrors = submissions.reduce((sum, s) => sum + (s.riskReports[0]?.totalErrors ?? 0), 0)
  const openWarnings = submissions.reduce((sum, s) => sum + (s.riskReports[0]?.totalWarnings ?? 0), 0)

  const expertQuota = await getExpertReviewQuota(user.tenantId)
  const quotaPct = expertQuota.limit > 0 ? Math.round((expertQuota.used / expertQuota.limit) * 100) : 0

  const entitlement = await getEntitlementsState(user.tenantId)
  const analysisMetric = entitlement.metrics.analysis
  const analysisPct =
    analysisMetric.limit > 0 ? Math.round((analysisMetric.used / analysisMetric.limit) * 100) : 0

  return (
    <PageShell>
      {/* Hero band */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-6 text-white shadow-card sm:p-8">
        {/* ambient mesh — decorative only, stays inside the band */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-16 -top-20 size-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 right-32 size-56 rounded-full bg-accent-500/15 blur-3xl" />
          <div className="absolute -left-20 top-1/2 size-48 rounded-full bg-brand-500/30 blur-3xl" />
        </div>
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/80">Hoş geldiniz</p>
            <h1 className="mt-1 truncate font-display text-2xl font-bold tracking-tight sm:text-3xl">{user.tenant.name}</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/80">
              Aktif dosyalarınızı, risk analizlerini ve Uzman İncelemelerini tek ekrandan yönetin.
            </p>
            <Link
              href="/submissions/new"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 shadow-sm transition-colors hover:bg-white/90"
            >
              <Plus className="size-4" />
              Yeni dosya
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:max-w-md lg:w-80">
            <HeroStat label="Toplam" value={stats.total} />
            <HeroStat label="İşleniyor" value={stats.pending} />
            <HeroStat label="Açık hata" value={openErrors} accent={openErrors > 0} />
          </div>
        </div>
      </section>

      {/* Stat row */}
      <div className="grid animate-fade-rise gap-5 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={FileText} label="Toplam dosya" value={stats.total} tone="brand" />
        <StatCard icon={CheckCircle} label="Tamamlandı" value={stats.completed} tone="success" />
        <StatCard icon={Clock} label="İşleniyor" value={stats.pending} tone="warning" />
        <StatCard icon={AlertCircle} label="Hatalı" value={stats.failed} tone="danger" />
        <StatCard
          icon={Sparkles}
          label="Uzman İncelemesi hakkı"
          value={expertQuota.remaining}
          sub={`Bu ay ${expertQuota.used}/${expertQuota.limit} kullanıldı`}
          tone="ai"
        />
      </div>

      {/* Recent files + side panel */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Son dosyalar</CardTitle>
            {openWarnings > 0 && (
              <Badge tone="warning">{openWarnings} açık uyarı</Badge>
            )}
          </CardHeader>
          {submissions.length === 0 ? (
            <EmptyState
              illustration={<EmptyDossierIllustration />}
              title="Henüz dosya yüklenmedi."
              description="İlk gümrük dosyanızı oluşturup belgeleri yükleyin; analiz otomatik başlar."
              action={
                <Button asChild>
                  <Link href="/submissions/new">
                    <Plus />
                    İlk dosyayı oluştur
                  </Link>
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
                          href={submissionResumeHref(sub.id, sub.status, Boolean(report))}
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
                              <span className="font-medium text-danger-600">{report.totalErrors} hata</span>
                            )}
                            {report.totalWarnings > 0 && (
                              <span className="font-medium text-warning-600">{report.totalWarnings} uyarı</span>
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

        <aside className="space-y-6">
          {/* Plan & usage */}
          <Card>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-ink">{entitlement.publicName} paketi</div>
                {entitlement.isTrial ? <Badge tone="info">Deneme</Badge> : null}
              </div>
              {entitlement.isTrial && entitlement.trial ? (
                <p className="mt-1 text-xs text-ink-muted">{entitlement.trial.daysLeft} gün kaldı</p>
              ) : null}
              <p className="mt-3 text-3xl font-bold tracking-tight text-ink">
                {analysisMetric.used}
                <span className="ml-1 text-base font-medium text-ink-subtle">
                  / {analysisMetric.limit} analiz
                </span>
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-300',
                    analysisPct >= 90 ? 'bg-danger-500' : analysisPct >= 70 ? 'bg-warning-500' : 'bg-brand-500',
                  )}
                  style={{ width: `${Math.min(100, analysisPct)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-ink-subtle">
                {entitlement.isTrial
                  ? 'Aynı dosyanın yeniden analizleri deneme hakkından düşmez.'
                  : `Sıfırlama: ${entitlement.resetDate ?? '—'}`}
              </p>
            </CardContent>
          </Card>

          {/* Expert quota */}
          <Card>
            <CardContent>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Sparkles className="size-4 text-ai-600" />
                Uzman İncelemesi hakkı
              </div>
              <p className="mt-3 text-3xl font-bold tracking-tight text-ink">
                {expertQuota.remaining}
                <span className="ml-1 text-base font-medium text-ink-subtle">/ {expertQuota.limit}</span>
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-300',
                    quotaPct >= 80 ? 'bg-accent-500' : 'bg-ai-500',
                  )}
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-ink-subtle">Bu ay {expertQuota.used} hak kullanıldı.</p>
            </CardContent>
          </Card>

          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardTitle>Hızlı işlemler</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-3">
              <QuickLink href="/submissions/new" icon={Plus} label="Yeni dosya oluştur" />
              {isAdmin && <QuickLink href="/admin/rules" icon={Settings} label="Kural Yönetimi" />}
              {isAdmin && <QuickLink href="/admin/clients" icon={Users} label="Müşteri Kaydı" />}
            </CardContent>
          </Card>
        </aside>
      </div>
    </PageShell>
  )
}

function HeroStat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl px-3 py-3 text-center backdrop-blur-sm ring-1 ring-inset',
        accent ? 'bg-danger-500/25 ring-white/25' : 'bg-white/10 ring-white/10',
      )}
    >
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-0.5 text-xs text-white/75">{label}</p>
    </div>
  )
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: typeof Plus
  label: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-surface-muted text-ink-muted group-hover:bg-surface group-hover:text-brand-600">
        <Icon className="size-4" />
      </span>
      <span className="flex-1">{label}</span>
      <ArrowRight className="size-4 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
