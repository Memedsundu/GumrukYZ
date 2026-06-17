import { prisma, Prisma } from '@gumrukyz/db'
import { OpenAIProvider } from '@gumrukyz/ai'
import { DocumentType, TradeFlow } from '@gumrukyz/domain'
import { logger } from '@gumrukyz/shared'
import { extractTextFromPdf } from './pdf-extractor'
import {
  isAzureDocumentIntelligenceEnabled,
  runAzureLayoutExtraction,
} from './azure-document-intelligence'

export const FINAL_DOC_TYPES = [
  DocumentType.INVOICE,
  DocumentType.PACKING_LIST,
  DocumentType.LOADING_INSTRUCTION,
  DocumentType.TRANSPORT_DOC,
  DocumentType.DECLARATION_OUTPUT,
  DocumentType.ORIGIN_DOC,
  DocumentType.PERMIT_DOC,
  DocumentType.OTHER,
] as const

export type PartyCandidate = {
  role: string
  name: string | null
  taxId?: string | null
  address?: string | null
  country?: string | null
}

export type ClientMatchCandidate = {
  id: string
  displayName: string
  taxId: string | null
  address: string | null
  country: string | null
  matchType: 'TAX_ID' | 'NAME_ADDRESS' | 'NAME'
  confidence: number
}

export type ClassificationResponse = {
  submission: {
    id: string
    suggestedTradeFlow: string
    suggestedTradeFlowConfidence: number
    classificationStatus: string
  }
  documents: Array<{
    id: string
    filename: string
    suggestedDocType: string
    confidence: number
    reasoning: string
    sourceRefs: Array<{ field: string; value: string }>
    parties: PartyCandidate[]
  }>
  clientMatches: ClientMatchCandidate[]
  requiresValidation: true
}

type ClassificationReadResult = {
  text: string
  confidence: number
  providerRunId: string | null
}

const MIN_CLASSIFICATION_TEXT_LENGTH = 120
const MIN_CLASSIFICATION_READ_CONFIDENCE = 0.55

type ClassificationDecision = {
  detectedType: string
  confidence: number
  detectedTradeFlow: string
  tradeFlowConfidence: number
  reasoning: string
  sourceRefs: Array<{ field: string; value: string }>
  parties: PartyCandidate[]
}

type DocumentForClassification = {
  id: string
  docType: string
  latestVersion: {
    fileUrl: string
    originalFilename: string
    mimeType: string
  } | null
}

