/**
 * Central model pricing table (USD per 1M tokens).
 *
 * Single source of truth for AI cost estimation — previously each call site
 * (extraction, rule validation, expert review, document reader) carried its
 * own diverging copy. Update prices here only.
 */

type ModelRates = { inputUsdPerMTok: number; outputUsdPerMTok: number }

const MODEL_RATES: Array<{ match: RegExp; rates: ModelRates }> = [
  { match: /gpt-5\.5/, rates: { inputUsdPerMTok: 5, outputUsdPerMTok: 30 } },
  { match: /gpt-5\.4-mini/, rates: { inputUsdPerMTok: 0.75, outputUsdPerMTok: 4.5 } },
  { match: /gpt-5-mini/, rates: { inputUsdPerMTok: 0.25, outputUsdPerMTok: 2 } },
  { match: /gpt-4\.1-mini/, rates: { inputUsdPerMTok: 0.4, outputUsdPerMTok: 1.6 } },
  { match: /gpt-4o/, rates: { inputUsdPerMTok: 2.5, outputUsdPerMTok: 10 } },
  { match: /text-embedding-3-small/, rates: { inputUsdPerMTok: 0.02, outputUsdPerMTok: 0 } },
  { match: /text-embedding-3-large/, rates: { inputUsdPerMTok: 0.13, outputUsdPerMTok: 0 } },
]

const DEFAULT_RATES: ModelRates = { inputUsdPerMTok: 2.5, outputUsdPerMTok: 10 }

function ratesForModel(model: string): ModelRates {
  const normalized = model.toLowerCase()
  return MODEL_RATES.find(({ match }) => match.test(normalized))?.rates ?? DEFAULT_RATES
}

/**
 * Estimates the cost of a model call in USD (rounded to 6 decimals).
 * Returns undefined when token usage is unknown.
 */
export function estimateModelCostUsd(
  model: string,
  inputTokens?: number,
  outputTokens?: number,
): number | undefined {
  if (typeof inputTokens !== 'number') return undefined
  const rates = ratesForModel(model)
  const cost =
    (inputTokens * rates.inputUsdPerMTok + (outputTokens ?? 0) * rates.outputUsdPerMTok) /
    1_000_000
  return Math.round(cost * 1_000_000) / 1_000_000
}
