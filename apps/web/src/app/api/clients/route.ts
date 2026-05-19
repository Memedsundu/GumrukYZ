import { NextRequest, NextResponse } from 'next/server'
import { prisma, Prisma } from '@gumrukyz/db'
import { canManageTenant, requireApiUser } from '@/lib/auth'

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET() {
  try {
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    const clients = await prisma.brokerClient.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { displayName: 'asc' },
      include: {
        _count: { select: { submissions: true } },
      },
    })

    return NextResponse.json({ clients })
  } catch (err) {
    console.error('GET /api/clients error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    if (!canManageTenant(user)) {
      return NextResponse.json({ error: 'Bu işlem için yetkiniz yok' }, { status: 403 })
    }

    const body = await req.json() as { displayName?: string; taxId?: string; country?: string }
    const displayName = body.displayName?.trim()
    const taxId = body.taxId?.trim() || null
    const country = body.country?.trim() || 'TR'

    if (!displayName) {
      return NextResponse.json({ error: 'Müşteri adı zorunludur' }, { status: 400 })
    }

    if (taxId) {
      const existing = await prisma.brokerClient.findFirst({
        where: { tenantId: user.tenantId, taxId },
      })
      if (existing) {
        return NextResponse.json(
          { error: `"${taxId}" vergi numaralı müşteri zaten var: ${existing.displayName}` },
          { status: 409 },
        )
      }
    }

    const client = await prisma.brokerClient.create({
      data: {
        displayName,
        normalizedName: normalize(displayName),
        taxId,
        country,
        tenantId: user.tenantId,
      },
    })

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'CREATE',
        entityType: 'BrokerClient',
        entityId: client.id,
        afterJson: { displayName, taxId, country } as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json({ client }, { status: 201 })
  } catch (err) {
    console.error('POST /api/clients error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
