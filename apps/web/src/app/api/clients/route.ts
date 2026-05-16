import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma, Prisma } from '@gumrukyz/db'

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(_req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    if (!['TENANT_MANAGER', 'PLATFORM_ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json() as { displayName?: string; taxId?: string; country?: string }
    const displayName = body.displayName?.trim()
    const taxId = body.taxId?.trim() || null
    const country = body.country?.trim() || 'TR'

    if (!displayName) {
      return NextResponse.json({ error: 'displayName is required' }, { status: 400 })
    }

    if (taxId) {
      const existing = await prisma.brokerClient.findFirst({
        where: { tenantId: user.tenantId, taxId },
      })
      if (existing) {
        return NextResponse.json(
          { error: `A client with tax ID "${taxId}" already exists: ${existing.displayName}` },
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
