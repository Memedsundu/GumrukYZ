export type { LlmProvider, DocumentClassificationResult, ExtractionResult, ExplanationResult, ProviderRunMetadata } from './provider.js'
export { OpenAIProvider } from './openai-provider.js'
export { AnthropicPlaceholder } from './anthropic-placeholder.js'
export * from './schemas.js'

import { OpenAIProvider } from './openai-provider.js'
import { AnthropicPlaceholder } from './anthropic-placeholder.js'

export function createLlmProvider(): OpenAIProvider | AnthropicPlaceholder {
  if (process.env['ANTHROPIC_ENABLED'] === 'true') {
    // AnthropicPlaceholder will throw on use; swap for real implementation in Phase 2
    return new AnthropicPlaceholder()
  }
  return new OpenAIProvider()
}
