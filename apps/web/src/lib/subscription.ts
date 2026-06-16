import { prisma, Prisma } from '@gumrukyz/db'
import type { TenantSubscription } from '@gumrukyz/db'
import {
  BillingInterval,
  SalesLeadKind,
  TenantPlan,
  TenantSubscriptionStatus,
  TRIAL_POLICY,
  type PlanLimits,
  type PlanPrice,
} from '@gumrukyz/domain'

const DAY_MS = 24 * 60 * 60 * 1000

// Common free/personal email providers. A trial on one of these domains is
// scoped per owner-email + organization rather than per domain.
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'yandex.com',
  'yandex.com.tr',
  'mail.ru',
  'gmx.com',
  'aol.com',
])

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@')
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase()
}

export function isPersonalEmailDomain(domain: string): boolean {
  return PERSONAL_EMAIL_DOMAINS.has(domain.toLowerCase())
}

/** Lower-cased, punctuation/suffix-stripped org name for duplicate detection. */
export function normalizeOrgName(name: string): string {
  return name
    .toLocaleLowerCase('tr-TR')
    .replace(/[.,]/g, ' ')
    .replace(
      /\b(a\.?ş|aş|ltd|şti|sti|san|tic|ith|ihr|gümrük|gumruk|müşavirliği|musavirligi|lojistik|limited|anonim|şirketi|sirketi)\b/g,
      ' ',
    )
    .replace(/[^a-z0-9çğıöşü\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface PlanChangeInput {
  tenantId: string
  planCode: string
  status?: string
  billingInterval?: string
  limitsOverride?: Partial<PlanLimits> | null
  priceSnapshot?: PlanPrice | null
  customNotes?: string | null
  trialEndsAt?: Date | null
  graceUntil?: Date | null
  currentPeriodStart?: Date | null
  currentPeriodEnd?: Date | null
  actor: { userId: string | null; ip?: string | null }
}

/**
 * The single write path for a tenant's commercial state. Upserts the
 * subscription, keeps the denormalized `Tenant.plan` mirror in sync, and writes
 * an audit log — all in one transaction. Nothing else should write
 * `Tenant.plan` (besides initial provisioning) or `TenantSubscription`.
 */
export async function applyPlanChange(input: PlanChangeInput): Promise<TenantSubscription> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.tenantSubscription.findUnique({
      where: { tenantId: input.tenantId },
    })

    const data = {
      planCode: input.planCode,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.billingInterval !== undefined ? { billingInterval: input.billingInterval } : {}),
      ...(input.limitsOverride !== undefined
        ? {
            limitsOverrideJson:
              input.limitsOverride === null
                ? Prisma.DbNull
                : (input.limitsOverride as unknown as Prisma.InputJsonValue),
          }
        : {}),
      ...(input.priceSnapshot !== undefined
        ? {
            priceSnapshotJson:
              input.priceSnapshot === null
                ? Prisma.DbNull
                : (input.priceSnapshot as unknown as Prisma.InputJsonValue),
          }
        : {}),
      ...(input.customNotes !== undefined ? { customNotes: input.customNotes } : {}),
      ...(input.trialEndsAt !== undefined ? { trialEndsAt: input.trialEndsAt } : {}),
      ...(input.graceUntil !== undefined ? { graceUntil: input.graceUntil } : {}),
      ...(input.currentPeriodStart !== undefined
        ? { currentPeriodStart: input.currentPeriodStart }
        : {}),
      ...(input.currentPeriodEnd !== undefined ? { currentPeriodEnd: input.currentPeriodEnd } : {}),
    }

    const subscription = await tx.tenantSubscription.upsert({
      where: { tenantId: input.tenantId },
      update: data,
      create: {
        tenantId: input.tenantId,
        billingInterval: BillingInterval.NONE,
        status: TenantSubscriptionStatus.ACTIVE,
        ...data,
      },
    })

    await tx.tenant.update({
      where: { id: input.tenantId },
      data: { plan: input.planCode },
    })

    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.actor.userId,
        action: 'subscription.plan_changed',
        entityType: 'TenantSubscription',
        entityId: subscription.id,
        beforeJson: before
          ? ({ planCode: before.planCode, status: before.status } as Prisma.InputJsonValue)
          : Prisma.DbNull,
        afterJson: {
          planCode: subscription.planCode,
          status: subscription.status,
          billingInterval: subscription.billingInterval,
        } as Prisma.InputJsonValue,
        ipAddress: input.actor.ip ?? null,
      },
    })

    return subscription
  })
}

export interface CreateTrialInput {
  tenantId: string
  ownerEmail: string
  orgName: string
  clerkUserId: string
}

