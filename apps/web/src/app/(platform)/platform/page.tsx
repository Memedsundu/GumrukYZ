import Link from 'next/link'
import { prisma } from '@gumrukyz/db'
import { isPurchasablePlan, PLAN_CATALOG } from '@gumrukyz/domain'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { ReconcileButton } from './reconcile-button'

export const dynamic = 'force-dynamic'

function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'active':
      return 'success'
    case 'trialing':
      return 'info'
    case 'grace':
      return 'warning'
    case 'trial_expired':
    case 'suspended':
    case 'canceled':
      return 'danger'
    default:
      return 'neutral'
  }
}

function planLabel(code: string): string {
  return isPurchasablePlan(code) ? PLAN_CATALOG[code].publicName : code
}

function formatDate(value: Date | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value)
}

export default async function PlatformTenantsPage() {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      subscription: true,
      _count: { select: { users: true, submissions: true } },
    },
  })

  return (
    <PageShell>
      <PageHeader
        title="Tenant'lar"
        description={`${tenants.length} organizasyon · abonelik, deneme ve kullanım durumu`}
        actions={<ReconcileButton />}
      />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Organizasyon</TH>
              <TH>Paket</TH>
              <TH>Durum</TH>
              <TH>Deneme bitişi</TH>
              <TH>Kullanıcı</TH>
              <TH>Dosya</TH>
            </TR>
          </THead>
          <TBody>
            {tenants.map((tenant) => {
              const sub = tenant.subscription
              const planCode = sub?.planCode ?? tenant.plan
              const status = sub?.status ?? 'active'
              return (
                <TR key={tenant.id}>
                  <TD>
                    <Link
                      href={`/platform/tenants/${tenant.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {tenant.name}
                    </Link>
                  </TD>
                  <TD>{planLabel(planCode)}</TD>
                  <TD>
                    <Badge tone={statusTone(status)}>{status}</Badge>
                  </TD>
                  <TD className="text-ink-muted">{formatDate(sub?.trialEndsAt ?? null)}</TD>
                  <TD className="text-ink-muted">{tenant._count.users}</TD>
                  <TD className="text-ink-muted">{tenant._count.submissions}</TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      </Card>
    </PageShell>
  )
}
