import { z } from 'zod'
import type { LlmProvider, DocumentClassificationResult, ExplanationResult, ProviderRunMetadata } from './provider.js'
import type { DocumentType } from '@gumrukyz/domain'

/**
 * Anthropic Claude placeholder — not implemented.
 * Interface is ready; implementation deferred to Phase 2.
 * Enable by setting ANTHROPIC_ENABLED=true in environment.
 */
export class AnthropicPlaceholder implements LlmProvider {
  isEnabled(): boolean {
    return false
  }

  async classifyDocument(
    _rawText: string,
    _filename: string,
  ): Promise<{ result: DocumentClassificationResult; meta: ProviderRunMetadata }> {
    throw new Error('AnthropicPlaceholder: not implemented. Set ANTHROPIC_ENABLED=false.')
  }

  async extractStructured<T>(
    _rawText: string,
    _schema: z.ZodType<T>,
    _schemaName: string,
    _docType: DocumentType,
  ): Promise<{ result: T; meta: ProviderRunMetadata }> {
    throw new Error('AnthropicPlaceholder: not implemented.')
  }

  async generateRiskSummary(
    _findings: Array<{ ruleCode: string; severity: string; message: string }>,
    _tradeFlow: string,
  ): Promise<{ result: ExplanationResult; meta: ProviderRunMetadata }> {
    throw new Error('AnthropicPlaceholder: not implemented.')
  }
}
