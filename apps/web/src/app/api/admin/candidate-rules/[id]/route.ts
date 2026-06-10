import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@gumrukyz/db'
import { z } from 'zod'
import { canManageTenant, requireApiUser } from '@/lib/auth'

const ReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
})

interface Params {
  params: Promise<{ id: string }>
}

/**
 * Approve or reject a candidate rule.
 *
 * Approval creates a `Rule` row with lifecycle APPROVED plus a legal citation.
 * It deliberately does NOT activate anything: `ALL_RULES` in @gumrukyz/rules
 * remains the only executable registry, so the engine implementation is still
 * a code change.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id: candidateId } = await params
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    if (!canManageTenant(user)) {
      return NextResponse.json({ error: 'Bu işlem için yetkiniz yok' }, { status: 403 })
    }

    const body = await req.json() as unknown
    const parsed = ReviewSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz işlem' }, { status: 400 })
    }

    const candidate = await prisma.candidateRule.findUnique({
      where: { id: candidateId },
      include: { sourceDocument: true },
    })
    if (!candidate) {
      return NextResponse.json({ error: 'Aday kural bulunamadı' }, { status: 404 })
    }
    if (candidate.status === 'APPROVED' || candidate.status === 'REJECTED') {
      return NextResponse.json(
        { error: 'Bu aday kural zaten sonuçlandırılmış' },
        { status: 409 },
      )
    }

    const reviewedAt = new Date()

    if (parsed.data.action === 'reject') {
      const updated = await prisma.$transaction(async (tx) => {
        const c = await tx.candidateRule.update({
          where: { id: candidateId },
          data: { status: 'REJECTED', reviewedBy: user.id, reviewedAt },
        })
        await tx.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            action: 'candidate_rule.rejected',
            entityType: 'CandidateRule',
            entityId: candidateId,
            beforeJson: { status: candidate.status },
            afterJson: { status: 'REJECTED' },
          },
        })
        return c
      })
      return NextResponse.json(updated)
    }

    // Approve: the draft code must still be free in the rules table.
    const existingRule = await prisma.rule.findUnique({
      where: { ruleCode: candidate.ruleCodeDraft },
    })
    if (existingRule) {
      return NextResponse.json(
        { error: `"${candidate.ruleCodeDraft}" kodlu bir kural zaten mevcut` },
        { status: 409 },
      )
    }

    const [name, ...descriptionRest] = candidate.description.split(' — ')
    const result = await prisma.$transaction(async (tx) => {
      const rule = await tx.rule.create({
        data: {
          ruleCode: candidate.ruleCodeDraft,
          name: (name ?? candidate.ruleCodeDraft).slice(0, 200),
          description: descriptionRest.length > 0 ? descriptionRest.join(' — ') : candidate.description,
          appliesToDocTypes: candidate.appliesToDocTypes,
          fieldChecks: candidate.fieldChecks,
          severity: candidate.severity,
          sourceDocumentId: candidate.sourceDocumentId,
          // Not ACTIVE: there is no engine implementation in ALL_RULES yet.
          lifecycleStatus: 'APPROVED',
        },
      })

      if (candidate.sourceDocument) {
        await tx.ruleLegalCitation.create({
          data: {
            ruleId: rule.id,
            sourceDocumentId: candidate.sourceDocument.id,
            excerpt: (candidate.extractedRationale ?? candidate.description).slice(0, 2000),
            url: candidate.sourceDocument.url,
          },
        })
      }

      const c = await tx.candidateRule.update({
        where: { id: candidateId },
        data: { status: 'APPROVED', reviewedBy: user.id, reviewedAt },
      })

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: 'candidate_rule.approved',
          entityType: 'CandidateRule',
          entityId: candidateId,
          beforeJson: { status: candidate.status },
          afterJson: { status: 'APPROVED', ruleId: rule.id, ruleCode: rule.ruleCode },
        },
      })

      return { candidate: c, ruleId: rule.id }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('PATCH /api/admin/candidate-rules/[id] error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
