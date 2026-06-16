import { NextRequest, NextResponse } from 'next/server'
import { prisma, Prisma } from '@gumrukyz/db'
import { z } from 'zod'
import { SalesLeadKind } from '@gumrukyz/domain'
import { requireApiUser } from '@/lib/auth'
import { emailDomain } from '@/lib/subscription'

const CreateLeadSchema = z
  .object({
    kind: z.enum(['upgrade', 'contact', 'enterprise']).default('contact'),
    requestedPlan: z.string().max(32).optional(),
    message: z.string().max(2000).optional(),
  })
  .strict()

const KIND_MAP = {
  upgrade: SalesLeadKind.UPGRADE,
  contact: SalesLeadKind.CONTACT,
  enterprise: SalesLeadKind.ENTERPRISE,
} as const

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    const parsed = CreateLeadSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
    }

    const lead = await prisma.salesLead.create({
      data: {
        kind: KIND_MAP[parsed.data.kind],
        email: user.email,
        emailDomain: emailDomain(user.email),
        normalizedOrg: user.tenant.name,
        requestedPlan: parsed.data.requestedPlan ?? null,
        clerkUserId: user.clerkUserId,
        tenantId: user.tenantId,
        message: parsed.data.message ?? null,
        metadataJson: { plan: user.tenant.plan } as Prisma.InputJsonValue,
      },
    })

    // Surface for follow-up; replace with email/Slack notification when wired.
    console.info('sales-lead.created', {
      leadId: lead.id,
      kind: lead.kind,
      tenantId: user.tenantId,
    })

    return NextResponse.json({ ok: true, leadId: lead.id }, { status: 201 })
  } catch (err) {
    console.error('POST /api/sales-leads error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
