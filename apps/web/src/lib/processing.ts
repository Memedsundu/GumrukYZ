/**
 * Core document processing pipeline.
 *
 * Sprint 1 implementation: synchronous in-process execution.
 * Sprint 2: replace with Trigger.dev durable job.
 *
 * Pipeline steps:
 * CLASSIFYING → EXTRACTING → NORMALIZING → RUNNING_RULES → AI_RULE_VALIDATING → EXPERT_REVIEWING → GENERATING_REPORT → COMPLETED
 */
import { prisma, searchRegulations } from '@gumrukyz/db'
import { Prisma } from '@gumrukyz/db'
import { RuleEvaluator, ALL_RULES, LOW_CONFIDENCE_THRESHOLD as RULES_LOW_CONFIDENCE_THRESHOLD } from '@gumrukyz/rules'
import type { SubmissionContext, ExtractionData } from '@gumrukyz/rules'
import { OpenAIProvider } from '@gumrukyz/ai'
import {
  InvoiceExtractionSchema,
  PackingListExtractionSchema,
  LoadingInstructionExtractionSchema,
  TransportDocExtractionSchema,
  DeclarationOutputExtractionSchema,
  OriginDocExtractionSchema,
} from '@gumrukyz/ai'
import { logger } from '@gumrukyz/shared'
import type { DocumentType, TradeFlow } from '@gumrukyz/domain'
import type { z } from 'zod'
import { extractTextFromPdf } from './pdf-extractor'
import { runOcrFallback } from './ocr-client'
import { formatRuleResultMessage } from './report-format'
import {
  type AzureDocumentIntelligenceResult,
  isAzureDocumentIntelligenceEnabled,
  runAzureLayoutExtraction,
} from './azure-document-intelligence'
import {
  getOpenAIDocumentReaderMinimumConfidence,
  runOpenAIDocumentReader,
  shouldRunOpenAIDocumentReader,
} from './openai-document-reader'
import { runExpertReviewForSubmission } from './expert-review'
import { runAiRuleValidationForSubmission } from './ai-rule-validation'

const LOW_CONFIDENCE_THRESHOLD = RULES_LOW_CONFIDENCE_THRESHOLD
type DocumentReaderMode = 'hybrid' | 'managed' | 'native'
const ACTIVE_PROCESSING_JOB_STATUSES = [
  'PENDING',
  'CLASSIFYING',
  'EXTRACTING',
  'NORMALIZING',
  'RUNNING_RULES',
  'AI_RULE_VALIDATING',
  'EXPERT_REVIEWING',
  'GENERATING_REPORT',
]

async function updateJobStatus(
  jobId: string,
  submissionId: string,
  status: string,
  step: string,
  errorMessage?: string,
) {
  await prisma.processingJob.update({
    where: { id: jobId },
    data: {
      status,
      currentStep: step,
      errorMessage: errorMessage ?? null,
      ...(status === 'COMPLETED' || status === 'FAILED' ? { completedAt: new Date() } : {}),
    },
  })
  await prisma.submission.update({
    where: { id: submissionId },
    data: { status },
  })
}

