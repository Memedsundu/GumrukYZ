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

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const client = await prisma.brokerClient.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        _count: { select: { submissions: true } },
      },
    })
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    return NextResponse.json({ client })
  } catch (err) {
    console.error('GET /api/clients/[id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    if (!['TENANT_MANAGER', 'PLATFORM_ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const client = await prisma.brokerClient.findFirst({
      where: { id, tenantId: user.tenantId },
    })
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    const body = await req.json() as { displayName?: string; taxId?: string; country?: string }
    const displayName = body.displayName?.trim()
    const taxId = body.taxId !== undefined ? (body.taxId?.trim() || null) : undefined
    const country = body.country?.trim()

    if (taxId) {
      const duplicate = await prisma.brokerClient.findFirst({
        where: { tenantId: user.tenantId, taxId, id: { not: id } },
      })
      if (duplicate) {
        return NextResponse.json(
          { error: `Tax ID already used by another client: ${duplicate.displayName}` },
          { status: 409 },
        )
      }
    }

    const updated = await prisma.brokerClient.update({
      where: { id },
      data: {
        ...(displayName !== undefined && { displayName, normalizedName: normalize(displayName) }),
        ...(taxId !== undefined && { taxId }),
        ...(country !== undefined && { country }),
      },
    })

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'UPDATE',
        entityType: 'BrokerClient',
        entityId: id,
        beforeJson: { displayName: client.displayName, taxId: client.taxId, country: client.country } as Prisma.InputJsonValue,
        afterJson: { displayName: updated.displayName, taxId: updated.taxId, country: updated.country } as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json({ client: updated })
  } catch (err) {
    console.error('PATCH /api/clients/[id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    if (!['TENANT_MANAGER', 'PLATFORM_ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const client = await prisma.brokerClient.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { _count: { select: { submissions: true } } },
    })
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    if (client._count.submissions > 0) {
      return NextResponse.json(
        { error: `Cannot delete: client has ${client._count.submissions} submission(s). Reassign them first.` },
        { status: 409 },
      )
    }

    await prisma.brokerClient.delete({ where: { id } })

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'DELETE',
        entityType: 'BrokerClient',
        entityId: id,
        beforeJson: { displayName: client.displayName, taxId: client.taxId } as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/clients/[id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
