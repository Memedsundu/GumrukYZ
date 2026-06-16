import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { buildSuggestionInput } from '@/lib/review-suggestions/build-input'
import { generateSuggestions } from '@/lib/review-suggestions/generate'
import type { SuggestionLanguage } from '@/lib/review-suggestions/types'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    const lang: SuggestionLanguage = req.nextUrl.searchParams.get('lang') === 'en' ? 'en' : 'tr'

    const input = await buildSuggestionInput(submissionId, user.tenantId, lang)
    if (!input) {
      // No report yet — nothing to suggest.
      return NextResponse.json({ assistant_intro: '', suggestions: [] })
    }

    const result = await generateSuggestions(input)
    return NextResponse.json(result)
  } catch (err) {
    console.error('GET /api/submissions/[id]/suggestions error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