export async function processSubmission(
  submissionId: string,
  tenantId: string,
  jobId: string,
): Promise<void> {
  logger.info('processSubmission.start', { submissionId, jobId })

  try {
    const activeJob = await prisma.processingJob.findFirst({
      where: {
        id: jobId,
        submissionId,
        tenantId,
        status: { in: ACTIVE_PROCESSING_JOB_STATUSES },
      },
      select: { id: true },
    })
    if (!activeJob) {
      logger.warn('processSubmission.lock_missing', { submissionId, tenantId, jobId })
      return
    }

    // Fetch submission with documents
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        documents: {
          include: { latestVersion: true },
        },
      },
    })

    if (!submission) throw new Error('Submission not found')
    if (submission.tenantId !== tenantId) throw new Error('Submission tenant mismatch')

    await clearGeneratedArtifacts(submissionId, tenantId, submission.documents)

    const ai = new OpenAIProvider()
    const extractionResults: ExtractionData[] = []

    // ─── EXTRACTING ────────────────────────────────────────────────────────────
    await updateJobStatus(jobId, submissionId, 'EXTRACTING', 'EXTRACTING')

    for (const doc of submission.documents) {
      if (!doc.latestVersion || doc.isIgnored || doc.docType === 'UNCLASSIFIED') continue

      const docType = doc.docType as DocumentType

      // Update document status
      await prisma.document.update({
        where: { id: doc.id },
        data: { status: 'PROCESSING' },
      })

      try {
        // Step 1: Extract raw text from native PDF text, then managed layout/OCR fallbacks.
        const filename = doc.latestVersion.originalFilename
        const mimeType = doc.latestVersion.mimeType
        const textResult = await extractTextFromPdf(doc.latestVersion.fileUrl, filename, mimeType)
        const extractionSchema = getExtractionSchema(docType)
        let rawText = textResult.text
        let extractionConfidence = textResult.confidence
        let extractionMethod: string = textResult.method
        let lastReaderProviderRunId: string | null = null
        let structuredData: Record<string, unknown> = {}
        let structuredDataAlreadyExtracted = false
        let openAIDocumentReaderNeedsOcr = false
        let managedReaderFallbackNeeded = false

        // Step 2: Create extraction record
        const extraction = await prisma.documentExtraction.create({
          data: {
            documentVersionId: doc.latestVersion.id,
            tenantId,
            extractionStatus: 'PENDING',
            extractionMethod,
            rawText,
            confidence: extractionConfidence,
          },
        })

        const readerMode = getDocumentReaderMode()
        if (
          readerMode !== 'native' &&
          isAzureDocumentIntelligenceEnabled() &&
          (readerMode === 'managed' || extractionConfidence < LOW_CONFIDENCE_THRESHOLD)
        ) {
          const startedAt = Date.now()
          const providerRun = await prisma.providerRun.create({
            data: {
              tenantId,
              provider: 'azure_doc_intel',
              model: process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID ?? 'prebuilt-layout',
              operation: `layout_${docType.toLowerCase()}`,
              status: 'OK',
            },
          })

          try {
            const azureResult = await runAzureLayoutExtraction(
              doc.latestVersion.fileUrl,
              filename,
              mimeType,
            )

            lastReaderProviderRunId = providerRun.id
            managedReaderFallbackNeeded =
              azureResult.confidence < getOpenAIDocumentReaderMinimumConfidence() ||
              azureResult.text.trim().length < 50

            await prisma.providerRun.update({
              where: { id: providerRun.id },
              data: {
                model: azureResult.modelId,
                estimatedCostUsd: azureResult.estimatedCostUsd,
                durationMs: Date.now() - startedAt,
              },
            })

            if (shouldUseAzureResult(readerMode, azureResult, rawText, extractionConfidence)) {
              rawText = azureResult.text
              extractionConfidence = azureResult.confidence
              extractionMethod = azureResult.method

              await prisma.documentExtraction.update({
                where: { id: extraction.id },
                data: {
                  extractionMethod,
                  rawText,
                  confidence: extractionConfidence,
                  providerRunId: providerRun.id,
                },
              })
            }
          } catch (azureErr) {
            logger.warn('Azure Document Intelligence extraction failed, continuing with local readers', {
              docType,
              error: azureErr instanceof Error ? azureErr.message : String(azureErr),
            })
            managedReaderFallbackNeeded = true
            await prisma.providerRun.update({
              where: { id: providerRun.id },
              data: {
                status: 'ERROR',
                errorMessage: azureErr instanceof Error
                  ? azureErr.message
                  : 'Azure Document Intelligence extraction failed',
                durationMs: Date.now() - startedAt,
              },
            })
          }
        }

        if (
          extractionSchema &&
          shouldRunOpenAIDocumentReader(extractionConfidence, rawText, {
            force: managedReaderFallbackNeeded,
          })
        ) {
          const startedAt = Date.now()
          const providerRun = await prisma.providerRun.create({
            data: {
              tenantId,
              provider: 'openai',
              model: process.env.OPENAI_DOCUMENT_READER_MODEL ?? 'gpt-5.4-mini',
              operation: `document_read_${docType.toLowerCase()}`,
              status: 'OK',
            },
          })

          try {
            const readerResult = await runOpenAIDocumentReader({
              fileUrl: doc.latestVersion.fileUrl,
              filename,
              mimeType,
              docType,
              tradeFlow: submission.tradeFlow as TradeFlow,
            })

            rawText = readerResult.extractedText || rawText
            extractionConfidence = readerResult.confidence
            extractionMethod = readerResult.method
            lastReaderProviderRunId = providerRun.id
            openAIDocumentReaderNeedsOcr =
              readerResult.confidence < getOpenAIDocumentReaderMinimumConfidence()

            structuredData = enhanceStructuredDataFromText(
              docType,
              readerResult.structuredData,
              rawText,
              submission.tradeFlow as TradeFlow,
            )
            structuredDataAlreadyExtracted = !openAIDocumentReaderNeedsOcr

            await prisma.providerRun.update({
              where: { id: providerRun.id },
              data: {
                model: readerResult.model,
                inputTokens: readerResult.inputTokens,
                outputTokens: readerResult.outputTokens,
                estimatedCostUsd: readerResult.estimatedCostUsd,
                durationMs: Date.now() - startedAt,
              },
            })

            await prisma.documentExtraction.update({
              where: { id: extraction.id },
              data: {
                extractionMethod,
                rawText,
                structuredJson: structuredData as Prisma.InputJsonValue,
                confidence: extractionConfidence,
                providerRunId: providerRun.id,
              },
            })
          } catch (openAIErr) {
            logger.warn('OpenAI document reader failed, continuing with OCR fallback', {
              docType,
              error: openAIErr instanceof Error ? openAIErr.message : String(openAIErr),
            })
            await prisma.providerRun.update({
              where: { id: providerRun.id },
              data: {
                status: 'ERROR',
                errorMessage: openAIErr instanceof Error
                  ? openAIErr.message
                  : 'OpenAI document reader failed',
                durationMs: Date.now() - startedAt,
              },
            })
          }
        }

        if (extractionConfidence < LOW_CONFIDENCE_THRESHOLD || openAIDocumentReaderNeedsOcr) {
          const startedAt = Date.now()
          const providerRun = await prisma.providerRun.create({
            data: {
              tenantId,
              provider: 'ocr-service',
              model: 'python-ocr-service',
              operation: `ocr_${docType.toLowerCase()}`,
              status: 'OK',
            },
          })

          try {
            const ocrResult = await runOcrFallback(
              doc.latestVersion.fileUrl,
              doc.latestVersion.originalFilename,
              doc.latestVersion.mimeType,
            )

            rawText = ocrResult.text
            extractionConfidence = ocrResult.confidence
            extractionMethod = ocrResult.method
            lastReaderProviderRunId = providerRun.id

            await prisma.providerRun.update({
              where: { id: providerRun.id },
              data: { durationMs: Date.now() - startedAt },
            })

            await prisma.documentExtraction.update({
              where: { id: extraction.id },
              data: {
                extractionMethod,
                rawText,
                confidence: extractionConfidence,
                providerRunId: providerRun.id,
              },
            })
          } catch (ocrErr) {
            logger.warn('OCR fallback failed, keeping low-confidence extraction', {
              docType,
              error: ocrErr instanceof Error ? ocrErr.message : String(ocrErr),
            })
            await prisma.providerRun.update({
              where: { id: providerRun.id },
              data: {
                status: 'ERROR',
                errorMessage: ocrErr instanceof Error ? ocrErr.message : 'OCR fallback failed',
                durationMs: Date.now() - startedAt,
              },
            })
          }

          if (extractionConfidence < LOW_CONFIDENCE_THRESHOLD) {
            await prisma.documentExtraction.update({
              where: { id: extraction.id },
              data: {
                extractionStatus: 'LOW_CONFIDENCE',
                providerRunId: lastReaderProviderRunId,
              },
            })
            await prisma.document.update({
              where: { id: doc.id },
              data: { status: 'DONE' },
            })
            extractionResults.push({
              docType,
              data: {},
              confidence: extractionConfidence,
            })
            continue
          }
        }

        // Step 3: AI structured extraction (if OpenAI is configured)
        let aiConfidence = extractionConfidence

        if (structuredDataAlreadyExtracted) {
          await prisma.documentExtraction.update({
            where: { id: extraction.id },
            data: {
              extractionStatus: 'DONE',
              structuredJson: structuredData as Prisma.InputJsonValue,
              confidence: aiConfidence,
            },
          })
        } else if (extractionSchema && ai.isEnabled() && rawText.length > 50) {
          const providerRun = await prisma.providerRun.create({
            data: {
              tenantId,
              provider: 'openai',
              model: process.env['OPENAI_MODEL'] ?? 'gpt-4o',
              operation: `extract_${docType.toLowerCase()}`,
              status: 'OK',
            },
          })

          try {
            const { result, meta } = await ai.extractStructured(
              rawText,
              extractionSchema,
              `${docType.toLowerCase()}_extraction`,
              docType,
            )
            structuredData = enhanceStructuredDataFromText(
              docType,
              result as Record<string, unknown>,
              rawText,
              submission.tradeFlow as TradeFlow,
            )
            aiConfidence = 0.85

            await prisma.providerRun.update({
              where: { id: providerRun.id },
              data: {
                inputTokens: meta.inputTokens,
                outputTokens: meta.outputTokens,
                estimatedCostUsd: meta.estimatedCostUsd,
                durationMs: meta.durationMs,
              },
            })

            await prisma.documentExtraction.update({
              where: { id: extraction.id },
              data: {
                extractionStatus: 'DONE',
                structuredJson: structuredData as Prisma.InputJsonValue,
                confidence: aiConfidence,
                providerRunId: providerRun.id,
              },
            })
          } catch (aiErr) {
            logger.warn('AI extraction failed, using text-only', {
              docType,
              error: aiErr instanceof Error ? aiErr.message : String(aiErr),
            })
            await prisma.providerRun.update({
              where: { id: providerRun.id },
              data: {
                status: 'ERROR',
                errorMessage: aiErr instanceof Error ? aiErr.message : 'AI extraction failed',
              },
            })
            await prisma.documentExtraction.update({
              where: { id: extraction.id },
              data: { extractionStatus: 'DONE', confidence: extractionConfidence * 0.7 },
            })
          }
        } else {
          await prisma.documentExtraction.update({
            where: { id: extraction.id },
            data: { extractionStatus: 'DONE' },
          })
        }

        await prisma.document.update({
          where: { id: doc.id },
          data: { status: 'DONE' },
        })

        extractionResults.push({
          docType,
          data: structuredData,
          confidence: aiConfidence,
        })
      } catch (docErr) {
        logger.error('Document extraction failed', {
          docId: doc.id,
          error: docErr instanceof Error ? docErr.message : String(docErr),
        })
        await prisma.document.update({
          where: { id: doc.id },
          data: { status: 'FAILED' },
        })
      }
    }

    // ─── NORMALIZING ───────────────────────────────────────────────────────────
    await updateJobStatus(jobId, submissionId, 'NORMALIZING', 'NORMALIZING')

    // Build declaration snapshot from DECLARATION_OUTPUT extractions
    const declData = extractionResults.find((e) => e.docType === 'DECLARATION_OUTPUT')
    if (declData && Object.keys(declData.data).length > 0) {
      const d = declData.data as Record<string, unknown>

      const sourceDoc = submission.documents.find((doc) => doc.docType === 'DECLARATION_OUTPUT')
      if (sourceDoc?.latestVersionId) {
        await prisma.declarationSnapshot.create({
          data: {
            submissionId,
            tenantId,
            sourceDocumentVersionId: sourceDoc.latestVersionId,
            declarationNumber: stringOrNull(d['declaration_number']),
            declarationDate: dateOrNull(d['declaration_date']),
            regimeCode: stringOrNull(d['regime_code']),
            incoterm: stringOrNull(d['incoterm']),
            totalValue: numberOrNull(d['total_value']),
            currency: stringOrNull(d['currency']),
            totalNetWeight: numberOrNull(d['net_weight']),
            totalGrossWeight: numberOrNull(d['gross_weight']),
            packageCount: intOrNull(d['package_count']),
            rawJson: d as Prisma.InputJsonValue,
          },
        })
      }
    }

    // ─── RUNNING_RULES ─────────────────────────────────────────────────────────
    await updateJobStatus(jobId, submissionId, 'RUNNING_RULES', 'RUNNING_RULES')

    const declarationSnap = await prisma.declarationSnapshot.findFirst({
      where: { submissionId },
    })

    const ctx: SubmissionContext = {
      submissionId,
      tenantId,
      tradeFlow: submission.tradeFlow as TradeFlow,
      documents: extractionResults,
      declarationSnapshot: declarationSnap
        ? {
            declarationNumber: declarationSnap.declarationNumber,
            incoterm: declarationSnap.incoterm,
            totalValue: declarationSnap.totalValue ? Number(declarationSnap.totalValue) : null,
            currency: declarationSnap.currency,
            totalNetWeight: declarationSnap.totalNetWeight ? Number(declarationSnap.totalNetWeight) : null,
            totalGrossWeight: declarationSnap.totalGrossWeight ? Number(declarationSnap.totalGrossWeight) : null,
            packageCount: declarationSnap.packageCount,
            gtipCode: null,
            regimeCode: declarationSnap.regimeCode,
          }
        : null,
    }

    // Quality + presence rules run on the full document set (they explicitly
    // reason about extraction confidence). Content rules only see documents
    // with confidence ≥ LOW_CONFIDENCE_THRESHOLD to avoid spurious FAILs from
    // unreliable extractions.
    const lowConfidenceDocs = extractionResults.filter((e) => e.confidence < LOW_CONFIDENCE_THRESHOLD)
    const ruleUsableDocs = extractionResults.filter((e) => e.confidence >= LOW_CONFIDENCE_THRESHOLD)

    const isQualityOrPresence = (code: string) =>
      code.startsWith('QUAL-') || code.startsWith('PRES-') || code === 'OCR-001'
    const qualityAndPresenceRules = ALL_RULES.filter((r) => isQualityOrPresence(r.code))
    const contentRules = ALL_RULES.filter((r) => !isQualityOrPresence(r.code))

    const ruleResults = [
      ...new RuleEvaluator(qualityAndPresenceRules).evaluate(ctx),
      ...new RuleEvaluator(contentRules).evaluate({
        ...ctx,
        documents: ruleUsableDocs,
      }),
    ]

    // Fetch active rules for ID lookup
    const activeRules = await prisma.rule.findMany({
      where: { lifecycleStatus: 'ACTIVE' },
      select: {
        id: true,
        ruleCode: true,
        legalCitations: {
          select: {
            id: true,
            articleLabel: true,
            excerpt: true,
            url: true,
            sourceDocument: { select: { title: true } },
          },
        },
      },
    })
    const ruleIdMap = new Map(activeRules.map((r) => [r.ruleCode, r.id]))
    const ruleCitationIdsMap = new Map(
      activeRules.map((r) => [r.ruleCode, r.legalCitations.map((citation) => citation.id)]),
    )
    const ruleCitationDetailsMap = new Map(
      activeRules.map((r) => [
        r.ruleCode,
        r.legalCitations.map((citation) => ({
          sourceTitle: citation.sourceDocument.title,
          articleLabel: citation.articleLabel,
          excerpt: citation.excerpt,
          url: citation.url,
        })),
      ]),
    )
    const ruleCitationLabelsMap = new Map(
      activeRules.map((r) => [
        r.ruleCode,
        r.legalCitations
          .map((citation) => `${citation.sourceDocument.title}${citation.articleLabel ? ` ${citation.articleLabel}` : ''}`)
          .join('; '),
      ]),
    )

    const resultRows = ruleResults.map((r) => ({
      submissionId,
      tenantId,
      ruleCode: r.ruleCode,
      severity: r.severity,
      result: r.result,
      message: r.message,
      sourceRefsJson: r.sourceRefs as Prisma.InputJsonValue,
      ruleId: ruleIdMap.get(r.ruleCode) ?? null,
    }))

    // Low-confidence handling is now covered by the OCR-001 RuleDefinition
    // (see packages/rules/src/rules/quality.ts) which is included in
    // ALL_RULES. We keep `lowConfidenceDocs` only for downstream reporting.
    void lowConfidenceDocs

    const persistedRuleResults: Array<{
      id: string
      ruleCode: string
      severity: string
      result: string
      message: string
      sourceRefsJson: unknown
      legalCitations: Array<{
        sourceTitle: string
        articleLabel: string | null
        excerpt: string
        url: string
      }>
    }> = []

    if (resultRows.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const row of resultRows) {
          const created = await tx.ruleResult.create({ data: row })
          const citationIds = ruleCitationIdsMap.get(row.ruleCode) ?? []
          if (citationIds.length > 0) {
            await tx.ruleResultCitation.createMany({
              data: citationIds.map((citationId) => ({
                ruleResultId: created.id,
                ruleLegalCitationId: citationId,
              })),
              skipDuplicates: true,
            })
          }
          persistedRuleResults.push({
            id: created.id,
            ruleCode: row.ruleCode,
            severity: row.severity,
            result: row.result,
            message: row.message,
            sourceRefsJson: row.sourceRefsJson,
            legalCitations: ruleCitationDetailsMap.get(row.ruleCode) ?? [],
          })
        }
      })
    }

    // ─── AI_RULE_VALIDATING ───────────────────────────────────────────────────
    await updateJobStatus(jobId, submissionId, 'AI_RULE_VALIDATING', 'AI_RULE_VALIDATING')

    const aiRuleValidation = await runAiRuleValidationForSubmission({
      submissionId,
      tenantId,
      tradeFlow: submission.tradeFlow,
      documents: extractionResults,
      ruleResults: persistedRuleResults,
    }).catch((validationErr) => {
      logger.warn('AI rule validation failed outside guarded runner, continuing processing', {
        error: validationErr instanceof Error ? validationErr.message : String(validationErr),
      })
      return null
    })

    // ─── EXPERT_REVIEWING ─────────────────────────────────────────────────────
    await updateJobStatus(jobId, submissionId, 'EXPERT_REVIEWING', 'EXPERT_REVIEWING')

    const expertReview = await runExpertReviewForSubmission({
      submissionId,
      tenantId,
      tradeFlow: submission.tradeFlow,
      documents: extractionResults,
      ruleResults: resultRows,
    }).catch((expertErr) => {
      logger.warn('Expert review failed outside guarded runner, continuing report generation', {
        error: expertErr instanceof Error ? expertErr.message : String(expertErr),
      })
      return null
    })

    // ─── GENERATING_REPORT ─────────────────────────────────────────────────────
    await updateJobStatus(jobId, submissionId, 'GENERATING_REPORT', 'GENERATING_REPORT')

    const errors = resultRows.filter((r) => r.result === 'FAIL').length
    const warnings = resultRows.filter((r) => r.result === 'WARN').length + (expertReview?.warningCount ?? 0)
    const reviewNeeded =
      resultRows.filter((r) => r.result === 'REVIEW_NEEDED').length + (expertReview?.reviewNeededCount ?? 0)

    let summaryText: string | null = null
    const expertFindingsForSummary = (expertReview?.findings ?? []).map((finding) => ({
      ruleCode: `AI-${finding.area}`,
      severity: finding.severity,
      message: `${finding.title}: ${finding.explanation}`,
    }))
    const aiRuleValidationFindingsForSummary = (aiRuleValidation?.findings ?? [])
      .filter((finding) => finding.status !== 'LIKELY_CORRECT')
      .map((finding) => ({
        ruleCode: `AI-RULE-${finding.ruleCode}`,
        severity: finding.status,
        message: `${finding.explanation} Öneri: ${finding.recommendation}`,
      }))
    const nonPassRuleFindings = resultRows
      .filter((r) => r.result !== 'PASS' && r.result !== 'SKIP')
      .map((r) => ({
        ruleCode: r.ruleCode,
        severity: r.severity,
        message: [
          formatRuleResultMessage(r),
          ruleCitationLabelsMap.get(r.ruleCode)
            ? `Mevzuat kaynağı: ${ruleCitationLabelsMap.get(r.ruleCode)}`
            : null,
        ].filter(Boolean).join(' '),
      }))
    const summaryFindings = [
      ...nonPassRuleFindings,
      ...aiRuleValidationFindingsForSummary,
      ...expertFindingsForSummary,
    ]

    if (ai.isEnabled() && summaryFindings.length > 0) {
      try {
        // RAG: retrieve relevant regulation chunks to enrich the AI summary
        let regulationContext: Array<{ title: string; excerpt: string }> | undefined
        if (ai.embedText) {
          try {
            const queryText = summaryFindings.map((f) => f.message).join(' ').slice(0, 4000)
            const embedding = await ai.embedText(queryText)
            const chunks = await searchRegulations(prisma, embedding, 3, 0.55)
            if (chunks.length > 0) {
              regulationContext = chunks.map((c) => ({
                title: c.sourceDocumentTitle,
                excerpt: c.chunkText.slice(0, 300),
              }))
            }
          } catch (ragErr) {
            logger.warn('RAG regulation search failed, proceeding without context', {
              error: ragErr instanceof Error ? ragErr.message : String(ragErr),
            })
          }
        }

        const { result } = await ai.generateRiskSummary(summaryFindings, submission.tradeFlow, regulationContext)
        summaryText = result.summary
      } catch (err) {
        logger.warn('Risk summary generation failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    await prisma.riskReport.create({
      data: {
        submissionId,
        tenantId,
        totalErrors: errors,
        totalWarnings: warnings,
        totalReviewNeeded: reviewNeeded,
        summaryText,
        snapshotJson: resultRows as Prisma.InputJsonValue,
      },
    })

    // ─── COMPLETED ─────────────────────────────────────────────────────────────
    await updateJobStatus(jobId, submissionId, 'COMPLETED', 'COMPLETED')

    logger.info('processSubmission.complete', {
      submissionId,
      errors,
      warnings,
      reviewNeeded,
    })
  } catch (err) {
    logger.error('processSubmission.failed', {
      submissionId,
      error: err instanceof Error ? err.message : String(err),
    })
    await updateJobStatus(
      jobId,
      submissionId,
      'FAILED',
      'FAILED',
      err instanceof Error ? err.message : 'Unknown error',
    ).catch(() => {})
  }
}

