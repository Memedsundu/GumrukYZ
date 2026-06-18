import { prisma, Prisma } from '@gumrukyz/db'
import type { ExtractionConfirmationFinding } from './extraction-confirmation'

export type FlattenedExtractionField = {
  fieldPath: string
  value: unknown
  normalizedValueText: string | null
}

export function flattenExtractionFields(data: Record<string, unknown>): FlattenedExtractionField[] {
  const fields: FlattenedExtractionField[] = []
  flattenValue(data, '', fields)
  return fields
}

export async function persistExtractedFields(params: {
  tenantId: string
  documentId: string
  documentVersionId: string
  extractionId: string
  providerRunId: string | null
  structuredData: Record<string, unknown>
  confidence: number
  extractionMethod: string
}): Promise<void> {
  const fields = flattenExtractionFields(params.structuredData)
  await prisma.extractedField.deleteMany({
    where: { extractionId: params.extractionId },
  })
  if (fields.length === 0) return

  await prisma.extractedField.createMany({
    data: fields.map((field) => ({
      tenantId: params.tenantId,
      documentId: params.documentId,
      documentVersionId: params.documentVersionId,
      extractionId: params.extractionId,
      providerRunId: params.providerRunId,
      fieldPath: field.fieldPath,
      valueJson: toPrismaJson(field.value),
      normalizedValueText: field.normalizedValueText,
      confidence: params.confidence,
      extractionMethod: params.extractionMethod,
      verificationStatus: 'UNVERIFIED',
    })),
    skipDuplicates: true,
  })
}

export async function persistExtractionVerificationFindings(params: {
  tenantId: string
  documentId: string
  documentVersionId: string
  extractionId: string
  providerRunId: string | null
  promptVersion: string
  findings: ExtractionConfirmationFinding[]
}): Promise<void> {
  if (params.findings.length === 0) return

  await prisma.$transaction(async (tx) => {
    await tx.extractionVerification.createMany({
      data: params.findings.map((finding) => ({
        tenantId: params.tenantId,
        documentId: params.documentId,
        documentVersionId: params.documentVersionId,
        extractionId: params.extractionId,
        providerRunId: params.providerRunId,
        fieldPath: finding.field,
        currentValueJson: toPrismaJson(finding.current_value),
        suggestedValueJson: toPrismaJson(finding.suggested_value),
        sourceQuote: finding.source_quote,
        confidence: finding.confidence,
        severity: 'REVIEW_NEEDED',
        reason: finding.reason,
        action: finding.action,
        promptVersion: params.promptVersion,
      })),
    })

    for (const finding of params.findings) {
      await tx.extractedField.upsert({
        where: {
          extractionId_fieldPath: {
            extractionId: params.extractionId,
            fieldPath: finding.field,
          },
        },
        create: {
          tenantId: params.tenantId,
          documentId: params.documentId,
          documentVersionId: params.documentVersionId,
          extractionId: params.extractionId,
          providerRunId: params.providerRunId,
          fieldPath: finding.field,
          valueJson: toPrismaJson(finding.current_value),
          normalizedValueText: normalizeValue(finding.current_value),
          confidence: finding.confidence,
          sourceQuote: finding.source_quote,
          verificationStatus: 'DISAGREED',
        },
        update: {
          providerRunId: params.providerRunId,
          sourceQuote: finding.source_quote,
          confidence: finding.confidence,
          verificationStatus: 'DISAGREED',
        },
      })
    }
  })
}

function flattenValue(value: unknown, path: string, fields: FlattenedExtractionField[]): void {
  if (value == null) return
  if (typeof value === 'string' && value.trim().length === 0) return

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      flattenValue(item, `${path}[${index}]`, fields)
    })
    return
  }

  if (typeof value === 'object') {
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (key.startsWith('_')) continue
      const nextPath = path ? `${path}.${key}` : key
      flattenValue(nestedValue, nextPath, fields)
    }
    return
  }

  if (!path) return
  fields.push({
    fieldPath: path,
    value,
    normalizedValueText: normalizeValue(value),
  })
}

function normalizeValue(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value.trim().slice(0, 1000)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value).slice(0, 1000)
  } catch {
    return String(value).slice(0, 1000)
  }
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  if (value == null) return Prisma.JsonNull as unknown as Prisma.InputJsonValue
  return value as Prisma.InputJsonValue
}
