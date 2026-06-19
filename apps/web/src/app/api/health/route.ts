import { NextResponse } from 'next/server'
import { prisma } from '@gumrukyz/db'

export const dynamic = 'force-dynamic'

function isStrictHealthCheck(): boolean {
  return process.env['HEALTH_STRICT'] === 'true'
}

function isManagedDocumentReader(): boolean {
  return process.env['DOCUMENT_READER_MODE'] === 'managed'
}

export async function GET() {
  const checks: Record<string, boolean | string> = {
    database: false,
    trigger: Boolean(process.env['TRIGGER_SECRET_KEY']),
    blob: Boolean(process.env['BLOB_READ_WRITE_TOKEN']),
    openai: Boolean(process.env['OPENAI_API_KEY']),
    ocr: Boolean(process.env['OCR_SERVICE_URL']),
    azureDocIntel: Boolean(process.env['AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT']),
    clerk: Boolean(process.env['CLERK_SECRET_KEY']),
  }

  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = true
  } catch {
    checks.database = false
  }

  const requiredChecks: Array<keyof typeof checks> = ['database', 'clerk']
  if (isStrictHealthCheck()) {
    requiredChecks.push('blob', 'openai', 'trigger')
    if (isManagedDocumentReader()) {
      requiredChecks.push('azureDocIntel')
    }
  }

  const ok = requiredChecks.every((key) => checks[key] === true)

  return NextResponse.json(
    { ok, strict: isStrictHealthCheck(), checks, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  )
}
