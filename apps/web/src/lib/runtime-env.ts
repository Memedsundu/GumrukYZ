/** Shared production detection — use instead of ad-hoc NODE_ENV checks. */
export function isProduction(): boolean {
  const vercelEnv = process.env['VERCEL_ENV']
  if (vercelEnv) return vercelEnv === 'production'
  return process.env['NODE_ENV'] === 'production'
}

/** Sync in-request processing is allowed only in dev or when explicitly overridden. */
export function allowsSyncProcessingFallback(): boolean {
  if (process.env['PROCESSING_ALLOW_SYNC_FALLBACK'] === 'true') return true
  return !isProduction()
}

export function isAsyncProcessingRequired(): boolean {
  return isProduction() && !allowsSyncProcessingFallback()
}
