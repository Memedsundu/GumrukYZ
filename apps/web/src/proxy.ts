import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  checkDistributedRateLimit,
  getRateLimitRoute,
  rateLimitResponseHeaders,
} from '@/lib/rate-limit'

const isPublicRoute = createRouteMatcher([
  '/',
  '/beta',
  '/ornek-rapor',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/api/health',
  '/api/ready',
  '/api/platform/reconcile',
])

const isOrgOptionalRoute = createRouteMatcher([
  '/onboarding(.*)',
  '/pilot-consent(.*)',
  '/api/pilot-consent',
])

async function enforcePostRateLimit(
  request: NextRequest,
  identifier: string,
): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl
  const route = getRateLimitRoute(pathname)
  if (!route) return null

  const result = await checkDistributedRateLimit({
    identifier,
    routeClass: route.routeClass,
    limit: route.limit,
  })

  if (result.success) return null

  return NextResponse.json(
    { error: 'Çok fazla istek gönderildi. Lütfen biraz bekleyip tekrar deneyin.' },
    {
      status: 429,
      headers: rateLimitResponseHeaders(result),
    },
  )
}

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'
}

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const { pathname } = request.nextUrl

  // Root URL: signed-out visitors see the public welcome/pricing page; signed-in
  // users are routed into the app.
  if (pathname === '/') {
    const { userId, orgId } = await auth()
    if (!userId) return
    return NextResponse.redirect(new URL(orgId ? '/dashboard' : '/onboarding', request.url))
  }

  if (isOrgOptionalRoute(request)) {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.redirect(new URL('/sign-in', request.url))
    }
    return
  }

  if (!isPublicRoute(request) && pathname.startsWith('/api/')) {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor' }, { status: 401 })
    }
    if (!orgId) {
      return NextResponse.json(
        { error: 'Devam etmek için bir organizasyon seçmeniz gerekiyor' },
        { status: 403 },
      )
    }

    if (request.method === 'POST') {
      const rateLimited = await enforcePostRateLimit(request, `org:${orgId}`)
      if (rateLimited) return rateLimited
    }

    return
  }

  // Public POST endpoints (e.g. sales leads) — IP-keyed rate limit before auth.
  if (request.method === 'POST' && pathname.startsWith('/api/')) {
    const rateLimited = await enforcePostRateLimit(request, `ip:${clientIp(request)}`)
    if (rateLimited) return rateLimited
  }

  if (!isPublicRoute(request)) {
    await auth.protect()

    const { orgId } = await auth()
    if (!orgId) {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
