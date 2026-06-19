export type { LlmProvider, DocumentClassificationResult, ExtractionResult, ExplanationResult, ProviderRunMetadata, RiskSummaryFindingInput } from './provider.js'
export { OpenAIProvider, RISK_SUMMARY_PROMPT_VERSION } from './openai-provider.js'
export { AnthropicPlaceholder } from './anthropic-placeholder.js'
export {
  callProvider,
  fetchWithProviderRetry,
  isRetryableHttpStatus,
  isRetryableProviderError,
  ProviderCircuitOpenError,
  RetryableProviderError,
  setGlobalProviderCircuitCheck,
  type ThrottledProvider,
  withProviderRetry,
  withProviderThrottle,
} from './provider-throttle.js'
export {
  createStructuredOpenAIClient,
  parseStructuredOutput,
  type StructuredParseRequest,
  type StructuredParseResult,
  type StructuredUserContent,
} from './structured-client.js'
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
