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
          <h1 className="text-2xl font-bold text-gray-900">Müşteri Kaydı</h1>
          <p className="mt-1 text-sm text-gray-500">
            İthalatçı ve ihracatçı müşteri bilgileri. Beyanname dosyaları bu kayıtlara bağlanır.
          </p>
        </div>
        <Link
          href="/admin/clients/new"
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Yeni Müşteri
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm font-medium text-gray-900">Henüz müşteri kaydı yok</p>
          <p className="mt-1 text-xs text-gray-500">
            Müşteri eklemek için &ldquo;Yeni Müşteri&rdquo; butonunu kullanın.
          </p>
          <Link
            href="/admin/clients/new"
            className="mt-4 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Yeni Müşteri Ekle
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Müşteri Ünvanı
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Vergi No
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Ülke
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Dosyalar
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Kayıt Tarihi
                </th>
                <th className="relative px-6 py-3">
                  <span className="sr-only">İşlemler</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Users className="h-4 w-4 flex-shrink-0 text-gray-400" />
                      <span className="text-sm font-medium text-gray-900">{client.displayName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {client.taxId ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {client.country ?? 'TR'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                      <FileText className="h-3.5 w-3.5 text-gray-400" />
                      {client._count.submissions}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDateTime(client.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/clients/${client.id}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800"
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
