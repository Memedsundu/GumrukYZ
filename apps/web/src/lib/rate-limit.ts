import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const RATE_WINDOW_MS = 60_000

/** Per-minute limits keyed by route class (not full pathname). */
export const ROUTE_RATE_LIMITS: Record<string, number> = {
  submissions: 30,
  process: 10,
  'expert-review': 6,
  assistant: 30,
  clients: 60,
  'sales-leads': 10,
}

const ROUTE_PATTERNS: Array<{ pattern: RegExp; routeClass: string }> = [
  { pattern: /^\/api\/submissions\/[^/]+\/process$/, routeClass: 'process' },
  { pattern: /^\/api\/submissions\/[^/]+\/expert-review$/, routeClass: 'expert-review' },
  { pattern: /^\/api\/submissions\/[^/]+\/assistant$/, routeClass: 'assistant' },
  { pattern: /^\/api\/submissions$/, routeClass: 'submissions' },
  { pattern: /^\/api\/clients$/, routeClass: 'clients' },
  { pattern: /^\/api\/sales-leads$/, routeClass: 'sales-leads' },
]

export type RateLimitRoute = {
  routeClass: string
  limit: number
}

export type RateLimitResult = {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

let redisClient: Redis | null | undefined
const upstashLimiters = new Map<string, Ratelimit>()

// Fallback when Upstash is not configured (local dev / per-instance).
const memoryStore = new Map<string, { count: number; windowStart: number }>()
let lastMemoryCleanup = Date.now()

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    redisClient = null
    return null
  }

  redisClient = new Redis({ url, token })
  return redisClient
}

export function isDistributedRateLimitEnabled(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

export function getRateLimitRoute(pathname: string): RateLimitRoute | null {
  for (const { pattern, routeClass } of ROUTE_PATTERNS) {
    if (!pattern.test(pathname)) continue
    const limit = ROUTE_RATE_LIMITS[routeClass]
    if (limit == null) return null
    return { routeClass, limit }
  }
  return null
}

function getUpstashLimiter(routeClass: string, limit: number): Ratelimit | null {
  const redis = getRedisClient()
  if (!redis) return null

  const cacheKey = `${routeClass}:${limit}`
  let limiter = upstashLimiters.get(cacheKey)
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, '1 m'),
      prefix: `gumrukyz:rl:${routeClass}`,
      analytics: false,
    })
    upstashLimiters.set(cacheKey, limiter)
  }
  return limiter
}

function maybeCleanupMemoryStore() {
  const now = Date.now()
  if (now - lastMemoryCleanup < 5 * 60_000) return
  lastMemoryCleanup = now
  for (const [key, slot] of memoryStore.entries()) {
    if (now - slot.windowStart >= RATE_WINDOW_MS * 2) memoryStore.delete(key)
  }
}

function checkMemoryRateLimit(key: string, limit: number): RateLimitResult {
  maybeCleanupMemoryStore()
  const now = Date.now()
  const slot = memoryStore.get(key)

  if (!slot || now - slot.windowStart >= RATE_WINDOW_MS) {
    memoryStore.set(key, { count: 1, windowStart: now })
    return { success: true, limit, remaining: limit - 1, reset: now + RATE_WINDOW_MS }
  }

  if (slot.count >= limit) {
    return { success: false, limit, remaining: 0, reset: slot.windowStart + RATE_WINDOW_MS }
  }

  slot.count++
  return { success: true, limit, remaining: limit - slot.count, reset: slot.windowStart + RATE_WINDOW_MS }
}

/** Tenant/org-keyed when identifier is orgId; IP-keyed for public endpoints. */
export async function checkDistributedRateLimit(params: {
  identifier: string
  routeClass: string
  limit: number
}): Promise<RateLimitResult> {
  const key = `${params.identifier}:${params.routeClass}`
  const limiter = getUpstashLimiter(params.routeClass, params.limit)

  if (!limiter) {
    return checkMemoryRateLimit(key, params.limit)
  }

  const result = await limiter.limit(key)
  return {
    success: result.success,
    limit: params.limit,
    remaining: result.remaining,
    reset: result.reset,
  }
}

export function rateLimitResponseHeaders(result: RateLimitResult): Record<string, string> {
  const retryAfterSec = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))
  return {
    'Retry-After': String(retryAfterSec),
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(Math.max(0, result.remaining)),
    'X-RateLimit-Reset': String(Math.ceil(result.reset / 1000)),
    'X-RateLimit-Window': '60',
  }
}

export async function pingRateLimitRedis(): Promise<boolean> {
  const redis = getRedisClient()
  if (!redis) return false
  try {
    const pong = await redis.ping()
    return pong === 'PONG'
  } catch {
    return false
  }
}
