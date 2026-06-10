import { canManageTenant, getAuthenticatedUser } from '@/lib/auth'
import { PageShell } from '@/components/ui/page-shell'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { EmptyDossierIllustration } from '@/components/illustrations'
import { prisma } from '@gumrukyz/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { Users, Plus, FileText } from 'lucide-react'

export default async function AdminClientsPage() {
  const user = await getAuthenticatedUser()

  if (!canManageTenant(user)) {
    redirect('/dashboard')
  }

  const clients = await prisma.brokerClient.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { displayName: 'asc' },
    include: {
      _count: { select: { submissions: true } },
    },
  })

  return (
    <PageShell>
      <PageHeader
        title="Müşteri Kaydı"
        description="İthalatçı ve ihracatçı müşteri bilgileri. Beyanname dosyaları bu kayıtlara bağlanır."
        actions={
          <Button asChild>
            <Link href="/admin/clients/new">
              <Plus />
              Yeni Müşteri
            </Link>
          </Button>
        }
      />

      {clients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-white">
          <EmptyState
            illustration={<EmptyDossierIllustration />}
            title="Henüz müşteri kaydı yok"
            description="Müşteri eklemek için “Yeni Müşteri” butonunu kullanın."
            action={
              <Button asChild>
                <Link href="/admin/clients/new">
                  <Plus />
                  Yeni Müşteri Ekle
                </Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-surface-muted">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                  Müşteri Ünvanı
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                  Vergi No
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                  Ülke
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                  Dosyalar
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                  Kayıt Tarihi
                </th>
                <th className="relative px-6 py-3">
                  <span className="sr-only">İşlemler</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-surface-muted">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Users className="h-4 w-4 flex-shrink-0 text-ink-subtle" />
                      <span className="text-sm font-medium text-ink">{client.displayName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-ink-muted">
                    {client.taxId ?? <span className="text-ink-subtle">—</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-ink-muted">
                    {client.country ?? 'TR'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-sm text-ink-muted">
                      <FileText className="h-3.5 w-3.5 text-ink-subtle" />
                      {client._count.submissions}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-ink-muted">
                    {formatDateTime(client.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/clients/${client.id}`}
                      className="text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      Düzenle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  )
}
