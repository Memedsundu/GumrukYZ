import { getAuthenticatedUser } from '@/lib/auth'
import { prisma } from '@gumrukyz/db'
import { notFound } from 'next/navigation'
import DocumentUploadClient from './upload-client'

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
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <span>Dashboard</span>
          <span>/</span>
          <span>{submission.title}</span>
          <span>/</span>
          <span>Belgeler</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{submission.title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {submission.tradeFlow === 'IMPORT' ? 'İthalat' : 'İhracat'} dosyası — belgeleri yükleyin
        </p>
      </div>

      <DocumentUploadClient
        submissionId={submission.id}
        tradeFlow={submission.tradeFlow}
        existingDocuments={submission.documents.map((d) => ({
          id: d.id,
          docType: d.docType,
          label: d.label,
          status: d.status,
          filename: d.latestVersion?.originalFilename ?? null,
        }))}
      />
    </div>
  )
}
