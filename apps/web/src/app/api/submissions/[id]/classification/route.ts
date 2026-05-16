import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma, Prisma } from '@gumrukyz/db'
import { z } from 'zod'
import { FINAL_DOC_TYPES, normalizePartyName, normalizeTaxId } from '@/lib/classification'

const DocumentDecisionSchema = z.object({
  id: z.string().uuid(),
  docType: z.enum(FINAL_DOC_TYPES),
  isIgnored: z.boolean().default(false),
})

const ClientDecisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('none') }),
  z.object({ action: z.literal('existing'), brokerClientId: z.string().uuid() }),
  z.object({
    action: z.literal('create'),
    displayName: z.string().min(1).max(240),
    taxId: z.string().max(32).nullable().optional(),
    address: z.string().max(500).nullable().optional(),
    country: z.string().max(80).nullable().optional(),
  }),
])

const ClassificationValidationSchema = z.object({
  tradeFlow: z.enum(['IMPORT', 'EXPORT']),
  documents: z.array(DocumentDecisionSchema).min(1),
  client: ClientDecisionSchema.default({ action: 'none' }),
})

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { clerkUserId: userId },
      include: { tenant: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const body = await req.json() as unknown
    const parsed = ClassificationValidationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const submission = await prisma.submission.findFirst({
      where: { id: submissionId, tenantId: user.tenantId },
      include: { documents: true },
    })
    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

    if (
      submission.dataClassification === 'REAL' &&
      !user.tenant.dataClassificationAllowed.includes('REAL')
    ) {
      return NextResponse.json(
        { error: 'REAL client data is not allowed for this tenant' },
        { status: 403 },
      )
    }

    const documentIds = new Set(submission.documents.map((document) => document.id))
    const invalidDoc = parsed.data.documents.find((document) => !documentIds.has(document.id))
    if (invalidDoc) {
      return NextResponse.json({ error: 'Document does not belong to this submission' }, { status: 400 })
    }

    const brokerClientId = await resolveBrokerClientId({
      tenantId: user.tenantId,
      submissionId,
      decision: parsed.data.client,
    })

    await prisma.$transaction(async (tx) => {
      for (const document of parsed.data.documents) {
        await tx.document.update({
          where: { id: document.id },
          data: {
            docType: document.docType,
            label: docTypeLabel(document.docType),
            isIgnored: document.isIgnored,
            classificationValidatedAt: new Date(),
            classificationValidatedBy: user.id,
          },
        })
      }

      await tx.submission.update({
        where: { id: submissionId },
        data: {
          tradeFlow: parsed.data.tradeFlow,
          brokerClientId,
          classificationStatus: 'VALIDATED',
          classificationValidatedAt: new Date(),
          classificationValidatedBy: user.id,
          status: 'UPLOADED',
        },
      })

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: 'submission.classification_validated',
          entityType: 'Submission',
          entityId: submissionId,
          afterJson: parsed.data as Prisma.InputJsonValue,
        },
      })
    })

    return NextResponse.json({
      id: submissionId,
      tradeFlow: parsed.data.tradeFlow,
      brokerClientId,
      classificationStatus: 'VALIDATED',
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'Broker client not found') {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('PATCH /api/submissions/[id]/classification error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function resolveBrokerClientId(params: {
  tenantId: string
  submissionId: string
  decision: z.infer<typeof ClientDecisionSchema>
}): Promise<string | null> {
  if (params.decision.action === 'none') return null

  if (params.decision.action === 'existing') {
    const existing = await prisma.brokerClient.findFirst({
      where: { id: params.decision.brokerClientId, tenantId: params.tenantId },
      select: { id: true },
    })
    if (!existing) throw new Error('Broker client not found')
    return existing.id
  }

  const normalizedTaxId = normalizeTaxId(params.decision.taxId)
  const displayName = params.decision.displayName.trim()
  const normalizedName = normalizePartyName(displayName)
  if (normalizedTaxId) {
    const existing = await prisma.brokerClient.findFirst({
      where: { tenantId: params.tenantId, taxId: normalizedTaxId },
      select: { id: true },
    })
    if (existing) return existing.id
  }

  const created = await prisma.brokerClient.create({
    data: {
      tenantId: params.tenantId,
      displayName,
      normalizedName,
      taxId: normalizedTaxId,
      address: params.decision.address?.trim() || null,
      country: params.decision.country?.trim() || null,
      sourceSubmissionId: params.submissionId,
    },
    select: { id: true },
  })
  return created.id
}

function docTypeLabel(docType: string): string {
  const map: Record<string, string> = {
    INVOICE: 'Fatura',
    PACKING_LIST: 'Çeki listesi',
    LOADING_INSTRUCTION: 'Yükleme talimatı',
    TRANSPORT_DOC: 'Taşıma belgesi',
    DECLARATION_OUTPUT: 'Beyanname çıktısı',
    ORIGIN_DOC: 'Menşe belgesi',
    PERMIT_DOC: 'İzin/uygunluk belgesi',
    OTHER: 'Diğer belge',
  }
  return map[docType] ?? docType
}
