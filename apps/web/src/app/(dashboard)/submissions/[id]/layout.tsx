import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { prisma } from '@gumrukyz/db'
import { willChargeAnalysis } from '@/lib/entitlements'
import { DossierHeader } from './dossier-header'
import { DossierTabs } from './dossier-tabs'
import { DossierStatusBanner } from './dossier-status-banner'

export const dynamic = 'force-dynamic'

interface Props {
  children: ReactNode
  params: Promise<{ id: string }>
}

/**
 * Dossier workspace shell. One customs transaction = one workspace: this layout
 * renders a persistent header + tab bar around the Belgeler (documents) and
 * Aksiyonlar (report) surfaces, which stay mounted across tab navigation.
 */
export default async function SubmissionLayout({ children, params }: Props) {
  const { id } = await params
  const user = await getAuthenticatedUser()

  const submission = await prisma.submission.findFirst({
    where: { id, tenantId: user.tenantId },
    select: {
      id: true,
      title: true,
      tradeFlow: true,
      status: true,
      classificationStatus: true,
      reportStaleAt: true,
      reportStaleReason: true,
      brokerClient: { select: { displayName: true } },
      expertReviews: {
        where: {
          status: 'COMPLETED',
          supersededAt: null,
        },
        select: { id: true },
        take: 1,
      },
      processingJobs: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: {
          status: true,
          errorMessage: true,
        },
      },
      _count: { select: { riskReports: true } },
    },
  })

  if (!submission) notFound()

  const hasReport = submission._count.riskReports > 0
  const willChargeReanalysis = await willChargeAnalysis({ tenantId: user.tenantId, submissionId: id })
  const latestJob = submission.processingJobs[0] ?? null

  return (
    <div className="min-h-full bg-canvas">
      <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <DossierHeader
          submissionId={submission.id}
          title={submission.title}
          tradeFlow={submission.tradeFlow}
          clientName={submission.brokerClient?.displayName ?? null}
          status={submission.status}
          classificationStatus={submission.classificationStatus}
          hasReport={hasReport}
        />
        <DossierTabs submissionId={submission.id} hasReport={hasReport} />
        <DossierStatusBanner
          submissionId={submission.id}
          status={submission.status}
          classificationStatus={submission.classificationStatus}
          hasReport={hasReport}
          reportStaleAt={submission.reportStaleAt?.toISOString() ?? null}
          reportStaleReason={submission.reportStaleReason}
          willChargeReanalysis={willChargeReanalysis}
          hasCompletedExpertReview={submission.expertReviews.length > 0}
          latestFailedJobError={latestJob?.status === 'FAILED' ? latestJob.errorMessage : null}
        />
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}
