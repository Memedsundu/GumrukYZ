import { cookies } from 'next/headers'
import { canManageTenant, getAuthenticatedUser } from '@/lib/auth'
import { getEntitlementsState } from '@/lib/entitlements'
import { AppShell } from './app-shell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser()
  const showAdminNav = canManageTenant(user)
  const initialCollapsed = (await cookies()).get('sidebar_collapsed')?.value === '1'
  const entitlement = await getEntitlementsState(user.tenantId).catch(() => null)

  return (
    <AppShell showAdmin={showAdminNav} initialCollapsed={initialCollapsed} entitlement={entitlement}>
      {children}
    </AppShell>
  )
}