export async function classifySubmissionDocuments(params: {
  submissionId: string
  tenantId: string
}): Promise<ClassificationResponse> {
  const submission = await prisma.submission.findFirst({
    where: { id: params.submissionId, tenantId: params.tenantId },
    include: {
      documents: {
        include: { latestVersion: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!submission) throw new Error('Submission not found')
  if (submission.documents.length === 0) throw new Error('No documents uploaded yet')

  await prisma.submission.update({
    where: { id: submission.id },
    data: { status: 'CLASSIFYING', classificationStatus: 'RUNNING' },
  })
  await prisma.documentClassificationSuggestion.deleteMany({
    where: { submissionId: submission.id, tenantId: params.tenantId },
  })

  const ai = new OpenAIProvider()
  const documentOutputs: ClassificationResponse['documents'] = []
  const tradeFlowVotes: Array<{ value: string; confidence: number }> = []
  const allParties: PartyCandidate[] = []

  for (const document of submission.documents) {
    if (document.isIgnored || !document.latestVersion) continue

    const read = await readForClassification(document, params.tenantId)
    const classified = await classifyText({
      tenantId: params.tenantId,
      ai,
      text: read.text,
      filename: document.latestVersion.originalFilename,
    })

    const parties = classified.parties.length > 0
      ? classified.parties
      : extractPartiesHeuristically(read.text)
    const sourceRefs = classified.sourceRefs.length > 0
      ? classified.sourceRefs
      : [{ field: 'filename', value: document.latestVersion.originalFilename }]

    await prisma.documentClassificationSuggestion.create({
      data: {
        submissionId: submission.id,
        documentId: document.id,
        tenantId: params.tenantId,
        providerRunId: classified.providerRunId ?? read.providerRunId,
        suggestedDocType: classified.detectedType,
        docTypeConfidence: classified.confidence,
        suggestedTradeFlow: classified.detectedTradeFlow,
        tradeFlowConfidence: classified.tradeFlowConfidence,
        reasoning: classified.reasoning,
        sourceRefsJson: sourceRefs as Prisma.InputJsonValue,
        extractedPartiesJson: parties as Prisma.InputJsonValue,
      },
    })

    await prisma.document.update({
      where: { id: document.id },
      data: {
        suggestedDocType: classified.detectedType,
        suggestedDocTypeConfidence: classified.confidence,
        classificationReasoning: classified.reasoning,
        classificationSourceRefsJson: sourceRefs as Prisma.InputJsonValue,
      },
    })

    if (classified.detectedTradeFlow && classified.detectedTradeFlow !== TradeFlow.UNKNOWN) {
      tradeFlowVotes.push({
        value: classified.detectedTradeFlow,
        confidence: classified.tradeFlowConfidence,
      })
    }
    allParties.push(...parties)

    documentOutputs.push({
      id: document.id,
      filename: document.latestVersion.originalFilename,
      suggestedDocType: classified.detectedType,
      confidence: classified.confidence,
      reasoning: classified.reasoning,
      sourceRefs,
      parties,
    })
  }

  const tradeFlow = chooseTradeFlow(tradeFlowVotes)
  const clientMatches = await matchBrokerClients(params.tenantId, allParties)

  await prisma.submission.update({
    where: { id: submission.id },
    data: {
      status: 'AWAITING_VALIDATION',
      classificationStatus: 'AWAITING_VALIDATION',
      suggestedTradeFlow: tradeFlow.value,
      suggestedTradeFlowConfidence: tradeFlow.confidence,
    },
  })

  return {
    submission: {
      id: submission.id,
      suggestedTradeFlow: tradeFlow.value,
      suggestedTradeFlowConfidence: tradeFlow.confidence,
      classificationStatus: 'AWAITING_VALIDATION',
    },
    documents: documentOutputs,
    clientMatches,
    requiresValidation: true,
  }
}

export async function classifySubmissionDocument(params: {
  submissionId: string
  tenantId: string
  documentId: string
}): Promise<ClassificationResponse> {
  const submission = await prisma.submission.findFirst({
    where: { id: params.submissionId, tenantId: params.tenantId },
    include: {
      documents: {
        where: { id: params.documentId },
        include: { latestVersion: true },
      },
    },
  })
  if (!submission) throw new Error('Submission not found')
  const document = submission.documents[0]
  if (!document) throw new Error('Document not found')

  await prisma.submission.update({
    where: { id: submission.id },
    data: { status: 'CLASSIFYING', classificationStatus: 'RUNNING' },
  })
  await prisma.documentClassificationSuggestion.deleteMany({
    where: {
      submissionId: submission.id,
      tenantId: params.tenantId,
      documentId: params.documentId,
    },
  })

  const documentOutputs: ClassificationResponse['documents'] = []
  const tradeFlowVotes: Array<{ value: string; confidence: number }> = []
  const allParties: PartyCandidate[] = []

  if (!document.isIgnored && document.latestVersion) {
    const ai = new OpenAIProvider()
    const read = await readForClassification(document, params.tenantId)
    const classified = await classifyText({
      tenantId: params.tenantId,
      ai,
      text: read.text,
      filename: document.latestVersion.originalFilename,
    })

    const parties = classified.parties.length > 0
      ? classified.parties
      : extractPartiesHeuristically(read.text)
    const sourceRefs = classified.sourceRefs.length > 0
      ? classified.sourceRefs
      : [{ field: 'filename', value: document.latestVersion.originalFilename }]

    await prisma.documentClassificationSuggestion.create({
      data: {
        submissionId: submission.id,
        documentId: document.id,
        tenantId: params.tenantId,
        providerRunId: classified.providerRunId ?? read.providerRunId,
        suggestedDocType: classified.detectedType,
        docTypeConfidence: classified.confidence,
        suggestedTradeFlow: classified.detectedTradeFlow,
        tradeFlowConfidence: classified.tradeFlowConfidence,
        reasoning: classified.reasoning,
        sourceRefsJson: sourceRefs as Prisma.InputJsonValue,
        extractedPartiesJson: parties as Prisma.InputJsonValue,
      },
    })

    await prisma.document.update({
      where: { id: document.id },
      data: {
        suggestedDocType: classified.detectedType,
        suggestedDocTypeConfidence: classified.confidence,
        classificationReasoning: classified.reasoning,
        classificationSourceRefsJson: sourceRefs as Prisma.InputJsonValue,
      },
    })

    if (classified.detectedTradeFlow && classified.detectedTradeFlow !== TradeFlow.UNKNOWN) {
      tradeFlowVotes.push({
        value: classified.detectedTradeFlow,
        confidence: classified.tradeFlowConfidence,
      })
    }
    allParties.push(...parties)

    documentOutputs.push({
      id: document.id,
      filename: document.latestVersion.originalFilename,
      suggestedDocType: classified.detectedType,
      confidence: classified.confidence,
      reasoning: classified.reasoning,
      sourceRefs,
      parties,
    })
  }

  const tradeFlow = chooseTradeFlow(tradeFlowVotes)
  const suggestedTradeFlow = tradeFlow.value !== TradeFlow.UNKNOWN
    ? tradeFlow.value
    : submission.suggestedTradeFlow ?? submission.tradeFlow
  const suggestedTradeFlowConfidence = tradeFlow.value !== TradeFlow.UNKNOWN
    ? tradeFlow.confidence
    : submission.suggestedTradeFlowConfidence ?? 0
  const clientMatches = await matchBrokerClients(params.tenantId, allParties)

  await prisma.submission.update({
    where: { id: submission.id },
    data: {
      status: 'AWAITING_VALIDATION',
      classificationStatus: 'AWAITING_VALIDATION',
      suggestedTradeFlow,
      suggestedTradeFlowConfidence,
    },
  })

  return {
    submission: {
      id: submission.id,
      suggestedTradeFlow,
      suggestedTradeFlowConfidence,
      classificationStatus: 'AWAITING_VALIDATION',
    },
    documents: documentOutputs,
    clientMatches,
    requiresValidation: true,
  }
}

export function normalizePartyName(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(ltd|sti|şti|as|a s|anonim|limited|company|co|inc|llc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeTaxId(value: string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

export function choosePrimaryClientParty(parties: PartyCandidate[], tradeFlow: string): PartyCandidate | null {
  const preferredRoles = tradeFlow === TradeFlow.EXPORT
    ? ['exporter', 'seller', 'shipper']
    : ['importer', 'buyer', 'consignee']
  return (
    preferredRoles
      .map((role) => parties.find((party) => party.role.toLowerCase().includes(role) && party.name))
      .find(Boolean) ??
    parties.find((party) => party.taxId || party.name) ??
    null
  )
}

export async function matchBrokerClients(
  tenantId: string,
  parties: PartyCandidate[],
): Promise<ClientMatchCandidate[]> {
  const taxIds = [...new Set(parties.map((party) => normalizeTaxId(party.taxId)).filter(Boolean))]
  if (taxIds.length > 0) {
    const exactMatches = await prisma.brokerClient.findMany({
      where: { tenantId, taxId: { in: taxIds as string[] } },
      take: 5,
    })
    if (exactMatches.length > 0) {
      return exactMatches.map((client) => ({
        id: client.id,
        displayName: client.displayName,
        taxId: client.taxId,
        address: client.address,
        country: client.country,
        matchType: 'TAX_ID',
        confidence: 0.99,
      }))
    }
  }

  const normalizedNames = [...new Set(parties.map((party) => normalizePartyName(party.name)).filter((name) => name.length >= 5))]
  const candidates = await prisma.brokerClient.findMany({
    where: { tenantId },
    take: 100,
  })

  const matches: ClientMatchCandidate[] = []
  for (const client of candidates) {
    const normalizedClient = normalizePartyName(client.displayName)
    const nameMatch = normalizedNames.some(
      (name) => name === normalizedClient || name.includes(normalizedClient) || normalizedClient.includes(name),
    )
    if (!nameMatch) continue

    const hasAddressOverlap = parties.some((party) => {
      if (!party.address || !client.address) return false
      return hasMeaningfulOverlap(party.address, client.address)
    })

    matches.push({
      id: client.id,
      displayName: client.displayName,
      taxId: client.taxId,
      address: client.address,
      country: client.country,
      matchType: hasAddressOverlap ? 'NAME_ADDRESS' : 'NAME',
      confidence: hasAddressOverlap ? 0.85 : 0.65,
    })
  }

  return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 5)
}

async function readForClassification(
  document: DocumentForClassification,
  tenantId: string,
): Promise<ClassificationReadResult> {
  if (!document.latestVersion) return { text: '', confidence: 0, providerRunId: null }

  if (isAzureDocumentIntelligenceEnabled()) {
    const startedAt = Date.now()
    const providerRun = await prisma.providerRun.create({
      data: {
        tenantId,
        provider: 'azure_doc_intel',
        model: process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID ?? 'prebuilt-layout',
        operation: 'classification_read',
        status: 'OK',
      },
    })

    try {
      const result = await runAzureLayoutExtraction(
        document.latestVersion.fileUrl,
        document.latestVersion.originalFilename,
        document.latestVersion.mimeType,
      )
      await prisma.providerRun.update({
        where: { id: providerRun.id },
        data: {
          model: result.modelId,
          estimatedCostUsd: result.estimatedCostUsd,
          durationMs: Date.now() - startedAt,
        },
      })
      const azureRead = { text: result.text, confidence: result.confidence, providerRunId: providerRun.id }
      if (isUsableClassificationRead(azureRead)) return azureRead

      logger.warn('Azure classification read was weak, trying native PDF text', {
        documentId: document.id,
        confidence: result.confidence,
        textLength: result.text.trim().length,
      })
      const nativeRead = await readNativeTextForClassification(document)
      return chooseBestClassificationRead(azureRead, nativeRead)
    } catch (error) {
      await prisma.providerRun.update({
        where: { id: providerRun.id },
        data: {
          status: 'ERROR',
          errorMessage: error instanceof Error ? error.message : 'Azure classification read failed',
          durationMs: Date.now() - startedAt,
        },
      })
      logger.warn('Azure classification read failed, falling back to native text probe', {
        documentId: document.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return readNativeTextForClassification(document)
}

async function readNativeTextForClassification(
  document: DocumentForClassification,
): Promise<ClassificationReadResult> {
  if (!document.latestVersion) return { text: '', confidence: 0, providerRunId: null }
  const result = await extractTextFromPdf(
    document.latestVersion.fileUrl,
    document.latestVersion.originalFilename,
    document.latestVersion.mimeType,
  )
  return { text: result.text, confidence: result.confidence, providerRunId: null }
}

function isUsableClassificationRead(read: ClassificationReadResult): boolean {
  return read.confidence >= MIN_CLASSIFICATION_READ_CONFIDENCE &&
    read.text.trim().length >= MIN_CLASSIFICATION_TEXT_LENGTH
}

function chooseBestClassificationRead(
  primary: ClassificationReadResult,
  fallback: ClassificationReadResult,
): ClassificationReadResult {
  if (isUsableClassificationRead(fallback) && !isUsableClassificationRead(primary)) return fallback
  const primaryUsefulChars = primary.text.trim().length
  const fallbackUsefulChars = fallback.text.trim().length
  if (fallback.confidence > primary.confidence && fallbackUsefulChars > primaryUsefulChars * 1.2) {
    return fallback
  }
  if (fallbackUsefulChars >= primaryUsefulChars + 300) return fallback
  return primary
}

async function classifyText(params: {
  tenantId: string
  ai: OpenAIProvider
  text: string
  filename: string
}): Promise<{
  detectedType: string
  confidence: number
  detectedTradeFlow: string
  tradeFlowConfidence: number
  reasoning: string
  sourceRefs: Array<{ field: string; value: string }>
  parties: PartyCandidate[]
  providerRunId: string | null
}> {
  const deterministic = classifyHeuristically(params.text, params.filename)

  if (params.ai.isEnabled() && params.text.trim().length > 20) {
    const providerRun = await prisma.providerRun.create({
      data: {
        tenantId: params.tenantId,
        provider: 'openai',
        model: process.env.OPENAI_MODEL ?? 'gpt-4o',
        operation: 'classify_document',
        status: 'OK',
      },
    })
    try {
      const { result, meta } = await params.ai.classifyDocument(params.text, params.filename)
      const merged = mergeClassifications({
        ai: {
          detectedType: isFinalDocType(result.detectedType) ? result.detectedType : DocumentType.OTHER,
          confidence: result.confidence,
          detectedTradeFlow: result.detectedTradeFlow ?? TradeFlow.UNKNOWN,
          tradeFlowConfidence: result.tradeFlowConfidence ?? 0,
          reasoning: result.reasoning,
          sourceRefs: result.sourceRefs ?? [],
          parties: result.parties ?? [],
        },
        deterministic,
      })
      await prisma.providerRun.update({
        where: { id: providerRun.id },
        data: {
          model: meta.model,
          inputTokens: meta.inputTokens,
          outputTokens: meta.outputTokens,
          estimatedCostUsd: meta.estimatedCostUsd,
          durationMs: meta.durationMs,
        },
      })
      return {
        ...merged,
        providerRunId: providerRun.id,
      }
    } catch (error) {
      await prisma.providerRun.update({
        where: { id: providerRun.id },
        data: {
          status: 'ERROR',
          errorMessage: error instanceof Error ? error.message : 'OpenAI classification failed',
        },
      })
      logger.warn('OpenAI classification failed, using heuristic classifier', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { ...deterministic, providerRunId: null }
}

export function classifyHeuristically(text: string, filename: string): ClassificationDecision {
  const normalizedFilename = normalizeClassificationText(filename)
  const normalizedText = normalizeClassificationText(text)
  const haystack = `${normalizedFilename}\n${normalizedText}`
  const scoredTypes = DOCUMENT_TYPE_SIGNAL_SETS.map((set) => {
    const matches = set.signals.filter((signal) => signal.pattern.test(haystack))
    const score = matches.reduce((total, signal) => total + signal.weight, 0)
    return { ...set, matches, score }
  }).sort((a, b) => b.score - a.score)
  const best = scoredTypes[0]
  const trade = inferTradeFlow(haystack)
  const hasMatch = Boolean(best && best.score > 0)

  return {
    detectedType: hasMatch ? best.docType : DocumentType.OTHER,
    confidence: hasMatch ? confidenceFromSignalScore(best.score) : 0.45,
    detectedTradeFlow: trade.value,
    tradeFlowConfidence: trade.confidence,
    reasoning: hasMatch ? best.reasoning : 'Belge türü için güçlü bir gösterge bulunamadı.',
    sourceRefs: hasMatch
      ? best.matches.slice(0, 3).map((signal) => ({ field: signal.field, value: signal.label }))
      : [{ field: 'filename', value: filename }],
    parties: extractPartiesHeuristically(text),
  }
}

function inferTradeFlow(text: string): { value: string; confidence: number } {
  const normalized = normalizeClassificationText(text)
  const exportScore = scoreWeightedMatches(normalized, [
    [/scenario\s*:?\s*ihracat/, 4],
    [/partytype\s*:?\s*export/, 4],
    [/mal ihracati|bedelsiz ihracat/, 4],
    [/\bihracatci\b|\bexporter\b/, 2],
    [/\bihracat\b|\bexport\b/, 2],
    [/\bcikis\s*\/\s*varis gumrugu\b/, 1],
    [/\bbosaltma adresi\b[\s\S]{0,250}\b(polonya|poland|germany|almanya|france|fransa|italy|italya|romania|romanya|bulgaria|bulgaristan)\b/, 2],
    [/\bturkiye\b[\s\S]{0,250}\b(polonya|poland|germany|almanya|france|fransa|italy|italya|romania|romanya|bulgaria|bulgaristan)\b/, 1],
  ])
  const importScore = scoreWeightedMatches(normalized, [
    [/scenario\s*:?\s*ithalat/, 4],
    [/partytype\s*:?\s*import/, 4],
    [/\bithalatci\b|\bimporter\b/, 2],
    [/\bithalat\b|\bimport\b/, 2],
    [/\bforeign seller\b[\s\S]{0,200}\bturkish buyer\b/, 2],
    [/\bvaris gumrugu\b[\s\S]{0,120}\b(turkiye|turkey|istanbul|ankara|izmir|muratbey|kapikule)\b/, 1],
  ])
  if (exportScore === 0 && importScore === 0) return { value: TradeFlow.UNKNOWN, confidence: 0 }
  if (Math.abs(exportScore - importScore) <= 1) return { value: TradeFlow.UNKNOWN, confidence: 0.45 }
  const winningScore = Math.max(exportScore, importScore)
  return exportScore > importScore
    ? { value: TradeFlow.EXPORT, confidence: roundClassificationConfidence(Math.min(0.95, 0.55 + winningScore * 0.08)) }
    : { value: TradeFlow.IMPORT, confidence: roundClassificationConfidence(Math.min(0.95, 0.55 + winningScore * 0.08)) }
}

function chooseTradeFlow(votes: Array<{ value: string; confidence: number }>): { value: string; confidence: number } {
  const totals = new Map<string, number>()
  for (const vote of votes) {
    totals.set(vote.value, (totals.get(vote.value) ?? 0) + vote.confidence)
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) return { value: TradeFlow.UNKNOWN, confidence: 0 }
  const [value, score] = ranked[0]!
  const secondScore = ranked[1]?.[1] ?? 0
  if (secondScore > 0 && score - secondScore < 0.2) {
    return { value: TradeFlow.UNKNOWN, confidence: 0.45 }
  }
  const maxPossible = votes.reduce((sum, vote) => sum + vote.confidence, 0)
  return { value, confidence: Math.round((score / Math.max(maxPossible, 1)) * 100) / 100 }
}

function extractPartiesHeuristically(text: string): PartyCandidate[] {
  const partyPatterns: Array<[string, RegExp]> = [
    ['seller', /(?:seller|satıcı|satici)\s*:?\s*(.+)/i],
    ['buyer', /(?:buyer|alıcı|alici)\s*:?\s*(.+)/i],
    ['importer', /(?:importer|ithalatçı|ithalatci)\s*:?\s*(.+)/i],
    ['exporter', /(?:exporter|ihracatçı|ihracatci)\s*:?\s*(.+)/i],
    ['consignee', /(?:consignee|alıcı|alici)\s*:?\s*(.+)/i],
    ['shipper', /(?:shipper|gönderici|gonderici)\s*:?\s*(.+)/i],
  ]
  const taxId = text.match(/\b(?:VKN|TAX(?:\s*ID)?|VERG[İI]\s*NO)\s*:?\s*([0-9]{8,11})\b/i)?.[1] ?? null
  const parties: PartyCandidate[] = []
  for (const [role, pattern] of partyPatterns) {
    const name = text.match(pattern)?.[1]?.split(/\s{2,}|\||;/)[0]?.trim().slice(0, 160)
    if (name) parties.push({ role, name, taxId })
  }
  return parties
}

function scoreWeightedMatches(text: string, patterns: Array<[RegExp, number]>): number {
  return patterns.reduce((score, [pattern, weight]) => score + (pattern.test(text) ? weight : 0), 0)
}

function isFinalDocType(value: string): value is (typeof FINAL_DOC_TYPES)[number] {
  return (FINAL_DOC_TYPES as readonly string[]).includes(value)
}

function hasMeaningfulOverlap(a: string, b: string): boolean {
  const left = new Set(normalizePartyName(a).split(' ').filter((word) => word.length >= 5))
  const right = new Set(normalizePartyName(b).split(' ').filter((word) => word.length >= 5))
  let overlaps = 0
  for (const word of left) {
    if (right.has(word)) overlaps += 1
  }
  return overlaps >= 2
}

function mergeClassifications(params: {
  ai: ClassificationDecision
  deterministic: ClassificationDecision
}): ClassificationDecision {
  const { ai, deterministic } = params
  const useDeterministicDocType =
    deterministic.detectedType !== DocumentType.OTHER &&
    deterministic.confidence >= 0.7 &&
    (
      ai.detectedType === DocumentType.OTHER ||
      ai.confidence < 0.65 ||
      (ai.detectedType !== deterministic.detectedType && deterministic.confidence >= 0.82 && ai.confidence < 0.9)
    )
  const useDeterministicTradeFlow =
    deterministic.detectedTradeFlow !== TradeFlow.UNKNOWN &&
    deterministic.tradeFlowConfidence >= 0.65 &&
    (
      ai.detectedTradeFlow === TradeFlow.UNKNOWN ||
      ai.tradeFlowConfidence < 0.65 ||
      (ai.detectedTradeFlow !== deterministic.detectedTradeFlow && deterministic.tradeFlowConfidence > ai.tradeFlowConfidence)
    )

  return {
    detectedType: useDeterministicDocType ? deterministic.detectedType : ai.detectedType,
    confidence: useDeterministicDocType ? deterministic.confidence : ai.confidence,
    detectedTradeFlow: useDeterministicTradeFlow ? deterministic.detectedTradeFlow : ai.detectedTradeFlow,
    tradeFlowConfidence: useDeterministicTradeFlow ? deterministic.tradeFlowConfidence : ai.tradeFlowConfidence,
    reasoning: useDeterministicDocType || useDeterministicTradeFlow
      ? deterministic.reasoning
      : ai.reasoning,
    sourceRefs: [
      ...(useDeterministicDocType || useDeterministicTradeFlow ? deterministic.sourceRefs : ai.sourceRefs),
      ...((useDeterministicDocType || useDeterministicTradeFlow) ? ai.sourceRefs.slice(0, 2) : deterministic.sourceRefs.slice(0, 2)),
    ].slice(0, 5),
    parties: ai.parties.length > 0 ? ai.parties : deterministic.parties,
  }
}

function normalizeClassificationText(value: string): string {
  return value
    .replace(/[İIı]/g, 'i')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

function confidenceFromSignalScore(score: number): number {
  if (score >= 5) return 0.92
  if (score >= 3) return 0.84
  if (score >= 2) return 0.76
  return 0.68
}

function roundClassificationConfidence(value: number): number {
  return Math.round(value * 100) / 100
}

const DOCUMENT_TYPE_SIGNAL_SETS: Array<{
  docType: string
  reasoning: string
  signals: Array<{ pattern: RegExp; weight: number; field: string; label: string }>
}> = [
  {
    docType: DocumentType.DECLARATION_OUTPUT,
    reasoning: 'Gümrük beyannamesi/kontrol çıktısı göstergeleri tespit edildi.',
    signals: [
      { pattern: /\bgumruk beyannamesi\b|\bt c gumruk beyannamesi\b/, weight: 5, field: 'text', label: 'gümrük beyannamesi' },
      { pattern: /\btcgb\b|\btescil no\b|\brejim\b|\bg t i p\b|\bgtip\b/, weight: 2, field: 'text', label: 'beyanname alanları' },
      { pattern: /\btoplam fob\b|\bg c amaci\b|\bgumruk mudurlugu\b/, weight: 2, field: 'text', label: 'gümrük çıktı alanları' },
      { pattern: /\bkontrol\b.*\.pdf\b|^kontrol\b/, weight: 2, field: 'filename', label: 'KONTROL dosya adı' },
    ],
  },
  {
    docType: DocumentType.INVOICE,
    reasoning: 'Fatura/e-Fatura göstergeleri tespit edildi.',
    signals: [
      { pattern: /\bcommercial invoice\b|\bticari fatura\b/, weight: 5, field: 'filename', label: 'commercial invoice/ticari fatura dosya adı veya başlığı' },
      { pattern: /\be fatura\b|\befatura\b|\bfatura\b|\binvoice\b/, weight: 4, field: 'text', label: 'fatura/invoice başlığı' },
      { pattern: /\binvoice number\b|\binvoice date\b|\bpayable amount\b|\btotal price of goods\b/, weight: 2, field: 'text', label: 'fatura alanları' },
      { pattern: /\bmal hizmet toplam\b|\btoplam tutar\b|\bkdv\b|\bett?n\b/, weight: 2, field: 'text', label: 'e-Fatura alanları' },
      { pattern: /\bfi\s*\d{4}\s*\d{4,}\b|\bfi\d{8,}\b/, weight: 4, field: 'filename', label: 'FI fatura numarası' },
    ],
  },
  {
    docType: DocumentType.PACKING_LIST,
    reasoning: 'Çeki listesi/ağırlık göstergeleri tespit edildi.',
    signals: [
      { pattern: /\bpacking list\b|\bceki listesi\b/, weight: 4, field: 'text', label: 'packing list/çeki listesi başlığı' },
      { pattern: /\bgross weight\b|\bnet weight\b|\bbrut agirlik\b|\bkap adedi\b|\bpackage type\b/, weight: 2, field: 'text', label: 'ağırlık/paket alanları' },
      { pattern: /\bpacking\b.*\.pdf\b|\bceki\b.*\.pdf\b/, weight: 3, field: 'filename', label: 'packing list dosya adı' },
    ],
  },
  {
    docType: DocumentType.LOADING_INSTRUCTION,
    reasoning: 'Yükleme talimatı göstergeleri tespit edildi.',
    signals: [
      { pattern: /\byukleme talimati\b|\byukleme talimat\b|\bloading instruction\b/, weight: 5, field: 'text', label: 'yükleme talimatı başlığı' },
      { pattern: /\bbosaltma adresi\b|\bcikis\s*\/\s*varis gumrugu\b|\bgumruk komisyoncusu\b|\bteslim sekli\b/, weight: 2, field: 'text', label: 'yükleme talimatı alanları' },
      { pattern: /\byukleme\b.*\btal/i, weight: 3, field: 'filename', label: 'yükleme talimatı dosya adı' },
    ],
  },
  {
    docType: DocumentType.TRANSPORT_DOC,
    reasoning: 'Taşıma belgesi göstergeleri tespit edildi.',
    signals: [
      { pattern: /\bcmr\b|\bbill of lading\b|\bkon[sş]imento\b|\bair waybill\b|\bawb\b/, weight: 4, field: 'text', label: 'taşıma belgesi başlığı' },
      { pattern: /\bconsignment note\b|\btruck plate\b|\bvehicle\b|\bcarrier\b/, weight: 1.5, field: 'text', label: 'taşıma alanları' },
    ],
  },
  {
    docType: DocumentType.ORIGIN_DOC,
    reasoning: 'Menşe belgesi göstergeleri tespit edildi.',
    signals: [
      { pattern: /\bmense\b|\bcertificate of origin\b|\beur\.?1\b|\ba\.?tr\b|\bform a\b/, weight: 4, field: 'text', label: 'menşe belgesi başlığı' },
    ],
  },
  {
    docType: DocumentType.PERMIT_DOC,
    reasoning: 'İzin/uygunluk belgesi göstergeleri tespit edildi.',
    signals: [
      { pattern: /\bkontrol belgesi\b|\buygunluk\b|\bizin\b|\bpermit\b|\binspection certificate\b|\btip onay\b/, weight: 3, field: 'text', label: 'izin/uygunluk alanları' },
    ],
  },
]