export type CreateTrialResult =
  | { kind: 'created'; subscription: TenantSubscription }
  | { kind: 'existing'; subscription: TenantSubscription }
  | { kind: 'blocked'; leadId: string; reason: 'duplicate_domain' | 'duplicate_owner_org' }

/**
 * Start a 14-day Firma trial for a brand-new commercial tenant. Enforces
 * one-trial-per-business-domain (or per owner-email + org for personal domains)
 * via the unique TrialClaim ledger; a duplicate attempt records a SalesLead
 * instead of granting a second trial.
 */
export async function createTrialForTenant(input: CreateTrialInput): Promise<CreateTrialResult> {
  const existing = await prisma.tenantSubscription.findUnique({
    where: { tenantId: input.tenantId },
  })
  if (existing) return { kind: 'existing', subscription: existing }

  const domain = emailDomain(input.ownerEmail)
  const personal = isPersonalEmailDomain(domain)
  const normalizedOrg = normalizeOrgName(input.orgName)
  const ownerEmail = input.ownerEmail.trim().toLowerCase()
  const claimKey = personal
    ? `owner:${ownerEmail}|org:${normalizedOrg}`
    : `domain:${domain}`

  // Idempotent re-accept by the same tenant is allowed; a claim owned by a
  // different tenant blocks the trial.
  const priorClaim = await prisma.trialClaim.findUnique({ where: { claimKey } })
  if (priorClaim && priorClaim.tenantId !== input.tenantId) {
    const lead = await prisma.salesLead.create({
      data: {
        kind: SalesLeadKind.TRIAL_BLOCKED_DUPLICATE,
        email: ownerEmail,
        emailDomain: domain,
        normalizedOrg,
        requestedPlan: TenantPlan.PRO,
        clerkUserId: input.clerkUserId,
        tenantId: input.tenantId,
        message: 'Tekrarlanan deneme talebi engellendi.',
        metadataJson: { claimKey } as Prisma.InputJsonValue,
      },
    })
    return {
      kind: 'blocked',
      leadId: lead.id,
      reason: personal ? 'duplicate_owner_org' : 'duplicate_domain',
    }
  }

  const now = new Date()
  const trialEndsAt = new Date(now.getTime() + TRIAL_POLICY.durationDays * DAY_MS)

  try {
    const subscription = await prisma.$transaction(async (tx) => {
      await tx.trialClaim.create({
        data: {
          claimKey,
          emailDomain: domain,
          ownerEmail: personal ? ownerEmail : null,
          normalizedOrg,
          tenantId: input.tenantId,
        },
      })

      const sub = await tx.tenantSubscription.create({
        data: {
          tenantId: input.tenantId,
          planCode: TenantPlan.PRO,
          status: TenantSubscriptionStatus.TRIALING,
          billingInterval: BillingInterval.NONE,
          trialStartedAt: now,
          trialEndsAt,
          trialAnalysisCap: TRIAL_POLICY.analysisCap,
          currentPeriodStart: now,
          currentPeriodEnd: trialEndsAt,
        },
      })

      await tx.tenant.update({
        where: { id: input.tenantId },
        data: { plan: TenantPlan.PRO },
      })

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          action: 'subscription.trial_started',
          entityType: 'TenantSubscription',
          entityId: sub.id,
          afterJson: {
            planCode: sub.planCode,
            trialEndsAt: trialEndsAt.toISOString(),
            analysisCap: TRIAL_POLICY.analysisCap,
          } as Prisma.InputJsonValue,
        },
      })

      return sub
    })

    return { kind: 'created', subscription }
  } catch (error) {
    // Lost a race on the unique claimKey → treat as duplicate.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const racedClaim = await prisma.trialClaim.findUnique({ where: { claimKey } })
      if (racedClaim && racedClaim.tenantId === input.tenantId) {
        const sub = await prisma.tenantSubscription.findUnique({
          where: { tenantId: input.tenantId },
        })
        if (sub) return { kind: 'existing', subscription: sub }
      }
      const lead = await prisma.salesLead.create({
        data: {
          kind: SalesLeadKind.TRIAL_BLOCKED_DUPLICATE,
          email: ownerEmail,
          emailDomain: domain,
          normalizedOrg,
          requestedPlan: TenantPlan.PRO,
          clerkUserId: input.clerkUserId,
          tenantId: input.tenantId,
          metadataJson: { claimKey } as Prisma.InputJsonValue,
        },
      })
      return {
        kind: 'blocked',
        leadId: lead.id,
        reason: personal ? 'duplicate_owner_org' : 'duplicate_domain',
      }
    }
    throw error
  }
}
