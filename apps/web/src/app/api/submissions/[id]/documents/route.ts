import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@gumrukyz/db'
import { put } from '@vercel/blob'
import { createHash } from 'crypto'

const ALLOWED_DOC_TYPES = [
  'INVOICE', 'PACKING_LIST', 'LOADING_INSTRUCTION', 'TRANSPORT_DOC',
  'DECLARATION_OUTPUT', 'ORIGIN_DOC', 'PERMIT_DOC', 'OTHER',
]

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const submission = await prisma.submission.findFirst({
      where: { id: submissionId, tenantId: user.tenantId },
    })
    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const docType = formData.get('docType') as string | null
    const label = formData.get('label') as string | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!docType || !ALLOWED_DOC_TYPES.includes(docType)) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be under 20MB' }, { status: 400 })
    }

    const fileBuffer = await file.arrayBuffer()
    const checksum = createHash('sha256').update(Buffer.from(fileBuffer)).digest('hex')

    const safeFilename = `${user.tenantId}/${submissionId}/${docType}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const blob = await put(safeFilename, fileBuffer, {
      access: 'public',
      contentType: 'application/pdf',
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
          label: label ?? docType,
          status: 'PENDING',
        },
      })

      const version = await tx.documentVersion.create({
        data: {
          documentId: doc.id,
          tenantId: user.tenantId,
          versionNumber: 1,
          fileUrl: blob.url,
          originalFilename: file.name,
          mimeType: 'application/pdf',
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

    // Update submission status to UPLOADED
    if (submission.status === 'PENDING') {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { status: 'UPLOADED' },
      })
    }

    return NextResponse.json({
      id: document.id,
      docType: document.docType,
      label: document.label,
      filename: file.name,
      status: document.status,
    }, { status: 201 })
  } catch (err) {
    console.error('POST /api/submissions/[id]/documents error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
