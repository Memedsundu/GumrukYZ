/**
 * Shared OpenAI structured-output client.
 *
 * All structured AI features (document reader, AI rule validation, expert
 * review) previously instantiated their own OpenAI client and duplicated the
 * responses.parse + zodTextFormat + usage-extraction boilerplate. This module
 * is the single place that owns that plumbing.
 */
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import type { z } from 'zod'
import { ProviderError } from '@gumrukyz/shared'
import { callProvider } from './provider-throttle.js'

export type StructuredUserContent =
  | string
  | Array<
      | { type: 'input_text'; text: string }
      | { type: 'input_file'; filename: string; file_data: string; detail?: 'low' | 'high' | 'auto' }
    >

export type StructuredParseRequest<T> = {
  model: string
  schema: z.ZodType<T>
  schemaName: string
  system: string
  user: StructuredUserContent
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh'
  maxOutputTokens?: number
  timeoutMs?: number
  maxRetries?: number
  /** Reuse an existing client (e.g. across retry attempts). */
  client?: OpenAI
}

export type StructuredParseResult<T> = {
  parsed: T
  responseModel: string
  inputTokens?: number
  outputTokens?: number
  durationMs: number
}

export function createStructuredOpenAIClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY']
  if (!apiKey) throw new ProviderError('openai', 'OPENAI_API_KEY is not set')
  return new OpenAI({ apiKey })
}

export async function parseStructuredOutput<T>(
  request: StructuredParseRequest<T>,
): Promise<StructuredParseResult<T>> {
  const client = request.client ?? createStructuredOpenAIClient()
  const startedAt = Date.now()

  const body: Record<string, unknown> = {
    model: request.model,
    input: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ],
    text: {
      format: zodTextFormat(request.schema, request.schemaName),
    },
  }
  if (request.reasoningEffort) body['reasoning'] = { effort: request.reasoningEffort }
  if (request.maxOutputTokens) body['max_output_tokens'] = request.maxOutputTokens

  const response = await callProvider('openai', () =>
    client.responses.parse(body as Parameters<OpenAI['responses']['parse']>[0], {
      timeout: request.timeoutMs ?? 60_000,
      maxRetries: 0,
    }),
  )

  const parsed = response.output_parsed as T | null
  if (!parsed) {
    throw new ProviderError('openai', `${request.schemaName} returned no parsed output`)
  }

  return {
    parsed,
    responseModel: String(response.model ?? request.model),
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
    durationMs: Date.now() - startedAt,
  }
}
