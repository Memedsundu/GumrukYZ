import { auth, currentUser } from '@clerk/nextjs/server'
import { prisma } from '@gumrukyz/db'
import { redirect } from 'next/navigation'

export async function getAuthenticatedUser() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const clerkUser = await currentUser()
  if (!clerkUser) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkUserId: userId },
    include: { tenant: true },
  })

  if (!user) {
    // Auto-provision user on first sign-in
    const internalTenant = await prisma.tenant.findFirst({
      where: { plan: 'internal' },
    })
    if (!internalTenant) {
      throw new Error('Internal tenant not found. Run: pnpm db:seed')
    }

    const newUser = await prisma.user.create({
      data: {
        clerkUserId: userId,
        email: clerkUser.emailAddresses[0]?.emailAddress ?? '',
        tenantId: internalTenant.id,
        role: 'PLATFORM_ADMIN',
      },
      include: { tenant: true },
    })
    return newUser
  }

  return user
}

export type AuthenticatedUser = Awaited<ReturnType<typeof getAuthenticatedUser>>
