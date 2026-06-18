/**
 * Core document processing pipeline.
 *
 * Sprint 1 implementation: synchronous in-process execution.
 * Sprint 2: replace with Trigger.dev durable job.
 *
 * Pipeline steps (classification happens pre-pipeline with mandatory human
 * validation; see classification.ts and the /process route gate):
 * EXTRACTING → NORMALIZING → RUNNING_RULES → AI_RULE_VALIDATING → GENERATING_REPORT → COMPLETED
 */
import { prisma, searchRegulations } from '@gumrukyz/db'
import { Prisma } from '@gumrukyz/db'
import {
  RuleEvaluator,
  ALL_RULES,
  LOW_CONFIDENCE_THRESHOLD as RULES_LOW_CONFIDENCE_THRESHOLD,
  EXTRACTION_FILENAME_FIELD,
  EXTRACTION_METHOD_FIELD,
  FINAL_EXTRACTION_CONFIDENCE_FIELD,
  LIKELY_RASTER_SCAN_FIELD,
  NATIVE_TEXT_CONFIDENCE_FIELD,
  NATIVE_TEXT_LENGTH_FIELD,
  PDF_IMAGE_COUNT_FIELD,
  PDF_PAGES_WITH_IMAGES_FIELD,
  isPlaceholderValue,
  toFiniteNumber,
} from '@gumrukyz/rules'
import type { SubmissionContext, ExtractionData } from '@gumrukyz/rules'
import { classifyDocumentCoverage } from '@gumrukyz/domain'
import { OpenAIProvider, RISK_SUMMARY_PROMPT_VERSION } from '@gumrukyz/ai'
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
import { randomUUID } from 'node:crypto'
import { extractTextFromPdf } from './pdf-extractor'
import { runOcrFallback } from './ocr-client'
import { formatRuleResultMessage } from './report-format'
import { enhanceDeclarationOutputFromText } from './declaration-text-fallback'
import { enhanceLoadingInstructionFromText } from './loading-instruction-text-fallback'
import { enhancePackingListFromText } from './packing-list-text-fallback'
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
import { runAiRuleValidationForSubmission } from './ai-rule-validation'
import {
  runExtractionConfirmationShadow,
  type ExtractionConfirmationDocument,
} from './extraction-confirmation'
import { consumeMetric, refundMetric } from './entitlements'
import { UsageMetric } from '@gumrukyz/domain'

