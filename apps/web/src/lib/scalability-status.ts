import { isDistributedRateLimitEnabled, pingRateLimitRedis } from './rate-limit'
import { getSpendLimits, isSpendGuardEnabled } from './spend-guard'

export type ScalabilityStatus = {
  distributedRateLimit: boolean
  rateLimitRedisOk: boolean | null
  spendGuard: boolean
  spendLimits: {
    tenantUsdPerHour: number
    globalUsdPerHour: number
  }
}

export async function getScalabilityStatus(): Promise<ScalabilityStatus> {
  const distributedRateLimit = isDistributedRateLimitEnabled()
  return {
    distributedRateLimit,
    rateLimitRedisOk: distributedRateLimit ? await pingRateLimitRedis() : null,
    spendGuard: isSpendGuardEnabled(),
    spendLimits: getSpendLimits(),
  }
}
