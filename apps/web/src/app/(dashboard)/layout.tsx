import { canManageTenant, getAuthenticatedUser, userRoleLabel } from '@/lib/auth'
import { OrganizationSwitcher } from '@clerk/nextjs'
import Link from 'next/link'
import { ShieldCheck, UserCircle } from 'lucide-react'
import { SidebarNav } from './sidebar-nav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser()
  const showAdminNav = canManageTenant(user)

  return (
    <div className="flex h-screen bg-canvas">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-line bg-surface">
        <div className="border-b border-line px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-brand-600 text-white">
              <ShieldCheck className="size-5 shrink-0" />
            </span>
            <span className="text-lg font-bold text-ink">GümrükYZ</span>
          </div>
          <div className="mt-3">
            <OrganizationSwitcher
              hidePersonal
              afterSelectOrganizationUrl="/dashboard"
              appearance={{
                elements: {
                  rootBox: 'w-full',
                  organizationSwitcherTrigger: 'w-full justify-between',
                },
              }}
            />
          </div>
          <p className="mt-2 truncate text-xs text-ink-subtle">{user.tenant.name}</p>
        </div>

        <SidebarNav showAdmin={showAdminNav} />

        <Link
          href="/profile"
          className="flex items-center border-t border-line px-5 py-4 transition-colors hover:bg-surface-muted"
        >
          <div className="flex size-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
            GY
          </div>
          <div className="ml-3 min-w-0">
            <div className="flex items-center text-sm font-medium text-ink">
              <UserCircle className="mr-1.5 size-4" />
              Profilim
            </div>
            <p className="truncate text-xs text-ink-subtle">{userRoleLabel(user.role)}</p>
          </div>
        </Link>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
