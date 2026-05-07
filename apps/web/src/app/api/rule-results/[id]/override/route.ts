import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@gumrukyz/db'
import { z } from 'zod'

const OverrideSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(2000),
})

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: ruleResultId } = await params
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Only TENANT_MANAGER and PLATFORM_ADMIN can override
    if (!['TENANT_MANAGER', 'PLATFORM_ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions to override' }, { status: 403 })
    }

    const ruleResult = await prisma.ruleResult.findFirst({
      where: { id: ruleResultId, tenantId: user.tenantId },
    })
    if (!ruleResult) return NextResponse.json({ error: 'Rule result not found' }, { status: 404 })

    if (ruleResult.result === 'PASS') {
      return NextResponse.json({ error: 'Cannot override a passing result' }, { status: 400 })
    }

    const body = await req.json() as unknown
    const parsed = OverrideSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const override = await prisma.$transaction(async (tx) => {
      const ov = await tx.overrideAction.create({
        data: {
          ruleResultId,
          tenantId: user.tenantId,
          overriddenBy: user.id,
          reason: parsed.data.reason,
          originalResult: ruleResult.result,
          newResult: 'PASS',
        },
      })

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: 'rule_result.overridden',
          entityType: 'RuleResult',
          entityId: ruleResultId,
          beforeJson: { result: ruleResult.result },
          afterJson: { result: 'PASS', reason: parsed.data.reason },
        },
      })

      return ov
    })

    return NextResponse.json(override, { status: 201 })
  } catch (err) {
    console.error('POST /api/rule-results/[id]/override error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
