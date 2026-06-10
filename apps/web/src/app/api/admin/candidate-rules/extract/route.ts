import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@gumrukyz/db'
import { z } from 'zod'
import { canManageTenant, requireApiUser } from '@/lib/auth'
import { extractCandidateRules } from '@/lib/candidate-rule-extraction'

const ExtractSchema = z.object({
  sourceDocumentId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    if (!canManageTenant(user)) {
      return NextResponse.json({ error: 'Bu işlem için yetkiniz yok' }, { status: 403 })
    }

    const body = await req.json() as unknown
    const parsed = ExtractSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçerli bir kaynak belge seçin' }, { status: 400 })
    }

    const result = await extractCandidateRules({
      sourceDocumentId: parsed.data.sourceDocumentId,
      tenantId: user.tenantId,
    })

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'candidate_rules.extracted',
        entityType: 'SourceDocument',
        entityId: parsed.data.sourceDocumentId,
        afterJson: {
          providerRunId: result.providerRunId,
          createdCount: result.createdCount,
          skippedCodes: result.skippedCodes,
        },
      },
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('POST /api/admin/candidate-rules/extract error:', err)
    return NextResponse.json(
      { error: 'Aday kural çıkarımı başarısız oldu' },
      { status: 500 },
    )
  }
}
