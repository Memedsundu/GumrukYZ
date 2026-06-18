import { redirect } from 'next/navigation'
import { loadReportView } from '../report/report-view'
import { ActionChecklistWorkspace } from './action-checklist-workspace'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ActionsPage({ params }: Props) {
  const { id } = await params
  const view = await loadReportView(id)

  // No report yet → the action list has nothing to work; send the user to the
  // report tab (which explains the "run analysis first" state).
  if (!view) redirect(`/submissions/${id}/report`)

  return (
    <ActionChecklistWorkspace
      submissionId={id}
      counts={view.counts}
      findings={view.findings}
      reportState={view.reportState}
    />
  )
}
