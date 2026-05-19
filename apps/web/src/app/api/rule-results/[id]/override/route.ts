import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@gumrukyz/db'
import { z } from 'zod'
import { canManageTenant, requireApiUser } from '@/lib/auth'

const OverrideSchema = z.object({
  reason: z.string().min(10, 'Neden en az 10 karakter olmalı').max(2000),
})

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: ruleResultId } = await params
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    // Only TENANT_MANAGER and PLATFORM_ADMIN can override
    if (!canManageTenant(user)) {
      return NextResponse.json({ error: 'Bu işlem için yetkiniz yok' }, { status: 403 })
    }

    const ruleResult = await prisma.ruleResult.findFirst({
      where: { id: ruleResultId, tenantId: user.tenantId },
    })
    if (!ruleResult) return NextResponse.json({ error: 'Kural sonucu bulunamadı' }, { status: 404 })

    if (ruleResult.result === 'PASS') {
      return NextResponse.json({ error: 'Geçen sonuç geçersiz kılınamaz' }, { status: 400 })
    }

    const body = await req.json() as unknown
    const parsed = OverrideSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçerli bir neden girin' }, { status: 400 })
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
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
