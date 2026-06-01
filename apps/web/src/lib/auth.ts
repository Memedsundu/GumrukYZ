import { auth, clerkClient, currentUser } from '@clerk/nextjs/server'
import { prisma, Prisma } from '@gumrukyz/db'
import { NextResponse } from 'next/server'
import { forbidden, redirect } from 'next/navigation'
import {
  classificationsForOrg,
  tenantPlanForOrg,
} from '@/lib/pilot'

export const ADMIN_ROLES = ['TENANT_MANAGER', 'PLATFORM_ADMIN'] as const

export type AuthenticatedUser = Prisma.UserGetPayload<{
  include: { tenant: true }
}>

export function canManageTenant(user: Pick<AuthenticatedUser, 'role'>): boolean {
  return ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number])
}

async function findUserByClerkAndTenant(
  clerkUserId: string,
  tenantId: string,
): Promise<AuthenticatedUser | null> {
  return prisma.user.findUnique({
    where: {
      clerkUserId_tenantId: { clerkUserId, tenantId },
    },
    include: { tenant: true },
  })
}

async function ensureTenantForOrg(clerkOrgId: string, orgName: string) {
  return prisma.tenant.upsert({
    where: { clerkOrgId },
    update: { name: orgName },
    create: {
      clerkOrgId,
      name: orgName,
      plan: tenantPlanForOrg(clerkOrgId),
      dataClassificationAllowed: classificationsForOrg(clerkOrgId),
    },
  })
}

async function resolveOrgName(clerkOrgId: string): Promise<string> {
  try {
    const client = await clerkClient()
    const org = await client.organizations.getOrganization({ organizationId: clerkOrgId })
    return org.name
  } catch {
    return 'Pilot Firma'
  }
}

async function provisionUserForOrg(
  clerkUserId: string,
  clerkOrgId: string,
): Promise<AuthenticatedUser> {
  const clerkUser = await currentUser()
  const email = clerkUser?.primaryEmailAddress?.emailAddress
    ?? clerkUser?.emailAddresses[0]?.emailAddress

  if (!email) {
    throw new Error('Clerk hesabında e-posta adresi bulunamadı')
  }

  const orgName = await resolveOrgName(clerkOrgId)
  const tenant = await ensureTenantForOrg(clerkOrgId, orgName)

  return prisma.user.upsert({
    where: {
      clerkUserId_tenantId: { clerkUserId, tenantId: tenant.id },
    },
    update: { email },
    create: {
      clerkUserId,
      email,
      tenantId: tenant.id,
      role: 'TENANT_USER',
    },
    include: { tenant: true },
  })
}

async function findOrProvisionUser(
  clerkUserId: string,
  clerkOrgId: string,
): Promise<AuthenticatedUser> {
  const tenant = await prisma.tenant.findUnique({ where: { clerkOrgId } })
  if (tenant) {
    const existing = await findUserByClerkAndTenant(clerkUserId, tenant.id)
    if (existing) return existing
  }

  return provisionUserForOrg(clerkUserId, clerkOrgId)
}

export function userRoleLabel(role: string): string {
  if (role === 'PLATFORM_ADMIN') return 'Platform yöneticisi'
  if (role === 'TENANT_MANAGER') return 'Tenant yöneticisi'
  return 'Gümrük müşaviri'
}

export type AuthSession = {
  userId: string
  orgId: string
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const { userId, orgId } = await auth()
  if (!userId) return null
  if (!orgId) return null
  return { userId, orgId }
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  const session = await getAuthSession()
  if (!session) {
    const { userId } = await auth()
    if (!userId) redirect('/sign-in')
    redirect('/onboarding')
  }

  try {
    const user = await findOrProvisionUser(session.userId, session.orgId)
    if (!user.pilotConsentAt) {
      redirect('/pilot-consent')
    }
    return user
  } catch (err) {
    console.error('User provisioning failed:', err)
    forbidden()
  }

  forbidden()
}

export type ApiAuthResult =
  | { user: AuthenticatedUser; response?: never }
  | { user?: never; response: NextResponse }

/** API auth without pilot consent (for consent endpoint only). */
export async function requireProvisionedApiUser(): Promise<ApiAuthResult> {
  const { userId, orgId } = await auth()
  if (!userId) {
    return { response: NextResponse.json({ error: 'Oturum açmanız gerekiyor' }, { status: 401 }) }
  }
  if (!orgId) {
    return {
      response: NextResponse.json(
        { error: 'Devam etmek için bir organizasyon seçmeniz gerekiyor' },
        { status: 403 },
      ),
    }
  }

  try {
    const user = await findOrProvisionUser(userId, orgId)
    return { user }
  } catch (err) {
    console.error('API user provisioning failed:', err)
    return {
      response: NextResponse.json(
        { error: 'Kullanıcı hesabınız hazırlanamadı' },
        { status: 403 },
      ),
    }
  }
}

export async function requireApiUser(): Promise<ApiAuthResult> {
  const { userId, orgId } = await auth()
  if (!userId) {
    return { response: NextResponse.json({ error: 'Oturum açmanız gerekiyor' }, { status: 401 }) }
  }
  if (!orgId) {
    return {
      response: NextResponse.json(
        { error: 'Devam etmek için bir organizasyon seçmeniz gerekiyor' },
        { status: 403 },
      ),
    }
  }

  try {
    const user = await findOrProvisionUser(userId, orgId)
    if (!user.pilotConsentAt) {
      return {
        response: NextResponse.json(
          { error: 'Pilot kullanım koşullarını onaylamanız gerekiyor' },
          { status: 403 },
        ),
      }
    }
    return { user }
  } catch (err) {
    console.error('API user provisioning failed:', err)
    return {
      response: NextResponse.json(
        { error: 'Kullanıcı hesabınız hazırlanamadı' },
        { status: 403 },
      ),
    }
  }
}

/** For onboarding / consent routes — provisions user but does not require consent yet. */
export async function getProvisioningUser(): Promise<AuthenticatedUser> {
  const session = await getAuthSession()
  if (!session) {
    const { userId } = await auth()
    if (!userId) redirect('/sign-in')
    redirect('/onboarding')
  }

  try {
    return await findOrProvisionUser(session.userId, session.orgId)
  } catch (err) {
    console.error('User provisioning failed:', err)
    forbidden()
  }

  forbidden()
}
