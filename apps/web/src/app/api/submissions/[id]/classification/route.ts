import { NextRequest, NextResponse } from 'next/server'
import { prisma, Prisma } from '@gumrukyz/db'
import { z } from 'zod'
import { FINAL_DOC_TYPES, normalizePartyName, normalizeTaxId } from '@/lib/classification'
import { requireApiUser } from '@/lib/auth'
import { isProcessingActive } from '@/lib/processing-runner'

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
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    const body = await req.json() as unknown
    const parsed = ClassificationValidationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Sınıflandırma doğrulama bilgileri geçersiz' }, { status: 400 })
    }

    const submission = await prisma.submission.findFirst({
      where: { id: submissionId, tenantId: user.tenantId },
      include: { documents: true },
    })
    if (!submission) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 404 })
    if (isProcessingActive(submission.status) || submission.classificationStatus === 'RUNNING') {
      return NextResponse.json({ error: 'İşlem devam ederken sınıflandırma güncellenemez' }, { status: 409 })
    }

    if (
      submission.dataClassification === 'REAL' &&
      !user.tenant.dataClassificationAllowed.includes('REAL')
    ) {
      return NextResponse.json(
        { error: 'Bu tenant gerçek dosya oluşturmak için yapılandırılmamış' },
        { status: 403 },
      )
    }

    const documentIds = new Set(submission.documents.map((document) => document.id))
    const invalidDoc = parsed.data.documents.find((document) => !documentIds.has(document.id))
    if (invalidDoc) {
      return NextResponse.json({ error: 'Belge bu dosyaya ait değil' }, { status: 400 })
    }

    const brokerClientId = await resolveBrokerClientId({
      tenantId: user.tenantId,
      submissionId,
      decision: parsed.data.client,
    })

    const now = new Date()
    const decisionById = new Map(parsed.data.documents.map((document) => [document.id, document]))
    const hasClassificationMutation = submission.tradeFlow !== parsed.data.tradeFlow ||
      submission.documents.some((document) => {
        const decision = decisionById.get(document.id)
        return decision != null && (
          decision.docType !== document.docType ||
          decision.isIgnored !== document.isIgnored
        )
      })
    const shouldStaleReport = hasClassificationMutation && (
      Boolean(submission.currentReportJobId) ||
      Boolean(submission.reportStaleAt) ||
      submission.status === 'COMPLETED'
    )

    const documentsAfterValidation = submission.documents.map((document) => {
      const decision = decisionById.get(document.id)
      if (!decision) {
        return {
          docType: document.docType,
          isIgnored: document.isIgnored,
          classificationValidatedAt: document.classificationValidatedAt,
        }
      }

      return {
        docType: decision.docType,
        isIgnored: decision.isIgnored,
        classificationValidatedAt: now,
      }
    })
    const allIncludedDocumentsValidated = documentsAfterValidation.every((document) =>
      document.isIgnored ||
      (document.docType !== 'UNCLASSIFIED' && Boolean(document.classificationValidatedAt)),
    )
    const nextClassificationStatus = allIncludedDocumentsValidated ? 'VALIDATED' : 'AWAITING_VALIDATION'
    const staleReason = 'Belge türü veya analiz kapsamı değişti; rapor yeniden analiz bekliyor.'

    await prisma.$transaction(async (tx) => {
      for (const document of parsed.data.documents) {
        await tx.document.update({
          where: { id: document.id },
          data: {
            docType: document.docType,
            label: docTypeLabel(document.docType),
            isIgnored: document.isIgnored,
            classificationValidatedAt: now,
            classificationValidatedBy: user.id,
          },
        })
      }

      await tx.submission.update({
        where: { id: submissionId },
        data: {
          tradeFlow: parsed.data.tradeFlow,
          brokerClientId,
          classificationStatus: nextClassificationStatus,
          classificationValidatedAt: allIncludedDocumentsValidated ? now : null,
          classificationValidatedBy: allIncludedDocumentsValidated ? user.id : null,
          status: 'UPLOADED',
          ...(shouldStaleReport
            ? {
                reportStaleAt: now,
                reportStaleReason: staleReason,
              }
            : {}),
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
      classificationStatus: nextClassificationStatus,
      reportStale: Boolean(submission.reportStaleAt) || shouldStaleReport,
      reportStaleReason: shouldStaleReport ? staleReason : submission.reportStaleReason,
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'Broker client not found') {
      return NextResponse.json({ error: 'Müşteri kaydı bulunamadı' }, { status: 400 })
    }
    console.error('PATCH /api/submissions/[id]/classification error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
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
