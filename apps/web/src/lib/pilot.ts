import { DataClassification, TenantPlan } from '@gumrukyz/domain'

/** Default classification for new pilot submissions (REAL requires explicit opt-in). */
export const PILOT_DEFAULT_DATA_CLASSIFICATION = DataClassification.REDACTED

export const PILOT_TENANT_CLASSIFICATIONS = [
  DataClassification.SYNTHETIC,
  DataClassification.REDACTED,
  DataClassification.REAL,
] as const

export const INTERNAL_TENANT_CLASSIFICATIONS = PILOT_TENANT_CLASSIFICATIONS

export function isInternalOrg(clerkOrgId: string): boolean {
  const internalId = process.env['INTERNAL_TENANT_CLERK_ORG_ID']?.trim()
  return Boolean(internalId && clerkOrgId === internalId)
}

export function tenantPlanForOrg(clerkOrgId: string): string {
  return isInternalOrg(clerkOrgId) ? TenantPlan.INTERNAL : TenantPlan.PILOT
}

export function classificationsForOrg(clerkOrgId: string): string[] {
  return [...(isInternalOrg(clerkOrgId) ? INTERNAL_TENANT_CLASSIFICATIONS : PILOT_TENANT_CLASSIFICATIONS)]
}

export const PILOT_DISCLAIMER_VERSION = '2026-05-19'
