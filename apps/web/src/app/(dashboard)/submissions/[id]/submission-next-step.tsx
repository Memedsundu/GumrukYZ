'use client'

import { useEffect, useRef, useState } from 'react'
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
import { fetchSubmissionStatus } from '@/lib/submission-status-poll'

type Props = {
  submissionId: string
  initialStatus: string
  initialClassificationStatus: string
  hasReport?: boolean
  variant: 'banner' | 'header-button' | 'link'
  /** Only the banner instance should poll to avoid duplicate requests. */
  poll?: boolean
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
  const refreshedRef = useRef(false)
  const [snapshot, setSnapshot] = useState<SubmissionStatusSnapshot>({
    status: initialStatus,
    classificationStatus: initialClassificationStatus,
  })

  useEffect(() => {
    setSnapshot({
      status: initialStatus,
      classificationStatus: initialClassificationStatus,
    })
    refreshedRef.current = false
  }, [initialStatus, initialClassificationStatus])

  useEffect(() => {
    if (!poll || !shouldPollSubmissionStatus(initialStatus, initialClassificationStatus)) {
      return
    }

    let cancelled = false

    async function poll() {
      while (!cancelled) {
        try {
          const data = await fetchSubmissionStatus(submissionId)
          if (cancelled) return

          const nextSnapshot: SubmissionStatusSnapshot = {
            status: data.status,
            classificationStatus: data.classificationStatus,
            progressPercent: data.progressPercent,
            progressLabel: data.progressLabel,
            progressDescription: data.progressDescription,
          }

          setSnapshot((current) => {
            if (
              !refreshedRef.current
              && shouldRefreshOnStatusChange(current, nextSnapshot)
            ) {
              refreshedRef.current = true
              router.refresh()
            }
            return nextSnapshot
          })

          if (!shouldPollSubmissionStatus(data.status, data.classificationStatus)) {
            return
          }
        } catch {
          return
        }

        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    }

    void poll()

    return () => {
      cancelled = true
    }
  }, [submissionId, initialStatus, initialClassificationStatus, router, poll])

  const action = resolveSubmissionNextAction(snapshot, { hasReport })
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
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
                  style={{ width: `${action.progressPercent}%` }}
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
