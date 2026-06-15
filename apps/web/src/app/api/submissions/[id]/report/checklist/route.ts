import { NextRequest, NextResponse } from 'next/server'
import { Prisma, prisma } from '@gumrukyz/db'
import { z } from 'zod'
import { requireApiUser } from '@/lib/auth'
import { formatRuleResultMessage, recommendedActionForRuleResult } from '@/lib/report-format'
import {
  expertFindingFingerprint,
  ruleFindingFingerprint,
  sourceVersionHash,
} from '@/lib/report-checklist-fingerprint'

const ChecklistSchema = z.object({
  findingKind: z.enum(['rule', 'expert']),
  findingId: z.string().min(1),
  completed: z.boolean().optional(),
  note: z.string().max(500).nullable().optional(),
}).refine((value) => value.completed !== undefined || value.note !== undefined, {
  message: 'completed veya note alanlarından biri gönderilmeli',
})

const ACTIVE_REPORT_JOB_STATUSES = [
  'PENDING',
  'CLASSIFYING',
  'EXTRACTING',
  'NORMALIZING',
  'RUNNING_RULES',
  'AI_RULE_VALIDATING',
  'GENERATING_REPORT',
]

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    const body = await req.json() as unknown
    const parsed = ChecklistSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz kontrol listesi isteği' }, { status: 400 })
    }

    const submission = await prisma.submission.findFirst({
      where: { id: submissionId, tenantId: user.tenantId },
      select: {
        id: true,
        status: true,
        reportStaleAt: true,
        documents: {
          select: {
            id: true,
            docType: true,
            latestVersionId: true,
          },
        },
      },
    })
    if (!submission) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 404 })
    if (submission.reportStaleAt || ACTIVE_REPORT_JOB_STATUSES.includes(submission.status)) {
      return NextResponse.json(
        { error: 'Rapor güncellenirken kontrol listesi değiştirilemez' },
        { status: 409 },
      )
    }

    const finding = await loadChecklistFinding({
      submissionId,
      tenantId: user.tenantId,
      findingKind: parsed.data.findingKind,
      findingId: parsed.data.findingId,
      documents: submission.documents,
    })
    if (!finding) return NextResponse.json({ error: 'Bulgu bulunamadı' }, { status: 404 })

    const state = await prisma.$transaction(async (tx) => {
      const where = {
        tenantId_submissionId_findingKind_findingId: {
          tenantId: user.tenantId,
          submissionId,
          findingKind: parsed.data.findingKind,
          findingId: parsed.data.findingId,
        },
      }
      const existing = await tx.findingChecklistState.findUnique({
        where,
        select: { id: true, completedAt: true, completedById: true, note: true },
      })
      const completedProvided = parsed.data.completed !== undefined
      const noteProvided = parsed.data.note !== undefined
      const completedAt = completedProvided && parsed.data.completed ? new Date() : null
      const completedById = completedProvided && parsed.data.completed ? user.id : null
      const normalizedNote = noteProvided ? normalizeChecklistNote(parsed.data.note) : null
      const updateData: Prisma.FindingChecklistStateUncheckedUpdateInput = {}
      if (completedProvided) {
        updateData.completedAt = completedAt
        updateData.completedById = completedById
      }
      if (noteProvided) updateData.note = normalizedNote
      updateData.processingJobId = finding.processingJobId
      updateData.findingFingerprint = finding.findingFingerprint
      updateData.sourceVersionHash = finding.sourceVersionHash

      const updated = await tx.findingChecklistState.upsert({
        where,
        update: updateData,
        create: {
          tenantId: user.tenantId,
          submissionId,
          processingJobId: finding.processingJobId,
          findingKind: parsed.data.findingKind,
          findingId: parsed.data.findingId,
          findingFingerprint: finding.findingFingerprint,
          sourceVersionHash: finding.sourceVersionHash,
          completedAt,
          completedById,
          note: normalizedNote,
        },
        include: { completedBy: { select: { email: true } } },
      })

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: completedProvided
            ? parsed.data.completed
              ? 'finding_checklist.completed'
              : 'finding_checklist.reopened'
            : 'finding_checklist.note_updated',
          entityType: 'FindingChecklistState',
          entityId: updated.id,
          beforeJson: {
            completedAt: existing?.completedAt?.toISOString() ?? null,
            completedById: existing?.completedById ?? null,
            note: existing?.note ?? null,
          } as Prisma.InputJsonValue,
          afterJson: {
            findingKind: updated.findingKind,
            findingId: updated.findingId,
            completedAt: updated.completedAt?.toISOString() ?? null,
            completedById: updated.completedById,
            note: updated.note ?? null,
          } as Prisma.InputJsonValue,
        },
      })

      return updated
    })

    return NextResponse.json({
      findingKind: state.findingKind,
      findingId: state.findingId,
      completedAt: state.completedAt?.toISOString() ?? null,
      completedByEmail: state.completedBy?.email ?? null,
      note: state.note ?? null,
    })
  } catch (err) {
    console.error('PATCH /api/submissions/[id]/report/checklist error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

async function loadChecklistFinding({
  submissionId,
  tenantId,
  findingKind,
  findingId,
  documents,
}: {
  submissionId: string
  tenantId: string
  findingKind: 'rule' | 'expert'
  findingId: string
  documents: Array<{ id: string; docType: string; latestVersionId: string | null }>
}): Promise<{
  processingJobId: string | null
  findingFingerprint: string
  sourceVersionHash: string
} | null> {
  if (findingKind === 'rule') {
    const ruleResult = await prisma.ruleResult.findFirst({
      where: {
        id: findingId,
        submissionId,
        tenantId,
        result: { not: 'PASS' },
      },
      select: {
        processingJobId: true,
        ruleCode: true,
        result: true,
        severity: true,
        message: true,
        sourceRefsJson: true,
      },
    })
    if (!ruleResult) return null
    const message = formatRuleResultMessage(ruleResult)
    const action = recommendedActionForRuleResult(ruleResult.ruleCode, ruleResult.result)
    return {
      processingJobId: ruleResult.processingJobId,
      findingFingerprint: ruleFindingFingerprint({
        ruleCode: ruleResult.ruleCode,
        result: ruleResult.result,
        message,
        action,
        sourceRefsJson: ruleResult.sourceRefsJson,
      }),
      sourceVersionHash: sourceVersionHash({
        sourceRefsJson: ruleResult.sourceRefsJson,
        documents,
      }),
    }
  }

  const expertFinding = await prisma.expertReviewFinding.findFirst({
    where: {
      id: findingId,
      tenantId,
      expertReview: {
        submissionId,
        tenantId,
        supersededAt: null,
      },
    },
    select: {
      area: true,
      severity: true,
      title: true,
      recommendation: true,
      evidenceRefsJson: true,
      expertReview: {
        select: { processingJobId: true },
      },
    },
  })
  if (!expertFinding) return null
  return {
    processingJobId: expertFinding.expertReview.processingJobId,
    findingFingerprint: expertFindingFingerprint({
      area: expertFinding.area,
      severity: expertFinding.severity,
      title: expertFinding.title,
      recommendation: expertFinding.recommendation,
      evidenceRefsJson: expertFinding.evidenceRefsJson,
    }),
    sourceVersionHash: sourceVersionHash({
      evidenceRefsJson: expertFinding.evidenceRefsJson,
      documents,
    }),
  }
}

function normalizeChecklistNote(note: string | null | undefined): string | null {
  const value = note?.trim()
  return value ? value : null
}
