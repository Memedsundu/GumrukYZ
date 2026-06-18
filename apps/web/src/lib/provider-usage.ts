import { Prisma } from '@gumrukyz/db'
import type { AzureDocumentIntelligenceResult } from './azure-document-intelligence'

type OpenAITokenUsage = {
  model?: string
  inputTokens?: number
  outputTokens?: number
  estimatedCostUsd?: number
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function roundDecimal(value: number, places: number): number {
  const multiplier = 10 ** places
  return Math.round(value * multiplier) / multiplier
}

export function azureProviderUsageFields(
  result: AzureDocumentIntelligenceResult,
): Prisma.ProviderRunUpdateInput {
  const pageCount = Math.max(result.pageCount, 0)
  const billablePages = Math.max(pageCount, 1)
  const unitPriceUsd = result.estimatedCostUsd > 0
    ? roundDecimal(result.estimatedCostUsd / billablePages, 8)
    : undefined

  return {
    model: result.modelId,
    pageCount,
    billableUnits: billablePages,
    billableUnitType: 'page',
    unitPriceUsd,
    estimatedCostUsd: result.estimatedCostUsd,
    usageMetadataJson: {
      apiVersion: result.apiVersion,
      tableCount: result.tableCount,
      costBasis: 'azure_document_intelligence_layout',
    } as Prisma.InputJsonValue,
  }
}

export function openAIProviderUsageFields(usage: OpenAITokenUsage): Prisma.ProviderRunUpdateInput {
  const inputTokens = finiteNumber(usage.inputTokens)
  const outputTokens = finiteNumber(usage.outputTokens)
  const totalTokens = (inputTokens ?? 0) + (outputTokens ?? 0)
  const estimatedCostUsd = finiteNumber(usage.estimatedCostUsd)
  const unitPriceUsd = estimatedCostUsd != null && totalTokens > 0
    ? roundDecimal(estimatedCostUsd / totalTokens, 8)
    : undefined

  return {
    ...(usage.model ? { model: usage.model } : {}),
    inputTokens,
    outputTokens,
    billableUnits: totalTokens > 0 ? totalTokens : undefined,
    billableUnitType: totalTokens > 0 ? 'token' : undefined,
    unitPriceUsd,
    estimatedCostUsd,
    usageMetadataJson: {
      inputTokens: inputTokens ?? null,
      outputTokens: outputTokens ?? null,
      totalTokens: totalTokens > 0 ? totalTokens : null,
      costBasis: 'openai_input_output_tokens',
    } as Prisma.InputJsonValue,
  }
}