function getExtractionSchema(docType: DocumentType): z.ZodType<unknown> | null {
  switch (docType) {
    case 'INVOICE': return InvoiceExtractionSchema
    case 'PACKING_LIST': return PackingListExtractionSchema
    case 'LOADING_INSTRUCTION': return LoadingInstructionExtractionSchema
    case 'TRANSPORT_DOC': return TransportDocExtractionSchema
    case 'DECLARATION_OUTPUT': return DeclarationOutputExtractionSchema
    case 'ORIGIN_DOC': return OriginDocExtractionSchema
    default: return null
  }
}

function getDocumentReaderMode(): DocumentReaderMode {
  const configured = process.env.DOCUMENT_READER_MODE?.trim().toLowerCase()
  if (configured === 'managed' || configured === 'azure') return 'managed'
  if (configured === 'native' || configured === 'local') return 'native'
  if (configured === 'hybrid') return 'hybrid'
  return isAzureDocumentIntelligenceEnabled() ? 'managed' : 'hybrid'
}

function shouldUseAzureResult(
  readerMode: DocumentReaderMode,
  azureResult: AzureDocumentIntelligenceResult,
  currentText: string,
  currentConfidence: number,
): boolean {
  if (!azureResult.text.trim()) return false
  if (readerMode === 'managed') return true
  if (currentConfidence < LOW_CONFIDENCE_THRESHOLD) return true

  const hasMoreUsefulText = azureResult.text.length > currentText.length * 1.2
  const hasTables = azureResult.tableCount > 0
  return hasMoreUsefulText || hasTables
}

