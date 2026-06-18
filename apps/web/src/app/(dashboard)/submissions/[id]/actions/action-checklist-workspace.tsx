'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Metric } from '../report/finding-badges'
import { sortFindings } from '../report/report-filters'
import { ActionChecklist, findingKey } from '../report/action-checklist'
import type { ReportChecklistState, ReportCounts, ReportFindingItem, ReportState } from '../report/report-types'

type ChecklistResponse = ReportChecklistState & {
  findingKind: ReportFindingItem['kind']
  findingId: string
  error?: string
}

export type ActionChecklistWorkspaceProps = {
  submissionId: string
  counts: ReportCounts
  findings: ReportFindingItem[]
  reportState: ReportState
}

/**
 * Aksiyon Listesi — the focused work surface. Only the actionable checklist plus a
 * minimal summary; reading/understanding (score, grouped findings, evidence, expert,
 * assistant) lives on the Risk Raporu tab.
 */
export function ActionChecklistWorkspace({
  submissionId,
  counts,
  findings,
  reportState,
}: ActionChecklistWorkspaceProps) {
  const [items, setItems] = useState(findings)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set())
  const prevFindingKeysRef = useRef<Set<string>>(new Set(findings.map(findingKey)))
  const findingsSignature = useMemo(
    () => findings.map((finding) => `${finding.kind}:${finding.id}:${finding.result}`).join('|'),
    [findings],
  )

  useEffect(() => {
    const prevKeys = prevFindingKeysRef.current
    const newDefaultOpenKeys = findings
      .filter((finding) => !prevKeys.has(findingKey(finding)) && finding.defaultOpen)
      .map(findingKey)

    setItems(findings)
    prevFindingKeysRef.current = new Set(findings.map(findingKey))

    if (newDefaultOpenKeys.length > 0) {
      setExpandedKeys((current) => {
        const next = new Set(current)
        for (const key of newDefaultOpenKeys) next.add(key)
        return next
      })
    }
  }, [findingsSignature, findings])

  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notePendingKeys, setNotePendingKeys] = useState<Set<string>>(() => new Set())
  const [noteErrors, setNoteErrors] = useState<Record<string, string>>({})

  const actionableFindings = useMemo(
    () => items.filter((finding) => finding.result !== 'PASS').sort(sortFindings),
    [items],
  )
  const incompleteFindings = actionableFindings.filter((finding) => !finding.checklist.completedAt)
  const completedFindings = actionableFindings.filter((finding) => Boolean(finding.checklist.completedAt))
  const completedCount = completedFindings.length
  const progressPercent = actionableFindings.length === 0
    ? 100
    : Math.round((completedCount / actionableFindings.length) * 100)

  function toggleExpanded(key: string) {
    setExpandedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function toggleChecklist(finding: ReportFindingItem, completed: boolean) {
    if (reportState.readonly) return
    const key = findingKey(finding)
    const previousChecklist = finding.checklist
    const optimisticChecklist: ReportChecklistState = {
      ...previousChecklist,
      completedAt: completed ? new Date().toISOString() : null,
      completedByEmail: completed ? 'Kaydediliyor' : null,
    }

    setPendingKeys((current) => new Set(current).add(key))
    setErrors((current) => omitKey(current, key))
    setItems((current) => replaceChecklist(current, finding, optimisticChecklist))

    try {
      const response = await fetch(`/api/submissions/${submissionId}/report/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          findingKind: finding.kind,
          findingId: finding.id,
          completed,
        }),
      })
      const payload = await response.json().catch(() => null) as ChecklistResponse | null
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? 'Kontrol listesi güncellenemedi')
      }

      setItems((current) => replaceChecklist(current, finding, {
        completedAt: payload.completedAt,
        completedByEmail: payload.completedByEmail,
        note: payload.note,
      }))
    } catch (error) {
      setItems((current) => replaceChecklist(current, finding, previousChecklist))
      setErrors((current) => ({
        ...current,
        [key]: error instanceof Error ? error.message : 'Kontrol listesi güncellenemedi',
      }))
    } finally {
      setPendingKeys((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }

  async function saveChecklistNote(finding: ReportFindingItem, note: string) {
    if (reportState.readonly) return
    const key = findingKey(finding)
    const previousChecklist = finding.checklist
    const normalizedNote = note.trim() || null

    setNotePendingKeys((current) => new Set(current).add(key))
    setNoteErrors((current) => omitKey(current, key))
    setItems((current) => replaceChecklist(current, finding, {
      ...previousChecklist,
      note: normalizedNote,
    }))

    try {
      const response = await fetch(`/api/submissions/${submissionId}/report/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          findingKind: finding.kind,
          findingId: finding.id,
          note: normalizedNote,
        }),
      })
      const payload = await response.json().catch(() => null) as ChecklistResponse | null
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? 'Not kaydedilemedi')
      }

      setItems((current) => replaceChecklist(current, finding, {
        completedAt: payload.completedAt,
        completedByEmail: payload.completedByEmail,
        note: payload.note,
      }))
    } catch (error) {
      setItems((current) => replaceChecklist(current, finding, previousChecklist))
      setNoteErrors((current) => ({
        ...current,
        [key]: error instanceof Error ? error.message : 'Not kaydedilemedi',
      }))
    } finally {
      setNotePendingKeys((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-brand-600" />
              <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Aksiyon Listesi</h2>
            </div>
            <div className="mt-3 w-56 max-w-full">
              <div className="flex items-center justify-between text-xs font-medium text-ink-muted">
                <span>İlerleme</span>
                <span>{completedCount}/{actionableFindings.length}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Hata" value={counts.errors} tone="red" />
            <Metric label="İnceleme gerekli" value={counts.reviewNeeded} tone="blue" />
            <Metric label="Uyarı" value={counts.warnings} tone="amber" />
          </div>
        </div>
      </section>

      <ActionChecklist
        incompleteFindings={incompleteFindings}
        completedFindings={completedFindings}
        totalCount={actionableFindings.length}
        activeCategory={null}
        expandedKeys={expandedKeys}
        pendingKeys={pendingKeys}
        errors={errors}
        notePendingKeys={notePendingKeys}
        noteErrors={noteErrors}
        readOnly={reportState.readonly}
        submissionId={submissionId}
        documentActionsDisabled={Boolean(reportState.activeJobId)}
        onClearCategory={() => {}}
        onExpandedChange={toggleExpanded}
        onToggle={toggleChecklist}
        onSaveNote={saveChecklistNote}
      />
    </div>
  )
}

function replaceChecklist(
  findings: ReportFindingItem[],
  target: ReportFindingItem,
  checklist: ReportChecklistState,
) {
  return findings.map((finding) => (
    finding.kind === target.kind && finding.id === target.id
      ? { ...finding, checklist }
      : finding
  ))
}

function omitKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record }
  delete next[key]
  return next
}
