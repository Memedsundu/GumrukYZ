import { auth } from '@clerk/nextjs/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  Settings,
  ShieldCheck,
  Globe,
  Users,
  Activity,
  ScrollText,
} from 'lucide-react'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-16 items-center border-b border-gray-200 px-6">
          <ShieldCheck className="mr-2 h-6 w-6 text-blue-600" />
          <span className="text-lg font-bold text-gray-900">GümrükYZ</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <Link
            href="/dashboard"
            className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
          >
            <LayoutDashboard className="mr-3 h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/submissions/new"
            className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
          >
            <FileText className="mr-3 h-4 w-4" />
            Yeni Dosya
          </Link>

          {/* Admin section */}
          <div className="pt-3">
            <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Yönetim
            </p>
            <Link
              href="/admin/rules"
              className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            >
              <Settings className="mr-3 h-4 w-4" />
              Kural Yönetimi
            </Link>
            <Link
              href="/admin/sources"
              className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            >
              <Globe className="mr-3 h-4 w-4" />
              Mevzuat Kaynakları
            </Link>
            <Link
              href="/admin/clients"
              className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            >
              <Users className="mr-3 h-4 w-4" />
              Müşteri Kaydı
            </Link>
            <Link
              href="/admin/observability"
              className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            >
              <Activity className="mr-3 h-4 w-4" />
              Sağlayıcı Takibi
            </Link>
            <Link
              href="/admin/audit"
              className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            >
              <ScrollText className="mr-3 h-4 w-4" />
              Denetim Günlüğü
            </Link>
          </div>
        </nav>

        <div className="flex items-center border-t border-gray-200 px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
            GY
          </div>
          <span className="ml-3 text-sm text-gray-700">Hesabım</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
