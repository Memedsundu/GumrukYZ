import { cookies } from 'next/headers'
import { prisma } from '@gumrukyz/db'
import { canManageTenant, getAuthenticatedUser } from '@/lib/auth'
import { getEntitlementsState } from '@/lib/entitlements'
import { AppShell } from './app-shell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser()
  const showAdminNav = canManageTenant(user)
  const initialCollapsed = (await cookies()).get('sidebar_collapsed')?.value === '1'
  const entitlement = await getEntitlementsState(user.tenantId).catch(() => null)

  const recentCases = (
    await prisma.submission.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: {
        id: true,
        title: true,
        status: true,
        _count: { select: { riskReports: true } },
      },
    })
  ).map((submission) => ({
    id: submission.id,
    title: submission.title,
    status: submission.status,
    hasReport: submission._count.riskReports > 0,
  }))

  return (
    <AppShell
      showAdmin={showAdminNav}
      recentCases={recentCases}
      initialCollapsed={initialCollapsed}
      entitlement={entitlement}
    >
      {children}
    </AppShell>
  )
}
