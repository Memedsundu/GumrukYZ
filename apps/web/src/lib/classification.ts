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
      return { text: result.text, confidence: result.confidence, providerRunId: providerRun.id }
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

  const result = await extractTextFromPdf(
    document.latestVersion.fileUrl,
    document.latestVersion.originalFilename,
    document.latestVersion.mimeType,
  )
  return { text: result.text, confidence: result.confidence, providerRunId: null }
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
        detectedType: isFinalDocType(result.detectedType) ? result.detectedType : DocumentType.OTHER,
        confidence: result.confidence,
        detectedTradeFlow: result.detectedTradeFlow ?? TradeFlow.UNKNOWN,
        tradeFlowConfidence: result.tradeFlowConfidence ?? 0,
        reasoning: result.reasoning,
        sourceRefs: result.sourceRefs ?? [],
        parties: result.parties ?? [],
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

  const heuristic = classifyHeuristically(params.text, params.filename)
  return { ...heuristic, providerRunId: null }
}

function classifyHeuristically(text: string, filename: string) {
  const haystack = `${filename}\n${text}`.toLowerCase()
  const checks: Array<[string, RegExp, number, string]> = [
    [DocumentType.DECLARATION_OUTPUT, /(beyanname|tcgb|rejim kodu|gümrük idaresi|gumruk idaresi)/i, 0.82, 'Beyannameye ait alanlar tespit edildi.'],
    [DocumentType.INVOICE, /(invoice|fatura|e-fatura|seller|buyer|total amount|mal hizmet toplam)/i, 0.78, 'Fatura göstergeleri tespit edildi.'],
    [DocumentType.PACKING_LIST, /(packing list|çeki listesi|ceki listesi|gross weight|net weight|kap adedi)/i, 0.76, 'Çeki listesi/ağırlık göstergeleri tespit edildi.'],
    [DocumentType.LOADING_INSTRUCTION, /(yükleme talimat|yukleme talimat|loading instruction|yükleme yeri|teslim adresi)/i, 0.74, 'Yükleme talimatı göstergeleri tespit edildi.'],
    [DocumentType.TRANSPORT_DOC, /(cmr|konşimento|konsimento|bill of lading|air waybill|awb|taşıma belgesi|tasima belgesi)/i, 0.74, 'Taşıma belgesi göstergeleri tespit edildi.'],
    [DocumentType.ORIGIN_DOC, /(menşe|mense|certificate of origin|eur\.?1|a\.?tr|form a)/i, 0.74, 'Menşe belgesi göstergeleri tespit edildi.'],
    [DocumentType.PERMIT_DOC, /(izin|uygunluk|kontrol belgesi|inspection certificate|permit|tip onay)/i, 0.68, 'İzin/uygunluk belgesi göstergeleri tespit edildi.'],
  ]

  const match = checks.find(([, pattern]) => pattern.test(haystack))
  const trade = inferTradeFlow(haystack)
  return {
    detectedType: match?.[0] ?? DocumentType.OTHER,
    confidence: match?.[2] ?? 0.45,
    detectedTradeFlow: trade.value,
    tradeFlowConfidence: trade.confidence,
    reasoning: match?.[3] ?? 'Belge türü için güçlü bir gösterge bulunamadı.',
    sourceRefs: [{ field: 'filename', value: filename }],
    parties: extractPartiesHeuristically(text),
  }
}

function inferTradeFlow(text: string): { value: string; confidence: number } {
  const exportScore = scoreMatches(text, [/ihracat/i, /export/i, /exporter/i, /ihracatçı/i, /ihracatci/i])
  const importScore = scoreMatches(text, [/ithalat/i, /import/i, /importer/i, /ithalatçı/i, /ithalatci/i])
  if (exportScore === 0 && importScore === 0) return { value: TradeFlow.UNKNOWN, confidence: 0 }
  if (Math.abs(exportScore - importScore) <= 1) return { value: TradeFlow.UNKNOWN, confidence: 0.45 }
  return exportScore > importScore
    ? { value: TradeFlow.EXPORT, confidence: Math.min(0.95, 0.6 + exportScore * 0.1) }
    : { value: TradeFlow.IMPORT, confidence: Math.min(0.95, 0.6 + importScore * 0.1) }
}

function chooseTradeFlow(votes: Array<{ value: string; confidence: number }>): { value: string; confidence: number } {
  const totals = new Map<string, number>()
  for (const vote of votes) {
    totals.set(vote.value, (totals.get(vote.value) ?? 0) + vote.confidence)
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) return { value: TradeFlow.UNKNOWN, confidence: 0 }
  const [value, score] = ranked[0]!
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

function scoreMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0)
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
