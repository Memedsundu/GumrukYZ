import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@gumrukyz/db'
import { requirePlatformAdminPage } from '@/lib/platform-admin'
import { getTenantEntitlements } from '@/lib/entitlements'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { SubscriptionForm } from './subscription-form'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ tenantId: string }>
}

function formatDateTime(value: Date | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

export default async function PlatformTenantDetailPage({ params }: PageProps) {
  await requirePlatformAdminPage()
  const { tenantId } = await params

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { subscription: true, _count: { select: { users: true, submissions: true } } },
  })
  if (!tenant) notFound()

  const [entitlement, auditLogs] = await Promise.all([
    getTenantEntitlements(tenantId),
    prisma.auditLog.findMany({
      where: {
        tenantId,
        action: { in: ['subscription.plan_changed', 'subscription.trial_started'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
  ])

  const sub = tenant.subscription

  return (
    <PageShell>
      <PageHeader
        title={tenant.name}
        description={
          <Link href="/platform" className="text-brand-700 hover:underline">
            ← Tüm tenant&apos;lar
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Mevcut durum</CardTitle>
            <Badge tone={entitlement.readOnly ? 'danger' : 'success'}>
              {entitlement.readOnly ? 'Salt-okunur' : 'Aktif'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Paket" value={`${entitlement.publicName} (${entitlement.planCode})`} />
            <Row label="Abonelik durumu" value={entitlement.status} />
            <Row
              label="Deneme bitişi"
              value={sub?.trialEndsAt ? formatDateTime(sub.trialEndsAt) : '—'}
            />
            <Row label="Grace bitişi" value={sub?.graceUntil ? formatDateTime(sub.graceUntil) : '—'} />
            <Row
              label="Analiz (bu dönem)"
              value={`${entitlement.metrics.analysis.used} / ${entitlement.metrics.analysis.limit} · toplam çalıştırma ${entitlement.analysisRunsThisPeriod}`}
            />
            <Row
              label="Uzman inceleme"
              value={`${entitlement.metrics.expertReview.used} / ${entitlement.metrics.expertReview.limit}`}
            />
            <Row
              label="Kullanıcı"
              value={`${entitlement.metrics.users.used} / ${entitlement.metrics.users.limit}`}
            />
            <Row label="Sıfırlama" value={entitlement.resetDate ?? '—'} />
            {sub?.customNotes ? <Row label="Not" value={sub.customNotes} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aboneliği güncelle</CardTitle>
          </CardHeader>
          <CardContent>
            <SubscriptionForm
              tenantId={tenantId}
              initial={{
                planCode: sub?.planCode ?? tenant.plan,
                status: sub?.status ?? 'active',
                billingInterval: sub?.billingInterval ?? 'none',
                trialEndsAt: sub?.trialEndsAt ? sub.trialEndsAt.toISOString() : null,
                graceUntil: sub?.graceUntil ? sub.graceUntil.toISOString() : null,
                customNotes: sub?.customNotes ?? '',
              }}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Abonelik geçmişi</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Tarih</TH>
              <TH>İşlem</TH>
              <TH>Detay</TH>
            </TR>
          </THead>
          <TBody>
            {auditLogs.length === 0 ? (
              <TR>
                <TD colSpan={3} className="text-ink-muted">
                  Kayıt yok.
                </TD>
              </TR>
            ) : (
              auditLogs.map((log) => (
                <TR key={log.id}>
                  <TD className="whitespace-nowrap text-ink-muted">{formatDateTime(log.createdAt)}</TD>
                  <TD>{log.action}</TD>
                  <TD className="font-mono text-xs text-ink-muted">
                    {log.afterJson ? JSON.stringify(log.afterJson) : '—'}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </PageShell>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  )
}