function enhanceStructuredDataFromText(
  docType: DocumentType,
  data: Record<string, unknown>,
  rawText: string,
  tradeFlow: TradeFlow,
): Record<string, unknown> {
  const next = { ...data }

  if (docType === 'INVOICE') {
    const invoiceNumber = firstMatch(rawText, /Invoice Number:\s*([A-Z0-9]+)/i)
    const invoiceDate = firstMatch(rawText, /Invoice Date:\s*([0-9]{1,2}[-./][0-9]{1,2}[-./][0-9]{4})/i)
    if (invoiceNumber) next['invoice_number'] = invoiceNumber
    if (invoiceDate) next['invoice_date'] = invoiceDate
    if (/FREE OF CHARGE|BEDELS[İI]Z/i.test(rawText)) next['free_of_charge'] = true
    if (
      tradeFlow === 'EXPORT' &&
      !next['country_of_origin'] &&
      /(?:T[ÜU]RK[İI]YE|TURKEY)\s+TR/i.test(rawText)
    ) {
      next['country_of_origin'] = 'TR'
    }
  }

  if (docType === 'PACKING_LIST') {
    const totalLine = rawText.match(/(?:TOPLAM|TOTAL)[\s\S]{0,120}?\b(\d+)\s+([\d.,]+)/i)
    if (totalLine) {
      next['package_count'] = parseLocaleNumber(totalLine[1])
      next['gross_weight'] = parseLocaleNumber(totalLine[2])
    }
  }

  if (docType === 'DECLARATION_OUTPUT') {
    const packageCount = firstMatch(rawText, /\b(\d+)\s*KAP\b/i)
    const netGross = rawText.match(/Toplam Net\s*\/\s*Br[üu]t Kg:\s*([\d.,]+)\s*\/\s*([\d.,]+)/i)
    const regimeCode =
      firstMatch(rawText, /\b(1000|1040|3150|3151|3153|3171|2100)\b/) ??
      firstMatch(rawText, /^\s*(\d{4})\s+[\d.,]+/m)

    if (packageCount) next['package_count'] = parseLocaleNumber(packageCount)
    if (netGross) {
      next['net_weight'] = parseLocaleNumber(netGross[1])
      next['gross_weight'] = parseLocaleNumber(netGross[2])
    }
    if (regimeCode && !/^\d{4}$/.test(String(next['regime_code'] ?? ''))) {
      next['regime_code'] = regimeCode
    }
  }

  return next
}

