import { NextRequest, NextResponse } from 'next/server'
import { prisma, Prisma } from '@gumrukyz/db'
import { put } from '@vercel/blob'
import { createHash } from 'crypto'
import { inferDocumentContentType, isSupportedUploadFile } from '@/lib/document-file-types'
import { requireApiUser } from '@/lib/auth'
import { isProcessingActive, startSubmissionProcessing } from '@/lib/processing-runner'
import { docTypeLabel } from '@/lib/report-format'
import { getTenantEntitlements, toEntitlementBlock } from '@/lib/entitlements'
import { entitlementError } from '@/lib/api-errors'

const ALLOWED_DOC_TYPES = [
  'UNCLASSIFIED',
  'INVOICE', 'PACKING_LIST', 'LOADING_INSTRUCTION', 'TRANSPORT_DOC',
  'DECLARATION_OUTPUT', 'ORIGIN_DOC', 'PERMIT_DOC', 'OTHER',
]

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    const submission = await prisma.submission.findFirst({
      where: { id: submissionId, tenantId: user.tenantId },
    })
    if (!submission) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 404 })
    if (isProcessingActive(submission.status) || submission.classificationStatus === 'RUNNING') {
      return NextResponse.json({ error: 'İşlem devam ederken belge yüklenemez' }, { status: 409 })
    }

    // Read-only when trial/subscription is exhausted; also gates the auto-reprocess
    // that an upload would trigger.
    const entitlements = await getTenantEntitlements(user.tenantId)
    const block = toEntitlementBlock(entitlements)
    if (block) return entitlementError(block)

    const docCount = await prisma.document.count({
      where: { submissionId, tenantId: user.tenantId },
    })
    if (docCount >= entitlements.documentsPerSubmission) {
      return NextResponse.json(
        {
          error: `Bu pakette her dosyada en fazla ${entitlements.documentsPerSubmission} belge yükleyebilirsiniz.`,
          code: 'DOCUMENT_LIMIT_REACHED',
          entitlement: entitlements,
        },
        { status: 403 },
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const docType = (formData.get('docType') as string | null) ?? 'UNCLASSIFIED'
    const label = formData.get('label') as string | null

    if (!file) return NextResponse.json({ error: 'Dosya gönderilmedi' }, { status: 400 })
    if (!ALLOWED_DOC_TYPES.includes(docType)) {
      return NextResponse.json({ error: 'Geçersiz belge türü' }, { status: 400 })
    }
    if (!isSupportedUploadFile(file.name, file.type)) {
      return NextResponse.json(
        { error: 'Desteklenmeyen dosya türü. PDF, görsel, Word, Excel, PowerPoint veya HTML yükleyin.' },
        { status: 400 },
      )
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'Dosya boyutu 20MB altında olmalı' }, { status: 400 })
    }

    const fileBuffer = await file.arrayBuffer()
    const checksum = createHash('sha256').update(Buffer.from(fileBuffer)).digest('hex')
    const contentType = inferDocumentContentType(file.name, file.type)

    const safeFilename = `${user.tenantId}/${submissionId}/${docType}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const blob = await put(safeFilename, fileBuffer, {
      access: 'private',
      contentType,
    })

    // Create Document and DocumentVersion in a transaction
    const [document] = await prisma.$transaction(async (tx) => {
      const existingDocs = await tx.document.findMany({
        where: { submissionId, tenantId: user.tenantId },
        orderBy: { createdAt: 'asc' },
      })

      const doc = await tx.document.create({
        data: {
          submissionId,
          tenantId: user.tenantId,
          docType,
          label: label ?? (docType === 'UNCLASSIFIED' ? 'Sınıflandırılmamış belge' : docType),
          status: 'PENDING',
          classificationValidatedAt: docType === 'UNCLASSIFIED' ? null : new Date(),
          classificationValidatedBy: docType === 'UNCLASSIFIED' ? null : user.id,
        },
      })

      const version = await tx.documentVersion.create({
        data: {
          documentId: doc.id,
          tenantId: user.tenantId,
          versionNumber: 1,
          fileUrl: blob.url,
          originalFilename: file.name,
          mimeType: contentType,
          fileSizeBytes: file.size,
          checksumSha256: checksum,
          isActive: true,
          uploadedBy: user.id,
        },
      })

      await tx.document.update({
        where: { id: doc.id },
        data: { latestVersionId: version.id },
      })

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: 'document.uploaded',
          entityType: 'Document',
          entityId: doc.id,
          afterJson: { docType, filename: file.name, size: file.size },
        },
      })

      return [{ ...doc, latestVersionId: version.id, filename: file.name }, existingDocs] as const
    })

    const shouldStaleReport = Boolean(submission.currentReportJobId) || submission.status === 'COMPLETED'
    const shouldAutoProcess = shouldStaleReport &&
      docType !== 'UNCLASSIFIED' &&
      submission.classificationStatus === 'VALIDATED'
    const submissionUpdate: Prisma.SubmissionUpdateInput = {}
    if (submission.status === 'PENDING' || shouldStaleReport) {
      submissionUpdate.status = 'UPLOADED'
    }
    if (docType === 'UNCLASSIFIED') {
      submissionUpdate.classificationStatus = 'PENDING'
      submissionUpdate.classificationValidatedAt = null
      submissionUpdate.classificationValidatedBy = null
    }
    if (shouldStaleReport) {
      submissionUpdate.reportStaleAt = new Date()
      submissionUpdate.reportStaleReason = `${docTypeLabel(docType)} belgesi eklendi; rapor yeniden analiz bekliyor.`
    }
    if (Object.keys(submissionUpdate).length > 0) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: submissionUpdate,
      })
    }

    const processing = shouldAutoProcess
      ? await startSubmissionProcessing({ submissionId, tenantId: user.tenantId })
      : null

    return NextResponse.json({
      id: document.id,
      docType: document.docType,
      label: document.label,
      filename: file.name,
      status: document.status,
      reportStale: shouldStaleReport,
      processingJobId: processing?.ok ? processing.jobId : undefined,
      processingError: processing
        ? processing.ok
          ? processing.status === 'FAILED'
            ? processing.errorMessage ?? 'Analiz tamamlanamadı'
            : undefined
          : processing.error
        : undefined,
    }, { status: 201 })
  } catch (err) {
    console.error('POST /api/submissions/[id]/documents error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
