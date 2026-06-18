import { getAuthenticatedUser } from '@/lib/auth'
import { prisma } from '@gumrukyz/db'
import { notFound, redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

/**
 * The dossier no longer has a separate read-only hub. The header + tabs live in
 * the layout, so the bare submission URL resolves straight to the surface the
 * user needs: the action list once a report exists, otherwise the documents
 * workflow. Loop-safe — both targets are real child routes, never this page.
 */
export default async function SubmissionDetailPage({ params }: Props) {
  const { id } = await params
  const user = await getAuthenticatedUser()

  const submission = await prisma.submission.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, _count: { select: { riskReports: true } } },
  })

  if (!submission) notFound()

  const hasReport = submission._count.riskReports > 0
  redirect(`/submissions/${id}/${hasReport ? 'report' : 'documents'}`)
}