const LOW_CONFIDENCE_THRESHOLD = RULES_LOW_CONFIDENCE_THRESHOLD
type DocumentReaderMode = 'hybrid' | 'managed' | 'native'
const ACTIVE_PROCESSING_JOB_STATUSES = [
  'PENDING',
  'CLASSIFYING',
  'EXTRACTING',
  'NORMALIZING',
  'RUNNING_RULES',
  'AI_RULE_VALIDATING',
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
    data: {
      status,
      ...(status === 'COMPLETED'
        ? {
            currentReportJobId: jobId,
            reportStaleAt: null,
            reportStaleReason: null,
          }
        : {}),
    },
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

    await clearProcessingJobArtifacts(submissionId, tenantId, jobId)

    const ai = new OpenAIProvider()
    const extractionResults: ExtractionData[] = []
    const extractionConfirmationDocuments: ExtractionConfirmationDocument[] = []

    // ─── EXTRACTING ────────────────────────────────────────────────────────────
    await updateJobStatus(jobId, submissionId, 'EXTRACTING', 'EXTRACTING')

    for (const doc of submission.documents) {
      if (!doc.latestVersion || doc.isIgnored || doc.docType === 'UNCLASSIFIED') continue

      const docType = doc.docType as DocumentType
      // Reuse a prior successful extraction for this immutable, checksum-bound
      // version instead of re-running OCR/LLM. DONE only: LOW_CONFIDENCE rows
      // carry no business data and may stem from a transient reader outage, so
      // they must re-extract on every re-run to keep the retry path alive.
      const reusableExtraction = await prisma.documentExtraction.findFirst({
        where: {
          documentVersionId: doc.latestVersion.id,
          tenantId,
          extractionStatus: 'DONE',
        },
        orderBy: { createdAt: 'desc' },
      })

      if (reusableExtraction) {
        await prisma.document.update({
          where: { id: doc.id },
          data: { status: 'DONE' },
        })
        extractionResults.push({
          docType,
          data: jsonObjectOrEmpty(reusableExtraction.structuredJson),
          confidence: reusableExtraction.confidence ?? 0,
        })
        logger.info('processSubmission.extraction_reused', {
          submissionId,
          jobId,
          docId: doc.id,
          documentVersionId: doc.latestVersion.id,
          extractionId: reusableExtraction.id,
        })
        continue
      }

      // Reuse the lightweight text captured during classification (keyed to this
      // immutable version) instead of re-reading the document. When it is
      // confident enough we skip the native parse and — via the confidence gate
      // below — the duplicate Azure call, jumping straight to structured extraction.
      const cachedClassificationText = await prisma.documentExtraction.findFirst({
        where: {
          documentVersionId: doc.latestVersion.id,
          tenantId,
          extractionStatus: 'TEXT_READY',
        },
        orderBy: { createdAt: 'desc' },
      })
      const reuseClassificationText =
        (cachedClassificationText?.rawText?.trim().length ?? 0) > 0 &&
        (cachedClassificationText?.confidence ?? 0) >= LOW_CONFIDENCE_THRESHOLD

      // Update document status
      await prisma.document.update({
        where: { id: doc.id },
        data: { status: 'PROCESSING' },
      })

      try {
        // Step 1: Get raw text — reuse the classification read when usable,
        // otherwise extract native PDF text (managed layout/OCR fallbacks follow).
        const filename = doc.latestVersion.originalFilename
        const mimeType = doc.latestVersion.mimeType
        const extractionSchema = getExtractionSchema(docType)
        let rawText: string
        let extractionConfidence: number
        let extractionMethod: string
        let nativeTextConfidence: number
        let nativeTextLength: number
        let pdfImageCount: number
        let pdfPagesWithImages: number
        let likelyRasterScan: boolean

        if (reuseClassificationText && cachedClassificationText) {
          rawText = cachedClassificationText.rawText ?? ''
          extractionConfidence = cachedClassificationText.confidence ?? 0
          extractionMethod = cachedClassificationText.extractionMethod ?? 'TEXT_PDF'
          nativeTextConfidence = extractionConfidence
          nativeTextLength = rawText.trim().length
          // Reuse only happens at high confidence, which never enters the
          // raster/OCR path, so these image-scan signals stay at safe defaults.
          pdfImageCount = 0
          pdfPagesWithImages = 0
          likelyRasterScan = false
          logger.info('processSubmission.text_reused_from_classification', {
            submissionId,
            jobId,
            docId: doc.id,
            documentVersionId: doc.latestVersion.id,
            extractionId: cachedClassificationText.id,
          })
        } else {
          const textResult = await extractTextFromPdf(doc.latestVersion.fileUrl, filename, mimeType)
          rawText = textResult.text
          extractionConfidence = textResult.confidence
          extractionMethod = textResult.method
          nativeTextConfidence = textResult.confidence
          nativeTextLength = textResult.text.trim().length
          pdfImageCount = textResult.imageCount
          pdfPagesWithImages = textResult.pagesWithImages
          likelyRasterScan = textResult.likelyRasterScan
        }

        let lastReaderProviderRunId: string | null = null
        let structuredData: Record<string, unknown> = {}
        let structuredDataAlreadyExtracted = false
        let openAIDocumentReaderNeedsOcr = false
        let managedReaderFallbackNeeded = false

        // Step 2: Create the extraction record, or reuse the classification row
        // in place so a single row per version flows through to DONE.
        const extraction = reuseClassificationText && cachedClassificationText
          ? await prisma.documentExtraction.update({
              where: { id: cachedClassificationText.id },
              data: {
                extractionStatus: 'PENDING',
                extractionMethod,
                rawText,
                confidence: extractionConfidence,
              },
            })
          : await prisma.documentExtraction.create({
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
            const lowConfidenceData = attachExtractionQualitySignals(
              {},
              {
                filename,
                nativeTextConfidence,
                nativeTextLength,
                finalExtractionConfidence: extractionConfidence,
                extractionMethod,
                pdfImageCount,
                pdfPagesWithImages,
                likelyRasterScan,
              },
            )
            await prisma.documentExtraction.update({
              where: { id: extraction.id },
              data: {
                extractionStatus: 'LOW_CONFIDENCE',
                structuredJson: lowConfidenceData as Prisma.InputJsonValue,
                providerRunId: lastReaderProviderRunId,
              },
            })
            await prisma.document.update({
              where: { id: doc.id },
              data: { status: 'DONE' },
            })
            extractionResults.push({
              docType,
              data: lowConfidenceData,
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
            )
            aiConfidence = deriveStructuredExtractionConfidence(
              docType,
              structuredData,
              extractionConfidence,
            )

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
            aiConfidence = extractionConfidence * 0.7
            await prisma.providerRun.update({
              where: { id: providerRun.id },
              data: {
                status: 'ERROR',
                errorMessage: aiErr instanceof Error ? aiErr.message : 'AI extraction failed',
              },
            })
            await prisma.documentExtraction.update({
              where: { id: extraction.id },
              data: { extractionStatus: 'DONE', confidence: aiConfidence },
            })
          }
        } else {
          await prisma.documentExtraction.update({
            where: { id: extraction.id },
            data: { extractionStatus: 'DONE' },
          })
        }

        if (likelyRasterScan) {
          aiConfidence = Math.min(aiConfidence, 0.69)
        }

        structuredData = attachExtractionQualitySignals(
          structuredData,
          {
            filename,
            nativeTextConfidence,
            nativeTextLength,
            finalExtractionConfidence: aiConfidence,
            extractionMethod,
            pdfImageCount,
            pdfPagesWithImages,
            likelyRasterScan,
          },
        )

        await prisma.documentExtraction.update({
          where: { id: extraction.id },
          data: {
            structuredJson: structuredData as Prisma.InputJsonValue,
            confidence: aiConfidence,
          },
        })

        await prisma.document.update({
          where: { id: doc.id },
          data: { status: 'DONE' },
        })

        extractionResults.push({
          docType,
          data: structuredData,
          confidence: aiConfidence,
        })
        extractionConfirmationDocuments.push({
          extractionId: extraction.id,
          docType,
          filename,
          rawText,
          structuredData,
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

    const confirmation = await runExtractionConfirmationShadow({
      documents: extractionConfirmationDocuments,
    }).catch((confirmationErr) => {
      logger.warn('Extraction confirmation shadow pass failed, continuing processing', {
        submissionId,
        jobId,
        error: confirmationErr instanceof Error ? confirmationErr.message : String(confirmationErr),
      })
      return null
    })

    if (confirmation) {
      for (const input of extractionConfirmationDocuments) {
        const findings = confirmation.findingsByExtractionId.get(input.extractionId)
        if (!findings || findings.length === 0) continue
        const extractionResult = extractionResults.find((result) => result.data === input.structuredData)
        if (!extractionResult) continue
        extractionResult.data = {
          ...extractionResult.data,
          _extraction_confirmation_shadow: {
            promptVersion: confirmation.promptVersion,
            findings,
          },
        }
        await prisma.documentExtraction.update({
          where: { id: input.extractionId },
          data: { structuredJson: extractionResult.data as Prisma.InputJsonValue },
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
        const snapshot = await prisma.declarationSnapshot.create({
          data: {
            submissionId,
            tenantId,
            processingJobId: jobId,
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
            gtipCode: stringOrNull(d['gtip_code']),
            rawJson: d as Prisma.InputJsonValue,
          },
        })

        const items = extractDeclarationItems(d['items'])
        if (items.length > 0) {
          await prisma.declarationItem.createMany({
            data: items.map((item, index) => ({
              declarationSnapshotId: snapshot.id,
              tenantId,
              lineNumber: item.lineNumber ?? index + 1,
              gtipCode: item.gtipCode,
              goodsDescription: item.goodsDescription,
              quantity: item.quantity,
              unit: item.unit,
              netWeight: item.netWeight,
              grossWeight: item.grossWeight,
              value: item.value,
              currency: item.currency,
            })),
          })
        }
      }
    }

    // ─── RUNNING_RULES ─────────────────────────────────────────────────────────
    await updateJobStatus(jobId, submissionId, 'RUNNING_RULES', 'RUNNING_RULES')

    const declarationSnap = await prisma.declarationSnapshot.findFirst({
      where: { submissionId, tenantId, processingJobId: jobId },
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
            gtipCode: declarationSnap.gtipCode,
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
      id: randomUUID(),
      submissionId,
      tenantId,
      processingJobId: jobId,
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
      const citationRows = resultRows.flatMap((row) =>
        (ruleCitationIdsMap.get(row.ruleCode) ?? []).map((citationId) => ({
          ruleResultId: row.id,
          ruleLegalCitationId: citationId,
        })),
      )

      await prisma.ruleResult.createMany({ data: resultRows })

      if (citationRows.length > 0) {
        try {
          for (const chunk of chunkArray(citationRows, 100)) {
            await prisma.ruleResultCitation.createMany({
              data: chunk,
              skipDuplicates: true,
            })
          }
        } catch (citationErr) {
          logger.warn('Rule result citation persistence failed, continuing processing', {
            submissionId,
            jobId,
            error: citationErr instanceof Error ? citationErr.message : String(citationErr),
          })
        }
      }

      persistedRuleResults.push(...resultRows.map((row) => ({
        id: row.id,
        ruleCode: row.ruleCode,
        severity: row.severity,
        result: row.result,
        message: row.message,
        sourceRefsJson: row.sourceRefsJson,
        legalCitations: ruleCitationDetailsMap.get(row.ruleCode) ?? [],
      })))
    }

    // ─── AI_RULE_VALIDATING ───────────────────────────────────────────────────
    await updateJobStatus(jobId, submissionId, 'AI_RULE_VALIDATING', 'AI_RULE_VALIDATING')

    const aiRuleValidation = await runAiRuleValidationForSubmission({
      submissionId,
      tenantId,
      processingJobId: jobId,
      tradeFlow: submission.tradeFlow,
      documents: extractionResults,
      ruleResults: persistedRuleResults,
    }).catch((validationErr) => {
      logger.warn('AI rule validation failed outside guarded runner, continuing processing', {
        error: validationErr instanceof Error ? validationErr.message : String(validationErr),
      })
      return null
    })

    // ─── GENERATING_REPORT ─────────────────────────────────────────────────────
    await updateJobStatus(jobId, submissionId, 'GENERATING_REPORT', 'GENERATING_REPORT')

    const errors = resultRows.filter((r) => r.result === 'FAIL').length
    const warnings = resultRows.filter((r) => r.result === 'WARN').length
    const reviewNeeded = resultRows.filter((r) => r.result === 'REVIEW_NEEDED').length

    let summaryText: string | null = null
    let summaryProviderRunId: string | null = null
    let findingExplanations: Array<{ findingId: string; ruleCode: string; explanation: string }> = []

    // Stable finding IDs: deterministic findings use the persisted RuleResult
    // row id; AI-rule findings use a synthetic key derived from the rule
    // result they comment on. Rule codes alone are NOT unique.
    const aiRuleValidationFindingsForSummary = (aiRuleValidation?.findings ?? [])
      .filter((finding) => finding.status !== 'LIKELY_CORRECT')
      .map((finding) => ({
        findingId: `ai-rule:${finding.ruleResultId}`,
        ruleCode: `AI-RULE-${finding.ruleCode}`,
        severity: finding.status,
        message: `${finding.explanation} Öneri: ${finding.recommendation}`,
      }))
    const nonPassRuleFindings = persistedRuleResults
      .filter((r) => r.result !== 'PASS' && r.result !== 'SKIP')
      .sort((a, b) => summaryRulePriority(a.result) - summaryRulePriority(b.result))
      .map((r) => ({
        findingId: r.id,
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
    ]

    const documentCoverage = classifyDocumentCoverage({
      tradeFlow: submission.tradeFlow,
      uploadedDocTypes: extractionResults.map((document) => document.docType),
      documents: extractionResults.map((document) => ({
        docType: document.docType,
        data: document.data,
      })),
      declarationSnapshot: declarationSnap
        ? { regimeCode: declarationSnap.regimeCode }
        : null,
    })

    if (ai.isEnabled() && summaryFindings.length > 0) {
      try {
        // RAG: retrieve relevant regulation chunks to enrich the AI summary
        let regulationContext: Array<{ title: string; excerpt: string }> | undefined
        if (ai.embedText) {
          const embedStartedAt = Date.now()
          const embedRun = await prisma.providerRun.create({
            data: {
              tenantId,
              provider: 'openai',
              model: 'text-embedding-3-small',
              operation: 'embed_query',
              status: 'OK',
            },
          })
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
            await prisma.providerRun.update({
              where: { id: embedRun.id },
              data: { durationMs: Date.now() - embedStartedAt },
            })
          } catch (ragErr) {
            await prisma.providerRun.update({
              where: { id: embedRun.id },
              data: {
                status: 'ERROR',
                errorMessage: ragErr instanceof Error ? ragErr.message : 'RAG search failed',
                durationMs: Date.now() - embedStartedAt,
              },
            }).catch(() => {})
            logger.warn('RAG regulation search failed, proceeding without context', {
              error: ragErr instanceof Error ? ragErr.message : String(ragErr),
            })
          }
        }

        const summaryStartedAt = Date.now()
        const summaryRun = await prisma.providerRun.create({
          data: {
            tenantId,
            provider: 'openai',
            model: process.env['OPENAI_MODEL'] ?? 'gpt-4o',
            operation: 'risk_summary',
            status: 'OK',
            promptVersion: RISK_SUMMARY_PROMPT_VERSION,
          },
        })
        summaryProviderRunId = summaryRun.id

        try {
          const { result, meta } = await ai.generateRiskSummary(
            summaryFindings,
            submission.tradeFlow,
            regulationContext,
            {
              presentLabels: documentCoverage.presentLabels,
              missingExpectedLabels: documentCoverage.missingExpectedLabels,
              missingConditionalLabels: documentCoverage.missingConditionalLabels,
              missingReferencedInvoiceLabels: documentCoverage.missingReferencedInvoiceLabels,
              limitationNotice: documentCoverage.limitationNotice,
            },
          )
          summaryText = result.summary

          // Whitelist explanations against the findings we actually sent —
          // the model cannot inject explanations for fabricated IDs.
          const knownFindingIds = new Set(summaryFindings.map((f) => f.findingId))
          findingExplanations = result.findingExplanations
            .filter((explanation) => knownFindingIds.has(explanation.findingId))

          await prisma.providerRun.update({
            where: { id: summaryRun.id },
            data: {
              model: meta.model,
              inputTokens: meta.inputTokens,
              outputTokens: meta.outputTokens,
              estimatedCostUsd: meta.estimatedCostUsd,
              durationMs: meta.durationMs ?? Date.now() - summaryStartedAt,
            },
          })
        } catch (summaryErr) {
          await prisma.providerRun.update({
            where: { id: summaryRun.id },
            data: {
              status: 'ERROR',
              errorMessage: summaryErr instanceof Error ? summaryErr.message : 'Risk summary failed',
              durationMs: Date.now() - summaryStartedAt,
            },
          }).catch(() => {})
          throw summaryErr
        }
      } catch (err) {
        logger.warn('Risk summary generation failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    if (!summaryText && !documentCoverage.isComplete) {
      const missingLabels = [
        ...documentCoverage.missingExpectedLabels,
        ...documentCoverage.missingConditionalLabels,
        ...documentCoverage.missingReferencedInvoiceLabels,
      ]
      summaryText = missingLabels.length > 0
        ? `${documentCoverage.limitationNotice} Eksik beklenen belgeler: ${missingLabels.join(', ')}.`
        : documentCoverage.limitationNotice
    }

    await prisma.riskReport.create({
      data: {
        submissionId,
        tenantId,
        processingJobId: jobId,
        providerRunId: summaryProviderRunId,
        totalErrors: errors,
        totalWarnings: warnings,
        totalReviewNeeded: reviewNeeded,
        summaryText,
        findingExplanationsJson: findingExplanations.length > 0
          ? (findingExplanations as Prisma.InputJsonValue)
          : undefined,
        snapshotJson: resultRows as Prisma.InputJsonValue,
      },
    })

    // ─── COMPLETED ─────────────────────────────────────────────────────────────
    await supersedeExpertReviewsForNewReport(submissionId, tenantId, jobId)
    await updateJobStatus(jobId, submissionId, 'COMPLETED', 'COMPLETED')

    // Consume the reserved analysis credit. Idempotent per job; never fails the
    // pipeline. No-op when nothing was reserved (free reanalysis / unmetered).
    try {
      await consumeMetric({ metric: UsageMetric.ANALYSIS, processingJobId: jobId })
    } catch (meterErr) {
      logger.warn('processSubmission.consume_failed', {
        submissionId,
        jobId,
        error: meterErr instanceof Error ? meterErr.message : String(meterErr),
      })
    }

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

    // System/platform failure before a report was generated → release the credit.
    await refundMetric({
      metric: UsageMetric.ANALYSIS,
      processingJobId: jobId,
      reason: 'processing_failed',
    }).catch(() => {})
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

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

/**
 * Core fields per document type used to estimate how complete a structured
 * extraction is. Deliberately NOT the full (all-nullable) extraction schema:
 * legitimately sparse documents must not be penalized for optional fields.
 */
const CORE_EXTRACTION_FIELDS: Partial<Record<string, string[]>> = {
  INVOICE: ['invoice_number', 'invoice_date', 'seller_name', 'buyer_name', 'currency', 'total_amount'],
  PACKING_LIST: ['package_count', 'gross_weight'],
  LOADING_INSTRUCTION: ['shipper', 'consignee'],
  TRANSPORT_DOC: ['document_number', 'shipper', 'consignee'],
  DECLARATION_OUTPUT: ['declaration_number', 'regime_code', 'total_value', 'currency'],
  ORIGIN_DOC: ['country_of_origin', 'issuing_authority'],
}

function hasUsableExtractedValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length > 0
  const text = String(value).trim()
  return text.length > 0 && !isPlaceholderValue(text)
}

function jsonObjectOrEmpty(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

/**
 * Derives the confidence of a structured (text-based LLM) extraction instead
 * of asserting a fixed value: the read confidence of the underlying text is
 * blended with the fill rate of the doc type's core fields, and the result is
 * capped so structured extraction can never be trusted more than slightly
 * above the text it was derived from. This keeps failOrReview's 0.7 threshold
 * meaningful (see packages/rules/src/helpers.ts).
 */
function deriveStructuredExtractionConfidence(
  docType: DocumentType,
  data: Record<string, unknown>,
  readConfidence: number,
): number {
  const coreFields = CORE_EXTRACTION_FIELDS[docType]
  if (!coreFields || coreFields.length === 0) return roundConfidence(readConfidence)

  const filled = coreFields.filter((field) => hasUsableExtractedValue(data[field])).length
  const fillRate = filled / coreFields.length

  const blended = 0.55 * readConfidence + 0.45 * fillRate
  const capped = Math.min(blended, readConfidence + 0.15)
  return roundConfidence(Math.max(0.1, Math.min(0.99, capped)))
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
): Record<string, unknown> {
  const next = sanitizePlaceholderValues(data)

  if (docType === 'INVOICE') {
    const invoiceNumber = firstMatch(rawText, /Invoice Number:\s*([A-Z0-9]+)/i)
    const invoiceDate = firstMatch(rawText, /Invoice Date:\s*([0-9]{1,2}[-./][0-9]{1,2}[-./][0-9]{4})/i)
    const gtipCode = firstMatch(rawText, /\b(\d{12})\b/)
    const totalAmount = parseInvoiceTotalFromText(rawText)
    const itemQuantity = numberOrNull(firstMatch(rawText, /Toplam Miktar\s*:?\s*([+-]?\d[\d.,]*)\s*(?:EA|Adet|pcs?)/i))
    if (invoiceNumber) next['invoice_number'] = invoiceNumber
    if (invoiceDate) next['invoice_date'] = invoiceDate
    if (gtipCode) next['gtip_code'] = gtipCode
    if (totalAmount != null) next['total_amount'] = totalAmount
    if (/FREE OF CHARGE|BEDELS[İI]Z/i.test(rawText)) next['free_of_charge'] = true
    if (itemQuantity != null && itemQuantity > 0) {
      const existingItems = Array.isArray(next['items'])
        ? next['items'].filter((item): item is Record<string, unknown> =>
            item != null && typeof item === 'object' && !Array.isArray(item),
          )
        : []
      const item = {
        ...(existingItems[0] ?? {}),
        quantity: itemQuantity,
        unit: existingItems[0]?.['unit'] ?? (/\bAdet\b/i.test(rawText) ? 'Adet' : 'EA'),
        hs_code: existingItems[0]?.['hs_code'] ?? gtipCode ?? null,
      }
      next['items'] = [item, ...existingItems.slice(1)]
    }
    if (!hasExplicitNetWeightEvidence(rawText)) {
      next['net_weight'] = null
    }
  }

  if (docType === 'PACKING_LIST') {
    Object.assign(next, enhancePackingListFromText(next, rawText))
  }

  if (docType === 'LOADING_INSTRUCTION') {
    Object.assign(next, enhanceLoadingInstructionFromText(next, rawText))
  }

  if (docType === 'DECLARATION_OUTPUT') {
    // Prefer an explicitly labeled regime code; fall back to a known-code
    // match that cannot sit inside a larger number (e.g. "1.000,00" or
    // "31500"), then to a 4-digit code at the start of a line.
    const regimeCode =
      firstMatch(rawText, /Rejim(?:\s*Kodu)?\s*:?\s*(\d{4})\b/i) ??
      firstMatch(rawText, /(?<![\d.,])(1000|1040|3150|3151|3153|3171|2100)(?![\d.,])/) ??
      firstMatch(rawText, /^\s*(\d{4})\s+[\d.,]+/m)

    Object.assign(next, enhanceDeclarationOutputFromText(next, rawText))
    if (regimeCode && !/^\d{4}$/.test(String(next['regime_code'] ?? ''))) {
      next['regime_code'] = regimeCode
    }
  }

  return next
}

type ExtractionQualitySignals = {
  filename: string
  nativeTextConfidence: number
  nativeTextLength: number
  finalExtractionConfidence: number
  extractionMethod: string
  pdfImageCount: number
  pdfPagesWithImages: number
  likelyRasterScan: boolean
}

function attachExtractionQualitySignals(
  data: Record<string, unknown>,
  signals: ExtractionQualitySignals,
): Record<string, unknown> {
  return {
    ...data,
    [EXTRACTION_FILENAME_FIELD]: signals.filename,
    [NATIVE_TEXT_CONFIDENCE_FIELD]: roundConfidence(signals.nativeTextConfidence),
    [NATIVE_TEXT_LENGTH_FIELD]: signals.nativeTextLength,
    [FINAL_EXTRACTION_CONFIDENCE_FIELD]: roundConfidence(signals.finalExtractionConfidence),
    [EXTRACTION_METHOD_FIELD]: signals.extractionMethod,
    [PDF_IMAGE_COUNT_FIELD]: signals.pdfImageCount,
    [PDF_PAGES_WITH_IMAGES_FIELD]: signals.pdfPagesWithImages,
    [LIKELY_RASTER_SCAN_FIELD]: signals.likelyRasterScan,
  }
}

function sanitizePlaceholderValues(data: Record<string, unknown>): Record<string, unknown> {
  return sanitizeJsonValue(data) as Record<string, unknown>
}

function sanitizeJsonValue(value: unknown): unknown {
  if (typeof value === 'string') return isPlaceholderValue(value) ? null : value
  if (Array.isArray(value)) return value.map(sanitizeJsonValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      sanitizeJsonValue(nestedValue),
    ]),
  )
}

function hasExplicitNetWeightEvidence(rawText: string): boolean {
  return /\b(net\s*(weight|wt|kg)|netto|net ağırlık|net agirlik|toplam\s+net)\b/i.test(rawText)
}

function roundConfidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100))
}

function firstMatch(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern)
  return match?.[1]?.trim() ?? null
}

function parseInvoiceTotalFromText(rawText: string): number | null {
  const payable = firstMatch(rawText, /Payable Amount(?:\s*\(TL\))?[\s\S]{0,240}?([+-]?\d[\d.,]*)\s*EUR/i)
  const explicit = payable ?? firstMatch(rawText, /Total Price of Goods[\s\S]{0,240}?([+-]?\d[\d.,]*)\s*EUR/i)
  if (explicit) return numberOrNull(explicit)
  const eurValues = Array.from(rawText.matchAll(/([+-]?\d[\d.,]*)\s*EUR\b/gi))
    .map((match) => numberOrNull(match[1]))
    .filter((value): value is number => value != null && value > 0)
  if (eurValues.length === 0) return null
  return Math.max(...eurValues)
}

async function clearProcessingJobArtifacts(
  submissionId: string,
  tenantId: string,
  jobId: string,
) {
  await prisma.$transaction(async (tx) => {
    await tx.overrideAction.deleteMany({
      where: {
        tenantId,
        ruleResult: { submissionId, tenantId, processingJobId: jobId },
      },
    })
    await tx.ruleResult.deleteMany({ where: { submissionId, tenantId, processingJobId: jobId } })
    await tx.riskReport.deleteMany({ where: { submissionId, tenantId, processingJobId: jobId } })
    await tx.declarationItem.deleteMany({
      where: {
        tenantId,
        snapshot: { submissionId, tenantId, processingJobId: jobId },
      },
    })
    await tx.declarationSnapshot.deleteMany({ where: { submissionId, tenantId, processingJobId: jobId } })
  })
}

async function supersedeExpertReviewsForNewReport(
  submissionId: string,
  tenantId: string,
  jobId: string,
) {
  const supersededAt = new Date()
  await prisma.expertReview.updateMany({
    where: {
      submissionId,
      tenantId,
      supersededAt: null,
      OR: [
        { processingJobId: null },
        { processingJobId: { not: jobId } },
      ],
    },
    data: { supersededAt },
  })
}

function stringOrNull(val: unknown): string | null {
  if (val == null) return null
  const s = String(val).trim()
  return s === '' ? null : s
}

function numberOrNull(val: unknown): number | null {
  return toFiniteNumber(val)
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

function summaryRulePriority(result: string): number {
  if (result === 'FAIL') return 0
  if (result === 'REVIEW_NEEDED') return 1
  if (result === 'WARN') return 2
  return 3
}

type NormalizedDeclarationItem = {
  lineNumber: number | null
  gtipCode: string | null
  goodsDescription: string | null
  quantity: number | null
  unit: string | null
  netWeight: number | null
  grossWeight: number | null
  value: number | null
  currency: string | null
}

/** Normalize the extracted declaration items[] (kalem rows) for persistence. */
function extractDeclarationItems(raw: unknown): NormalizedDeclarationItem[] {
  if (!Array.isArray(raw)) return []
  const items: NormalizedDeclarationItem[] = []
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const normalized: NormalizedDeclarationItem = {
      lineNumber: intOrNull(item['line_number']),
      gtipCode: stringOrNull(item['gtip_code']),
      goodsDescription: stringOrNull(item['goods_description']),
      quantity: numberOrNull(item['quantity']),
      unit: stringOrNull(item['unit']),
      netWeight: numberOrNull(item['net_weight']),
      grossWeight: numberOrNull(item['gross_weight']),
      value: numberOrNull(item['value']),
      currency: stringOrNull(item['currency']),
    }
    const hasContent = Object.entries(normalized).some(
      ([key, value]) => key !== 'lineNumber' && value != null,
    )
    if (hasContent) items.push(normalized)
  }
  return items
}
