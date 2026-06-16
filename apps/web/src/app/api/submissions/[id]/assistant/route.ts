import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiUser } from '@/lib/auth'
import { answerFileQuestion } from '@/lib/file-assistant'

interface Params {
  params: Promise<{ id: string }>
}

export const maxDuration = 60

const RequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
  language: z.enum(['tr', 'en']).optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    const parsed = RequestSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
    }

    const result = await answerFileQuestion({
      submissionId,
      tenantId: user.tenantId,
      messages: parsed.data.messages,
      language: parsed.data.language,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ answer: result.answer })
  } catch (err) {
    console.error('POST /api/submissions/[id]/assistant error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
