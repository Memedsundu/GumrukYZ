import { getAuthenticatedUser } from '@/lib/auth'
import { prisma } from '@gumrukyz/db'
import { notFound } from 'next/navigation'
import DocumentUploadClient from './upload-client'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function SubmissionDocumentsPage({ params }: Props) {
  const { id } = await params
  const user = await getAuthenticatedUser()

  const submission = await prisma.submission.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      documents: {
        include: {
          latestVersion: true,
        },
      },
    },
  })

  if (!submission) notFound()

  return (
    <DocumentUploadClient
        submissionId={submission.id}
        submissionStatus={submission.status}
        tradeFlow={submission.tradeFlow}
        classificationStatus={submission.classificationStatus}
        reportStaleAt={submission.reportStaleAt?.toISOString() ?? null}
        reportStaleReason={submission.reportStaleReason}
        existingDocuments={submission.documents.map((d) => ({
          id: d.id,
          docType: d.docType,
          suggestedDocType: d.suggestedDocType,
          suggestedDocTypeConfidence: d.suggestedDocTypeConfidence,
          classificationReasoning: d.classificationReasoning,
          classificationSourceRefs: Array.isArray(d.classificationSourceRefsJson)
            ? d.classificationSourceRefsJson as Array<{ field: string; value: string }>
            : [],
          classificationValidatedAt: d.classificationValidatedAt?.toISOString() ?? null,
          isIgnored: d.isIgnored,
          status: d.status,
          filename: d.latestVersion?.originalFilename ?? null,
        }))}
    />
  )
}
