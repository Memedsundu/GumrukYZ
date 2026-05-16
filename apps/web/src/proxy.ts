import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
])

// Simple in-process rate limiter (per-instance; no Redis needed for MVP).
// Limits mutating API endpoints to prevent abuse on a warm serverless function.
// Each slot: { count, windowStart }
const rateStore = new Map<string, { count: number; windowStart: number }>()
const RATE_WINDOW_MS = 60_000 // 1 minute
const LIMITS: Record<string, number> = {
  '/api/submissions': 30,         // POST new submission
  '/api/submissions/.*/process': 10, // POST process trigger
  '/api/clients': 60,
}

function getRateLimit(pathname: string): number | null {
  for (const [pattern, limit] of Object.entries(LIMITS)) {
    if (new RegExp(`^${pattern}$`).test(pathname)) return limit
  }
  return null
}

function checkRateLimit(key: string, limit: number): boolean {
  const now = Date.now()
  const slot = rateStore.get(key)

  if (!slot || now - slot.windowStart >= RATE_WINDOW_MS) {
    rateStore.set(key, { count: 1, windowStart: now })
    return true
  }

  if (slot.count >= limit) return false

  slot.count++
  return true
}

// Periodically clean up stale entries to prevent memory growth on long-lived instances
let lastCleanup = Date.now()
function maybeCleanup() {
  const now = Date.now()
  if (now - lastCleanup < 5 * 60_000) return
  lastCleanup = now
  for (const [key, slot] of rateStore.entries()) {
    if (now - slot.windowStart >= RATE_WINDOW_MS * 2) rateStore.delete(key)
  }
}

export default clerkMiddleware(async (auth, request: NextRequest) => {
  // Rate limiting for POST mutation endpoints
  if (request.method === 'POST') {
    const { pathname } = request.nextUrl
    const limit = getRateLimit(pathname)

    if (limit !== null) {
      maybeCleanup()
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? request.headers.get('x-real-ip')
        ?? 'unknown'
      const key = `${ip}:${pathname}`

      if (!checkRateLimit(key, limit)) {
        return NextResponse.json(
          { error: 'Too many requests. Please slow down.' },
          {
            status: 429,
            headers: {
              'Retry-After': '60',
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Window': '60',
            },
          },
        )
      }
    }
  }

  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
