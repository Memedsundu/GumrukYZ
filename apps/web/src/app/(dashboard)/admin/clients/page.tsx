import { canManageTenant, getAuthenticatedUser } from '@/lib/auth'
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
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Müşteri Kaydı</h1>
          <p className="mt-1 text-sm text-ink-muted">
            İthalatçı ve ihracatçı müşteri bilgileri. Beyanname dosyaları bu kayıtlara bağlanır.
          </p>
        </div>
        <Link
          href="/admin/clients/new"
          className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Yeni Müşteri
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-white px-6 py-12 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-ink-subtle" />
          <p className="text-sm font-medium text-ink">Henüz müşteri kaydı yok</p>
          <p className="mt-1 text-xs text-ink-muted">
            Müşteri eklemek için &ldquo;Yeni Müşteri&rdquo; butonunu kullanın.
          </p>
          <Link
            href="/admin/clients/new"
            className="mt-4 inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Yeni Müşteri Ekle
          </Link>
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
    </div>
  )
}
