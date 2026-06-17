import { NextRequest, NextResponse } from 'next/server'
import { prisma, Prisma } from '@gumrukyz/db'
import { put } from '@vercel/blob'
import { createHash } from 'crypto'
import { inferDocumentContentType, isSupportedUploadFile } from '@/lib/document-file-types'
import { requireApiUser } from '@/lib/auth'
import { classifySubmissionDocument } from '@/lib/classification'
import { isProcessingActive } from '@/lib/processing-runner'
import { docTypeLabel } from '@/lib/report-format'

const MAX_FILE_SIZE = 20 * 1024 * 1024

interface Params {
  params: Promise<{ id: string; documentId: string }>
}

export const maxDuration = 300

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: submissionId, documentId } = await params
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    const submission = await prisma.submission.findFirst({
      where: { id: submissionId, tenantId: user.tenantId },
      include: {
        documents: {
          where: { id: documentId },
          include: {
            latestVersion: true,
            versions: {
              select: { id: true, versionNumber: true, checksumSha256: true },
              orderBy: { versionNumber: 'desc' },
            },
          },
        },
      },
    })
    if (!submission || submission.documents.length === 0) {
      return NextResponse.json({ error: 'Belge bulunamadı' }, { status: 404 })
    }
    if (isProcessingActive(submission.status) || submission.classificationStatus === 'RUNNING') {
      return NextResponse.json({ error: 'İşlem devam ederken belge değiştirilemez' }, { status: 409 })
    }

    const document = submission.documents[0]!

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Dosya gönderilmedi' }, { status: 400 })
    if (!isSupportedUploadFile(file.name, file.type)) {
      return NextResponse.json(
        { error: 'Desteklenmeyen dosya türü. PDF, görsel, Word, Excel, PowerPoint veya HTML yükleyin.' },
        { status: 400 },
      )
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Dosya boyutu 20MB altında olmalı' }, { status: 400 })
    }

    const fileBuffer = await file.arrayBuffer()
    const checksum = createHash('sha256').update(Buffer.from(fileBuffer)).digest('hex')
    const duplicateVersion = document.versions.find((version) => version.checksumSha256 === checksum)
    if (duplicateVersion) {
      return NextResponse.json(
        { error: 'Bu belge için aynı dosya daha önce yüklenmiş', versionId: duplicateVersion.id },
        { status: 409 },
      )
    }

    const contentType = inferDocumentContentType(file.name, file.type)
    const safeFilename = `${user.tenantId}/${submissionId}/${document.docType}_v${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const blob = await put(safeFilename, fileBuffer, {
      access: 'private',
      contentType,
    })

    const nextVersionNumber = (document.versions[0]?.versionNumber ?? 0) + 1
    const staleReason = `${docTypeLabel(document.docType)} belgesi değiştirildi; rapor yeniden analiz bekliyor.`
    const shouldStaleReport = Boolean(submission.currentReportJobId) ||
      Boolean(submission.reportStaleAt) ||
      submission.status === 'COMPLETED'

    const version = await prisma.$transaction(async (tx) => {
      await tx.documentVersion.updateMany({
        where: { documentId, tenantId: user.tenantId },
        data: { isActive: false },
      })

      const created = await tx.documentVersion.create({
        data: {
          documentId,
          tenantId: user.tenantId,
          versionNumber: nextVersionNumber,
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
        where: { id: documentId },
        data: {
          latestVersionId: created.id,
          status: 'PENDING',
          classificationValidatedAt: null,
          classificationValidatedBy: null,
          suggestedDocType: null,
          suggestedDocTypeConfidence: null,
          classificationReasoning: null,
          classificationSourceRefsJson: Prisma.JsonNull,
        },
      })

      await tx.submission.update({
        where: { id: submissionId },
        data: {
          status: 'UPLOADED',
          classificationStatus: 'PENDING',
          classificationValidatedAt: null,
          classificationValidatedBy: null,
          ...(shouldStaleReport
            ? {
                reportStaleAt: new Date(),
                reportStaleReason: staleReason,
              }
            : {}),
        },
      })

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: 'document.version_uploaded',
          entityType: 'Document',
          entityId: documentId,
          afterJson: {
            documentId,
            versionId: created.id,
            versionNumber: created.versionNumber,
            previousVersionId: document.latestVersionId,
            filename: file.name,
            size: file.size,
          } as Prisma.InputJsonValue,
        },
      })

      return created
    })

    const classification = await classifySubmissionDocument({
      submissionId,
      tenantId: user.tenantId,
      documentId,
    })
    const targetClassification = classification.documents.find((item) => item.id === documentId)

    return NextResponse.json({
      documentId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      needsValidation: true,
      classificationStatus: classification.submission.classificationStatus,
      classification: targetClassification
        ? {
            suggestedDocType: targetClassification.suggestedDocType,
            confidence: targetClassification.confidence,
            reasoning: targetClassification.reasoning,
            sourceRefs: targetClassification.sourceRefs,
          }
        : null,
      reportStale: shouldStaleReport,
      reportStaleReason: shouldStaleReport ? staleReason : null,
    }, { status: 201 })
  } catch (err) {
    console.error('POST /api/submissions/[id]/documents/[documentId]/versions error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
