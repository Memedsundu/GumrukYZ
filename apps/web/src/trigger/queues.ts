import { queue } from '@trigger.dev/sdk'

function parseEnvInt(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

/** Per-tenant cap when triggering with concurrencyKey: tenantId. */
export const submissionProcessingQueue = queue({
  name: 'submission-processing',
  concurrencyLimit: parseEnvInt('TRIGGER_TENANT_CONCURRENCY', 2),
})

/** @deprecated Use submissionProcessingQueue + concurrencyKey instead. Kept for deploy compatibility. */
export const tenantSubmissionQueue = queue({
  name: 'submission-per-tenant',
  concurrencyLimit: parseEnvInt('TRIGGER_TENANT_CONCURRENCY', 2),
})

export const classificationQueue = queue({
  name: 'submission-classification',
  concurrencyLimit: parseEnvInt('TRIGGER_TENANT_CONCURRENCY', 2),
})

export const expertReviewQueue = queue({
  name: 'expert-review',
  concurrencyLimit: parseEnvInt('TRIGGER_EXPERT_REVIEW_CONCURRENCY', 5),
})
