import { cookies } from 'next/headers'
import { canManageTenant, getAuthenticatedUser } from '@/lib/auth'
import { AppShell } from './app-shell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser()
  const showAdminNav = canManageTenant(user)
  const initialCollapsed = (await cookies()).get('sidebar_collapsed')?.value === '1'

  return (
    <AppShell showAdmin={showAdminNav} initialCollapsed={initialCollapsed}>
      {children}
    </AppShell>
  )
}
