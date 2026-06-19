import OpenAI from 'openai'

export type ThrottledProvider = 'openai' | 'azure'

const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504])

export class RetryableProviderError extends Error {
  readonly retryable = true

  constructor(
    readonly provider: ThrottledProvider,
    readonly statusCode: number | null,
    message: string,
  ) {
    super(message)
    this.name = 'RetryableProviderError'
  }
}

export class ProviderCircuitOpenError extends Error {
  readonly retryable = false

  constructor(message = 'Provider circuit is open — refusing retries to limit spend') {
    super(message)
    this.name = 'ProviderCircuitOpenError'
  }
}

type ProviderCircuitCheck = () => boolean | Promise<boolean>
let globalProviderCircuitCheck: ProviderCircuitCheck | null = null

/** Register a global spend/error circuit check (Wave 4). Called from apps/web at startup. */
export function setGlobalProviderCircuitCheck(check: ProviderCircuitCheck | null): void {
  globalProviderCircuitCheck = check
}

async function assertProviderCircuitClosed(): Promise<void> {
  if (!globalProviderCircuitCheck) return
  const open = await globalProviderCircuitCheck()
  if (open) throw new ProviderCircuitOpenError()
}

class Semaphore {
  private active = 0
  private readonly queue: Array<() => void> = []

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.limit <= 0) return fn()

    await new Promise<void>((resolve) => {
      const tryStart = () => {
        if (this.active < this.limit) {
          this.active++
          resolve()
          return
        }
        this.queue.push(tryStart)
      }
      tryStart()
    })

    try {
      return await fn()
    } finally {
      this.active--
      const next = this.queue.shift()
      if (next) next()
    }
  }
}

const semaphores = new Map<ThrottledProvider, Semaphore>()

function parseEnvInt(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

function getSemaphore(provider: ThrottledProvider): Semaphore {
  let semaphore = semaphores.get(provider)
  if (!semaphore) {
    const limit =
      provider === 'openai'
        ? parseEnvInt('OPENAI_PROVIDER_MAX_CONCURRENCY', 5)
        : parseEnvInt('AZURE_PROVIDER_MAX_CONCURRENCY', 3)
    semaphore = new Semaphore(limit)
    semaphores.set(provider, semaphore)
  }
  return semaphore
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function computeBackoffMs(baseMs: number, attempt: number): number {
  const exponential = baseMs * 2 ** attempt
  const jitter = Math.floor(Math.random() * 250)
  return Math.min(exponential + jitter, 30_000)
}

export function isRetryableHttpStatus(status: number): boolean {
  return RETRYABLE_HTTP_STATUSES.has(status)
}

export function isRetryableProviderError(error: unknown): boolean {
  if (error instanceof RetryableProviderError) return true
  if (error instanceof OpenAI.APIError) {
    return error.status != null && isRetryableHttpStatus(error.status)
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError') return true
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN') return true
  }
  return false
}

export async function withProviderThrottle<T>(
  provider: ThrottledProvider,
  fn: () => Promise<T>,
): Promise<T> {
  return getSemaphore(provider).run(fn)
}

export async function withProviderRetry<T>(
  provider: ThrottledProvider,
  fn: () => Promise<T>,
): Promise<T> {
  await assertProviderCircuitClosed()

  const maxAttempts = Math.max(1, parseEnvInt('PROVIDER_RETRY_MAX_ATTEMPTS', 4))
  const baseMs = Math.max(100, parseEnvInt('PROVIDER_RETRY_BASE_MS', 1000))

  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt >= maxAttempts - 1 || !isRetryableProviderError(error)) throw error
      await assertProviderCircuitClosed()
      await sleep(computeBackoffMs(baseMs, attempt))
    }
  }

  throw lastError
}

/** Concurrency limit + exponential backoff retry for transient provider failures. */
export async function callProvider<T>(
  provider: ThrottledProvider,
  fn: () => Promise<T>,
): Promise<T> {
  return withProviderThrottle(provider, () => withProviderRetry(provider, fn))
}

export async function fetchWithProviderRetry(
  provider: ThrottledProvider,
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  return callProvider(provider, async () => {
    const response = await fetch(input, init)
    if (isRetryableHttpStatus(response.status)) {
      const detail = await response.text().catch(() => '')
      throw new RetryableProviderError(
        provider,
        response.status,
        `${provider} request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      )
    }
    return response
  })
}
