import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@gumrukyz/db'
import { requireProvisionedApiUser } from '@/lib/auth'
import { isInternalOrg, PILOT_DISCLAIMER_VERSION } from '@/lib/pilot'
import { createTrialForTenant } from '@/lib/subscription'

const ConsentSchema = z.object({
  disclaimerVersion: z.string().min(1),
}).strict()

export async function POST(req: NextRequest) {
  const authResult = await requireProvisionedApiUser()
  if (authResult.response) return authResult.response
  const { user } = authResult

  const body = await req.json() as unknown
  const parsed = ConsentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
  }

  if (parsed.data.disclaimerVersion !== PILOT_DISCLAIMER_VERSION) {
    return NextResponse.json(
      { error: 'Güncel koşul sürümü ile onaylayın', currentVersion: PILOT_DISCLAIMER_VERSION },
      { status: 409 },
    )
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { pilotConsentAt: new Date() },
    select: { id: true, pilotConsentAt: true },
  })

  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      action: 'PILOT_CONSENT_ACCEPTED',
      entityType: 'user',
      entityId: user.id,
      afterJson: { disclaimerVersion: PILOT_DISCLAIMER_VERSION },
    },
  })

  // Start the 14-day Firma trial for new commercial tenants on terms acceptance.
  // Internal org is exempt; existing tenants with a subscription are a no-op.
  let trial: { status: 'created' | 'existing' | 'blocked'; reason?: string } | undefined
  if (!isInternalOrg(user.tenant.clerkOrgId)) {
    try {
      const result = await createTrialForTenant({
        tenantId: user.tenantId,
        ownerEmail: user.email,
        orgName: user.tenant.name,
        clerkUserId: user.clerkUserId,
      })
      trial =
        result.kind === 'blocked'
          ? { status: 'blocked', reason: result.reason }
          : { status: result.kind }
    } catch (err) {
      console.error('createTrialForTenant failed:', err)
    }
  }

  return NextResponse.json({ ok: true, pilotConsentAt: updated.pilotConsentAt, trial })
}
