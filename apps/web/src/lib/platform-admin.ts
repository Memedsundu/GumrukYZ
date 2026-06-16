import { NextResponse } from 'next/server'
import { notFound } from 'next/navigation'
import { getAuthenticatedUser, requireApiUser, type AuthenticatedUser } from '@/lib/auth'
import { isInternalOrg } from '@/lib/pilot'

/** Lower-cased, de-duplicated platform-admin email allowlist from env. */
export function getPlatformAdminEmails(): string[] {
  return (process.env['PLATFORM_ADMIN_EMAILS'] ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

export function isPlatformAdminEmail(email: string): boolean {
  return getPlatformAdminEmails().includes(email.trim().toLowerCase())
}

/**
 * Super-admin gate: requires BOTH an allowlisted email AND membership in the
 * internal Clerk org. Defense-in-depth on top of requireApiUser. Returns 404
 * (not 403) on failure so the console's existence is not disclosed.
 */
export function isPlatformAdmin(user: Pick<AuthenticatedUser, 'email' | 'tenant'>): boolean {
  return isPlatformAdminEmail(user.email) && isInternalOrg(user.tenant.clerkOrgId)
}

export type PlatformAdminResult =
  | { admin: { user: AuthenticatedUser; email: string }; response?: never }
  | { admin?: never; response: NextResponse }

/** API-route guard. Use at the top of every /api/platform/* handler. */
export async function requirePlatformAdmin(): Promise<PlatformAdminResult> {
  const result = await requireApiUser()
  if (result.response) {
    // Mask auth failures on platform routes as 404 too.
    return { response: NextResponse.json({ error: 'Bulunamadı' }, { status: 404 }) }
  }
  if (!isPlatformAdmin(result.user)) {
    return { response: NextResponse.json({ error: 'Bulunamadı' }, { status: 404 }) }
  }
  return { admin: { user: result.user, email: result.user.email.toLowerCase() } }
}

/** SSR page guard. Calls notFound() on failure. */
export async function requirePlatformAdminPage(): Promise<{
  user: AuthenticatedUser
  email: string
}> {
  const user = await getAuthenticatedUser()
  if (!isPlatformAdmin(user)) {
    notFound()
  }
  return { user, email: user.email.toLowerCase() }
}
