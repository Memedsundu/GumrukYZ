// Commercial plan catalog — the single source of truth for public pricing,
// tier limits and trial policy. Pure data + helpers (no Prisma / no I/O) so it
// can be imported by both the web app and the db package.
//
// Money is stored in *kuruş* (integer, 1 TRY = 100 kuruş) and excludes KDV.

/** Internal codes for the three purchasable public tiers. */
export type PurchasablePlanCode = 'plus' | 'pro' | 'max'

export interface PlanLimits {
  /** Completed analyses allowed per billing period. */
  analysesPerMonth: number
  /** Seats (active users) allowed. */
  users: number
  /** Expert AI reviews allowed per billing period. */
  expertReviewsPerMonth: number
  /** Documents allowed per single submission. */
  documentsPerSubmission: number
}

export interface PlanPrice {
  /** Monthly price in kuruş, KDV excluded. */
  monthlyKurus: number
  /** Annual price in kuruş, KDV excluded. `null` => custom / contact sales. */
  annualKurus: number | null
}

export interface PlanCatalogEntry {
  code: PurchasablePlanCode
  /** Turkish public name shown in UI. */
  publicName: string
  /** Highlight this tier as "Önerilen" in the pricing grid. */
  recommended: boolean
  price: PlanPrice
  limits: PlanLimits
  /** Annual-discount sales copy. */
  annualCopy: string
  cta: { label: string; kind: 'trial' | 'contact' }
  /** Custom-sales tier (Kurumsal): price/limits are starting points only. */
  customPricing: boolean
}

export const KDV_NOTE = 'Fiyatlar KDV hariçtir' as const
const ANNUAL_COPY = '2 ay bedava / %17 yıllık indirim' as const

export const PLAN_CATALOG: Record<PurchasablePlanCode, PlanCatalogEntry> = {
  plus: {
    code: 'plus',
    publicName: 'Başlangıç',
    recommended: false,
    price: { monthlyKurus: 490_000, annualKurus: 4_900_000 },
    limits: {
      analysesPerMonth: 20,
      users: 1,
      expertReviewsPerMonth: 2,
      documentsPerSubmission: 8,
    },
    annualCopy: ANNUAL_COPY,
    cta: { label: 'Başlangıç ile devam et', kind: 'trial' },
    customPricing: false,
  },
  pro: {
    code: 'pro',
    publicName: 'Firma',
    recommended: true,
    price: { monthlyKurus: 1_490_000, annualKurus: 14_900_000 },
    limits: {
      analysesPerMonth: 100,
      users: 5,
      expertReviewsPerMonth: 10,
      documentsPerSubmission: 25,
    },
    annualCopy: ANNUAL_COPY,
    cta: { label: '14 gün ücretsiz Firma denemesi', kind: 'trial' },
    customPricing: false,
  },
  max: {
    code: 'max',
    publicName: 'Kurumsal',
    recommended: false,
    price: { monthlyKurus: 3_990_000, annualKurus: null },
    limits: {
      analysesPerMonth: 400,
      users: 15,
      expertReviewsPerMonth: 40,
      documentsPerSubmission: 50,
    },
    annualCopy: ANNUAL_COPY,
    cta: { label: 'Bizimle iletişime geçin', kind: 'contact' },
    customPricing: true,
  },
}

/** Firma trial policy: 14 days OR 15 first-run analyses, whichever comes first. */
export const TRIAL_POLICY = {
  planCode: 'pro',
  durationDays: 14,
  analysisCap: 15,
  caps: {
    users: 5,
    expertReviews: 2,
  },
  requiresCard: false,
} as const

/** Default grace window for migrated pilot/legacy tenants (days). */
export const LEGACY_GRACE_DAYS = 30

export function isPurchasablePlan(code: string): code is PurchasablePlanCode {
  return code === 'plus' || code === 'pro' || code === 'max'
}

/**
 * Resolve the effective limits for a plan, merging any per-tenant overrides
 * (used by Kurumsal / custom subscriptions). Non-purchasable plans
 * (internal/pilot) fall back to the most generous catalog tier so internal
 * usage is never accidentally throttled.
 */
export function planLimits(
  planCode: string,
  override?: Partial<PlanLimits> | null,
): PlanLimits {
  const base = isPurchasablePlan(planCode)
    ? PLAN_CATALOG[planCode].limits
    : PLAN_CATALOG.max.limits
  if (!override) return { ...base }
  return {
    analysesPerMonth: override.analysesPerMonth ?? base.analysesPerMonth,
    users: override.users ?? base.users,
    expertReviewsPerMonth: override.expertReviewsPerMonth ?? base.expertReviewsPerMonth,
    documentsPerSubmission: override.documentsPerSubmission ?? base.documentsPerSubmission,
  }
}

/** Ordered list for rendering the pricing grid (Başlangıç → Firma → Kurumsal). */
export const PLAN_CATALOG_ORDER: PurchasablePlanCode[] = ['plus', 'pro', 'max']