function firstMatch(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern)
  return match?.[1]?.trim() ?? null
}

function parseLocaleNumber(value: string): number | null {
  const normalized = value.replace(/\./g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

async function clearGeneratedArtifacts(
  submissionId: string,
  tenantId: string,
  documents: Array<{ latestVersionId: string | null }>,
) {
  const latestVersionIds = documents
    .map((doc) => doc.latestVersionId)
    .filter((id): id is string => Boolean(id))

  await prisma.$transaction(async (tx) => {
    await tx.overrideAction.deleteMany({
      where: {
        tenantId,
        ruleResult: { submissionId, tenantId },
      },
    })
    await tx.ruleResult.deleteMany({ where: { submissionId, tenantId } })
    await tx.expertReview.deleteMany({ where: { submissionId, tenantId } })
    await tx.riskReport.deleteMany({ where: { submissionId, tenantId } })
    await tx.declarationItem.deleteMany({
      where: {
        tenantId,
        snapshot: { submissionId, tenantId },
      },
    })
    await tx.declarationSnapshot.deleteMany({ where: { submissionId, tenantId } })

    if (latestVersionIds.length > 0) {
      await tx.documentExtraction.deleteMany({
        where: {
          tenantId,
          documentVersionId: { in: latestVersionIds },
        },
      })
    }
  })
}

function stringOrNull(val: unknown): string | null {
  if (val == null) return null
  const s = String(val).trim()
  return s === '' ? null : s
}

function numberOrNull(val: unknown): number | null {
  if (val == null) return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function intOrNull(val: unknown): number | null {
  const n = numberOrNull(val)
  return n !== null ? Math.round(n) : null
}

function dateOrNull(val: unknown): Date | null {
  if (val == null) return null
  const value = String(val).trim()
  const dmy = value.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/)
  const d = dmy
    ? new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
    : new Date(value)
  return isNaN(d.getTime()) ? null : d
}
