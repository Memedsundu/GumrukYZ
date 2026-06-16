'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BarChart2, CheckCircle, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  resolveSubmissionNextAction,
  shouldPollSubmissionStatus,
  shouldRefreshOnStatusChange,
  type SubmissionStatusSnapshot,
} from '@/lib/submission-status'
import { fetchSubmissionStatus, mapStatusToProgressUpdate } from '@/lib/submission-status-poll'
import { useSmoothProgressPercent } from '@/lib/use-smooth-progress-percent'

type Props = {
  submissionId: string
  initialStatus: string
  initialClassificationStatus: string
  hasReport?: boolean
  variant: 'banner' | 'header-button' | 'link'
  /** Only the banner instance should poll to avoid duplicate requests. */
  poll?: boolean
}

type KeyedSubmissionStatusSnapshot = SubmissionStatusSnapshot & {
  snapshotKey: string
}

export function SubmissionNextStep({
  submissionId,
  initialStatus,
  initialClassificationStatus,
  hasReport = false,
  variant,
  poll = variant === 'banner',
}: Props) {
  const router = useRouter()
  const lastRefreshKeyRef = useRef<string | null>(null)
  const snapshotKey = `${submissionId}:${initialStatus}:${initialClassificationStatus}`
  const propSnapshot = useMemo<SubmissionStatusSnapshot>(
    () => ({
      status: initialStatus,
      classificationStatus: initialClassificationStatus,
    }),
    [initialStatus, initialClassificationStatus],
  )
  const [polledSnapshot, setPolledSnapshot] = useState<KeyedSubmissionStatusSnapshot | null>(null)
  const polledSnapshotRef = useRef<KeyedSubmissionStatusSnapshot | null>(null)
  const snapshot: SubmissionStatusSnapshot =
    polledSnapshot?.snapshotKey === snapshotKey ? polledSnapshot : propSnapshot

  useEffect(() => {
    if (!poll || !shouldPollSubmissionStatus(propSnapshot.status, propSnapshot.classificationStatus)) {
      return
    }

    let cancelled = false

    async function pollStatus() {
      while (!cancelled) {
        try {
          const data = await fetchSubmissionStatus(submissionId)
          if (cancelled) return

          const nextSnapshot: SubmissionStatusSnapshot = {
            status: data.status,
            classificationStatus: data.classificationStatus,
            progressPercent: data.progressPercent,
            progressLabel: data.progressLabel,
            progressDescription: mapStatusToProgressUpdate(data).description,
          }

          const current = polledSnapshotRef.current
          const currentSnapshot =
            current?.snapshotKey === snapshotKey ? current : propSnapshot
          const refreshKey = `${snapshotKey}:${nextSnapshot.status}:${nextSnapshot.classificationStatus}`
          const keyedSnapshot = { ...nextSnapshot, snapshotKey }
          polledSnapshotRef.current = keyedSnapshot
          setPolledSnapshot(keyedSnapshot)

          if (
            lastRefreshKeyRef.current !== refreshKey
            && shouldRefreshOnStatusChange(currentSnapshot, nextSnapshot)
          ) {
            lastRefreshKeyRef.current = refreshKey
            router.refresh()
          }

          if (!shouldPollSubmissionStatus(data.status, data.classificationStatus)) {
            return
          }
        } catch {
          return
        }

        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    }

    void pollStatus()

    return () => {
      cancelled = true
    }
  }, [submissionId, propSnapshot, snapshotKey, router, poll])

  const action = resolveSubmissionNextAction(snapshot, { hasReport })
  const displayPercent = useSmoothProgressPercent(
    action?.showProgress ? action.progressPercent : undefined,
    Boolean(poll && action?.showProgress),
  )
  if (!action) return null

  const href = action.href === 'report'
    ? `/submissions/${submissionId}/report`
    : action.href === 'documents'
      ? `/submissions/${submissionId}/documents`
      : null

  if (variant === 'header-button') {
    if (href) {
      return (
        <Button asChild variant={action.cta.includes('Doğrula') || action.cta.includes('Analizi') ? 'primary' : 'outline'}>
          <Link href={href}>
            {action.cta.includes('rapor') ? <BarChart2 /> : action.cta.includes('Belge') ? <Upload /> : <CheckCircle />}
            {action.cta}
          </Link>
        </Button>
      )
    }

    if (action.loading) {
      return (
        <Button disabled loading>
          {action.cta}
        </Button>
      )
    }

    return null
  }

  if (variant === 'link') {
    if (!href) return null
    return (
      <Link href={href} className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
        {action.cta} →
      </Link>
    )
  }

  return (
    <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-4 py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-800">{action.title}</p>
          <p className="mt-1 text-sm leading-6 text-brand-700">{action.description}</p>
          {action.showProgress && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs text-brand-700">
                <span>{action.title}</span>
                <span className="font-mono font-semibold">%{Math.round(displayPercent)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
                  style={{ width: `${displayPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
        {href ? (
          <Button asChild className="shrink-0">
            <Link href={href}>
              <CheckCircle />
              {action.cta}
            </Link>
          </Button>
        ) : (
          <Button disabled loading={action.loading} className="shrink-0">
            {!action.loading && <Loader2 className="animate-spin" />}
            {action.cta}
          </Button>
        )}
      </div>
    </div>
  )
}
