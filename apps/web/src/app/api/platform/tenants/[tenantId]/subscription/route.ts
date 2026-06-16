import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@gumrukyz/db'
import {
  BillingInterval,
  TenantPlan,
  TenantSubscriptionStatus,
} from '@gumrukyz/domain'
import { requirePlatformAdmin } from '@/lib/platform-admin'
import { applyPlanChange } from '@/lib/subscription'
import { getTenantEntitlements } from '@/lib/entitlements'

interface Params {
  params: Promise<{ tenantId: string }>
}

const PlanCodes = Object.values(TenantPlan) as [string, ...string[]]
const Statuses = Object.values(TenantSubscriptionStatus) as [string, ...string[]]
const Intervals = Object.values(BillingInterval) as [string, ...string[]]

const UpdateSchema = z
  .object({
    planCode: z.enum(PlanCodes),
    status: z.enum(Statuses).optional(),
    billingInterval: z.enum(Intervals).optional(),
    trialEndsAt: z.string().datetime().nullable().optional(),
    graceUntil: z.string().datetime().nullable().optional(),
    customNotes: z.string().max(4000).nullable().optional(),
    limitsOverride: z
      .object({
        analysesPerMonth: z.number().int().min(0).optional(),
        users: z.number().int().min(0).optional(),
        expertReviewsPerMonth: z.number().int().min(0).optional(),
        documentsPerSubmission: z.number().int().min(0).optional(),
      })
      .nullable()
      .optional(),
  })
  .strict()

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null
  )
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await params
    const guard = await requirePlatformAdmin()
    if (guard.response) return guard.response
    const { admin } = guard

    const parsed = UpdateSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz istek', issues: parsed.error.issues }, { status: 400 })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant bulunamadı' }, { status: 404 })
    }

    const subscription = await applyPlanChange({
      tenantId,
      planCode: parsed.data.planCode,
      status: parsed.data.status,
      billingInterval: parsed.data.billingInterval,
      customNotes: parsed.data.customNotes,
      limitsOverride: parsed.data.limitsOverride,
      trialEndsAt:
        parsed.data.trialEndsAt === undefined
          ? undefined
          : parsed.data.trialEndsAt === null
            ? null
            : new Date(parsed.data.trialEndsAt),
      graceUntil:
        parsed.data.graceUntil === undefined
          ? undefined
          : parsed.data.graceUntil === null
            ? null
            : new Date(parsed.data.graceUntil),
      actor: { userId: admin.user.id, ip: clientIp(req) },
    })

    const entitlement = await getTenantEntitlements(tenantId)
    return NextResponse.json({ subscription, entitlement })
  } catch (err) {
    console.error('PATCH /api/platform/tenants/[tenantId]/subscription error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
