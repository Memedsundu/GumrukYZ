import Link from 'next/link'
import ReportWorkspace from './report-workspace'
import { loadReportView } from './report-view'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ReportPage({ params }: Props) {
  const { id } = await params
  const view = await loadReportView(id)

  if (!view) {
    return (
      <div className="p-8">
        <p className="text-ink-muted">Henüz rapor üretilmedi. Önce analizi başlatın.</p>
        <Link
          href={`/submissions/${id}/documents`}
          className="mt-4 inline-block text-sm text-brand-600 hover:text-brand-700"
        >
          ← Belgelere dön
        </Link>
      </div>
    )
  }

  return <ReportWorkspace submissionId={id} {...view} />
}
