import { queue } from '@trigger.dev/sdk'

function parseEnvInt(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

/** Global cap — limits concurrent submission runs across all tenants. */
export const submissionProcessingQueue = queue({
  name: 'submission-processing',
  concurrencyLimit: parseEnvInt('TRIGGER_GLOBAL_CONCURRENCY', 15),
})

/** Per-tenant fairness — use with concurrencyKey: tenantId when triggering. */
export const tenantSubmissionQueue = queue({
  name: 'submission-per-tenant',
  concurrencyLimit: parseEnvInt('TRIGGER_TENANT_CONCURRENCY', 2),
})

export const classificationQueue = queue({
  name: 'submission-classification',
  concurrencyLimit: parseEnvInt('TRIGGER_CLASSIFICATION_CONCURRENCY', 10),
})

export const expertReviewQueue = queue({
  name: 'expert-review',
  concurrencyLimit: parseEnvInt('TRIGGER_EXPERT_REVIEW_CONCURRENCY', 5),
})
