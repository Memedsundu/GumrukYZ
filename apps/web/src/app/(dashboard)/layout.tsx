import { UserButton } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileText, LayoutDashboard, Settings, ShieldCheck } from 'lucide-react'

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

        <nav className="flex-1 space-y-1 px-3 py-4">
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
          <Link
            href="/admin/rules"
            className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
          >
            <Settings className="mr-3 h-4 w-4" />
            Kural Yönetimi
          </Link>
        </nav>

        <div className="flex items-center border-t border-gray-200 px-6 py-4">
          <UserButton afterSignOutUrl="/sign-in" />
          <span className="ml-3 text-sm text-gray-700">Hesabım</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
